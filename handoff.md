# Handoff

State of the plug-in solar payback calculator as of 2026-10-20, for continuing in a Claude Code session on burgan. Read `CLAUDE.md` first for commands and architecture.

## Where things are

- **Code:** branch `ui` on `github.com/glenmo/plugin-solar-payback` (public), commit `83f8b8c` plus this file. Not merged to `main` and no PR open yet.
- **Checkout on burgan:** `~/plugin-solar-payback` (cloned from `ui`).
- **Deployed files:** `/var/www/payback/` (owned by `glen`), copied from the checkout with:
  ```bash
  cd ~/plugin-solar-payback && git pull && rsync -av --delete index.html src data /var/www/payback/ && chmod -R a+rX /var/www/payback
  ```
  Only `index.html`, `src/` and `data/` are deployed.

## Done

- Built the UI: `index.html` (layout, CSS tokens for light and dark) and `src/app.js` (form, results, cash flow and typical-day SVG charts with tooltips).
- Fixed a browser-only crash: `engine.js` and `presets.js` both declared a top-level `const api`. The export in presets is now `presetsApi`.
- Added `CLAUDE.md` and updated the README.
- `node tests/engine.test.js` passes.
- Checked in headless Chrome at desktop and 390 px width, dark mode only. Light mode hasn't been looked at.

## Open: wrong vhost

Goal URL: **https://tools.smartenergylab.software/payback/** (as planned in the README).

The site is in `/etc/apache2/sites-available/smartenergylab.conf`. Every smartenergylab.software vhost in that file forwards `/` to a gunicorn/Flask app on `127.0.0.1:8000`, so `/payback/` needs a `ProxyPass … !` exclusion plus an `Alias`, placed **before** `ProxyPass /`:

```apache
    RedirectMatch ^/payback$ /payback/
    ProxyPass        /payback/  !
    Alias            /payback/  /var/www/payback/
    <Directory /var/www/payback>
        Require all granted
        Options -Indexes
    </Directory>
```

Those lines were added to the **apex** `smartenergylab.software` `*:443` block (around line 62) instead of the `tools.smartenergylab.software` `*:443` block (around line 197). At handoff:

- `https://smartenergylab.software/payback/` returns 200 (works, but it's the wrong host)
- `https://tools.smartenergylab.software/payback/` returns 404 from gunicorn

To fix it, move the block into the tools `*:443` vhost, just above its `ProxyPass / http://127.0.0.1:8000/`, then:

```bash
sudo apache2ctl configtest && sudo systemctl reload apache2
curl -sI https://tools.smartenergylab.software/payback/ | head -1                   # expect 200
curl -s https://tools.smartenergylab.software/payback/data/yield.json | head -c 80  # expect JSON
curl -s -o /dev/null -w "%{http_code}\n" https://tools.smartenergylab.software/     # app still 200
curl -s -o /dev/null -w "%{http_code}\n" https://smartenergylab.software/payback/   # 404 once moved
```

Backups: `smartenergylab.conf.bak-payback` (before any payback edit) and possibly `.bak-payback2`. The server hosts many unrelated sites, so always run `configtest` before a reload. Editing needs `sudo` with a password.

## Not done yet

- Open a PR from `ui` and merge it to `main`.
- Check the yield table (`data/yield.json`) against CEC tables or PVGIS, and kit prices in `src/presets.js` against current retail listings. Both are marked provisional, and the page says so.
- Battery-only TOU scenario: the test only asserts saving > 0, but the 15-year net is about −$988, so it never pays back. Consider a stronger check, or review the preset price.
- Check the page in light mode.
- Confirm the footer entity, "Smart Energy Lab Services Pty Ltd".

## Notes

- SSH from the dev Mac to burgan timed out for a while after several quick connections (possibly fail2ban). Avoid hammering port 22.
