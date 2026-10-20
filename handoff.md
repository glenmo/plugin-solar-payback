# Handoff

State of the plug-in solar payback calculator as of 2026-10-20, for continuing in a Claude Code session on burgan. Read `CLAUDE.md` first for commands and architecture.

## Where things are

- **Code:** branch `ui` on `github.com/glenmo/plugin-solar-payback` (public), PR open against `main`, not merged yet.
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

## Live: Apache vhost

Live at **https://tools.smartenergylab.software/payback/** (as planned in the README).

The site is in `/etc/apache2/sites-available/smartenergylab.conf`. Every smartenergylab.software vhost in that file forwards `/` to a gunicorn/Flask app on `127.0.0.1:8000`. The `tools.smartenergylab.software` `*:443` block (around line 197) therefore has these lines **before** its `ProxyPass /`:

```apache
    RedirectMatch ^/payback$ /payback/
    ProxyPass        /payback/  !
    ProxyPassMatch   ^/payback$  !
    Alias            /payback/  /var/www/payback/
    <Directory /var/www/payback>
        Require all granted
        Options -Indexes
    </Directory>
```

The `ProxyPassMatch` line is needed for the no-slash redirect. Without it, mod_proxy hands `/payback` to gunicorn (404) before `RedirectMatch` runs. The redirect is a 302 (the `RedirectMatch` default).

The block was first put in the apex `smartenergylab.software` vhost by mistake. It was moved on 2026-10-20 and nothing for payback remains there. Checks:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://tools.smartenergylab.software/payback  # 302 to /payback/
curl -sI https://tools.smartenergylab.software/payback/ | head -1                   # 200
curl -s https://tools.smartenergylab.software/payback/data/yield.json | head -c 80  # JSON
curl -s -o /dev/null -w "%{http_code}\n" https://tools.smartenergylab.software/     # app still 200
curl -s -o /dev/null -w "%{http_code}\n" https://smartenergylab.software/payback/   # 404
```

Backups in `sites-available/`:

- `smartenergylab.conf.bak-payback`: before any payback edit
- `.bak-payback2`: block in the wrong (apex) vhost
- `.bak-payback3`: block in the tools vhost, without the `ProxyPassMatch` line

The server hosts many unrelated sites, so always run `configtest` before a reload. Editing needs `sudo` with a password. Claude can't enter it, so it writes the new file to its scratchpad and you copy it into place.

## Not done yet

- Merge the PR from `ui` to `main`.
- Check the yield table (`data/yield.json`) against CEC tables or PVGIS, and kit prices in `src/presets.js` against current retail listings. Both are marked provisional, and the page says so.
- Battery-only TOU scenario: the test only asserts saving > 0, but the 15-year net is about −$988, so it never pays back. Consider a stronger check, or review the preset price.
- Check the page in light mode.
- Confirm the footer entity, "Smart Energy Lab Services Pty Ltd".

## Notes

- SSH from the dev Mac to burgan timed out for a while after several quick connections (possibly fail2ban). Avoid hammering port 22.
