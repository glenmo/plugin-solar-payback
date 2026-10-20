# Handoff

State of the plug-in solar payback calculator as of 2026-10-20, for continuing in a Claude Code session on burgan. Read `CLAUDE.md` first for commands and architecture.

## Where things are

- **Code:** `main` on `github.com/glenmo/plugin-solar-payback` (public). All PRs are merged and only `main` remains.
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
- Fixed the battery checkbox: ticking "Include a plug-in battery" on the solar-only kit used to keep the $1,200 cost, so the battery was modelled for free. It now switches to the matching solar kit (`toggleBattery()` in `src/app.js`), which sets the cost and battery fields. Unticking on battery only goes to solar only. Toggling resets panel watts and cost to the preset, like picking a kit.
- Fixed the tariff staying on TOU after leaving the battery-only kit. Picking that kit on the flat tariff switches to TOU, because arbitrage needs it. Leaving it, by checkbox or dropdown, used to leave TOU on, so solar-only payback showed 3.1 years instead of 2.9. It now switches back to flat and keeps any custom flat rate, unless you changed the tariff in between (`tariffBeforeBatteryOnly` in `src/app.js`).
- Footer entity "Smart Energy Lab Services Pty Ltd" confirmed correct by Glen (2026-10-20).
- Added an Auto / Light / Dark theme control in the header. The choice is saved in `localStorage` (`theme`, absent for auto), and an inline script in `<head>` applies it before first paint.
- Replaced the fixed 32 c/kWh flat tariff with each city's 2026–27 default offer (PR #13, deployed 2026-10-20). `presets.defaultOffers` holds one rate per city for the network covering the CBD: the VDO in Melbourne, the DMO in Sydney, Brisbane and Adelaide, and the regulated tariff elsewhere. The tariff option is now `default_offer`. The source shows under the rate field, and changing city resets the rate. Melbourne default payback went from 2.9 to 3.5 years. Rates and sources are in `docs/METHOD.md`. `engine.defaults` still uses 32c, so test results didn't change.
- Added the real Victorian Default Offer TOU as `tou_vdo` (PR #15, deployed 2026-10-20): CitiPower 38.31 c peak 4–9 pm, 16.59 c solar soak 11 am–4 pm, 21.17 c otherwise. The solar soak goes in the engine's `offPeak` and the VDO's "off-peak" in `shoulder`; the hint under the TOU fields explains this. `rateForHour` now accepts an off-peak window inside the day, and grid charging leaves room for PV surplus due before the next peak. That second change moved solar plus battery on the example TOU from $462 to $459 a year. The battery-only kit switches to the VDO TOU in Melbourne and to the example elsewhere, and follows city changes. Melbourne, out during the day: battery only on VDO pays back in 11.0 years, solar plus battery in 6.2. Kit, city and tariff switching (including the default offer) were checked in headless Chromium, locally and on the live site.
- Added DMO TOU presets for Sydney (`tou_ausgrid`), Brisbane (`tou_energex`) and Adelaide (`tou_sapn`) (PR #17, deployed 2026-10-20). The battery-only kit now picks each city's own TOU from `presets.touByCity`, and the example elsewhere. The engine works from TOU periods per hour and month (`periodForHour`). It supports several windows (`peakWindows`, `offPeakWindows`, for SAPN's 6–10 am and 4 pm–midnight peaks) and `peakMonths` (Ausgrid's peak applies Nov–Mar and Jun–Aug only). A day with no peak runs the battery as on a flat tariff. Grid-charge headroom now looks across midnight to the next morning's PV, less shoulder use before it. Without this, Ausgrid's 9 pm–3 pm off-peak filled the battery overnight and exported the PV. Solar plus battery on the example TOU moved from $459 to $463 a year. Battery-only payback, out during the day: Sydney 9.9 years, Brisbane 5.6, Adelaide 6.1. Checked in headless Chromium locally and on the live site.
- Added TOU presets for the other four cities (PR #19, deployed 2026-10-20), so every city has its own in `presets.touByCity`: Perth `tou_synergy` (Synergy Midday Saver), Hobart `tou_aurora` (Aurora tariff 93), Canberra `tou_actewagl` (ActewAGL Home TOU) and Darwin `tou_jacana`. Hobart, Canberra and Darwin come from the regulator's or retailer's own documents. Aurora's peak is weekdays only, so the engine gained `peakWeekdaysOnly`: each month also runs a weekend day with no peak, weighted 5:2, and carry-over from Friday isn't modelled. Battery-only payback, out during the day: Perth 5.0 years, Hobart 9.2, Canberra 13.7, Darwin never ($18 a year; its midday rate is only 7 c cheaper). The example `tou_vic` stays in the dropdown but no city picks it. Checked in headless Chromium locally and on the live site.
- Switched Hobart's flat default from Aurora tariff 31 (27.95 c, closed to new connections) to Tariff 32, Residential Single Rate (24.75 c), from the OTTER 2026–27 schedule (deployed 2026-10-20).

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
- Verify the default offer rates before promoting the calculator. Sydney (Ausgrid 33.14), Brisbane (Energex 27.97) and Adelaide (SAPN 41.91) come from comparison sites, because the DMO caps the annual bill rather than setting a usage rate. Each adds up to the AER's final annual DMO price to within $1, but none was checked against the AER determination, because aer.gov.au downloads kept timing out from burgan. Perth (Synergy A1 33.26) is also from secondary sources. Melbourne, Hobart, Canberra and Darwin come from the regulator's or retailer's own documents.
- Verify the DMO TOU rates against the AER final determination (Appendix C). They come from wattmaths.com.au, which cites the AER only for Ausgrid's off-peak rate. They can't be checked against the annual DMO price without the AER's usage split. Sources disagree on whether Ausgrid's peak is seasonal, and on SAPN's rates (another site gives 58.84 peak and 35.17 c off-peak). Energex's 6.98 c off-peak looks low and is the one to check first. VDO TOU rates for the other Victorian zones are in the ESC determination, Schedule 3.
- Perth's Midday Saver rates come from two secondary sites quoting Synergy's brochure. They agree to four decimal places but weren't checked against synergy.net.au. ActewAGL's TOU times are in AEST, so they run an hour later on the clock in daylight saving; the engine ignores this.
- The page has a "Not yet legal in Australia" notice under the header (`.notice` in `index.html`). Update or remove it when the rules change.

## Notes

- SSH from the dev Mac to burgan timed out for a while after several quick connections (possibly fail2ban). Avoid hammering port 22.
- Port 8765 on burgan is taken by another app (it returns FastAPI `{"detail":"Not Found"}`). To preview locally, serve on a free port bound to 127.0.0.1.
