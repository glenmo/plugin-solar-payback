# Handoff

State of the plug-in solar payback calculator as of 2026-10-20, for continuing in a Claude Code session on burgan. Read `CLAUDE.md` first for commands and architecture.

## Where things are

- **Code:** `main` on `github.com/glenmo/plugin-solar-payback` (public). Everything is merged (PRs #1 to #9) and only `main` remains.
- **Checkout on burgan:** `~/plugin-solar-payback`, on `main`.
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
- Checked in headless Chrome at desktop and 390 px width, in light and dark.
- Fixed TOU battery dispatch: the battery used to spend its overnight charge in the morning shoulder and was empty by the 3 pm peak. It now keeps a peak reserve. Battery only on TOU went from $29/yr (never pays back) to $105/yr (12.3 years). Tests now check that battery output is worth the peak rate, and that PV still refills the battery on TOU.
- Replaced the yield table with PVGIS-ERA5 values and spot checked the flat column against BoM solar exposure for all 8 cities. Annual totals are within -3.7% to +5.5%, and the worst month is 10.8% off (results in `docs/METHOD.md`). Tilted and vertical have no BoM equivalent.
- Fixed the battery checkbox: ticking "Include a plug-in battery" on the solar-only kit used to keep the $1,200 cost, so the battery was modelled for free. It now switches to the matching solar kit (`toggleBattery()` in `src/app.js`), which sets the cost and battery fields. Unticking on battery only goes to solar only. Toggling resets panel watts and cost to the preset, like picking a kit. Picking the battery-only kit on the flat tariff switches to TOU. Leaving that kit, by checkbox or dropdown, switches back to flat and keeps any custom flat rate, unless the tariff was changed in between (`tariffBeforeBatteryOnly` in `src/app.js`).
- Footer entity "Smart Energy Lab Services Pty Ltd" confirmed correct by Glen (2026-10-20).
- Added an Auto / Light / Dark theme control in the header. The choice is saved in `localStorage` (`theme`, absent for auto), and an inline script in `<head>` applies it before first paint.

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

- Kit prices in `src/presets.js` stay provisional. Checked 2026-10-20: plug-in systems aren't yet legal to connect in Australia, so there's no local retail market. The one AU listing (Sunplug, 960 W + 800 W micro, A$1,398 preorder) supports the $1,200 solar kit. German prices suggest the battery kits ($2,400 and $1,500) are high. Revisit once AU pricing exists.
- The page has a "Not yet legal in Australia" notice under the header (`.notice` in `index.html`). Update or remove it when the rules change.

## Notes

- SSH from the dev Mac to burgan timed out for a while after several quick connections (possibly fail2ban). Avoid hammering port 22.
