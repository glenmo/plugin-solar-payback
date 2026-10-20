# Calculation method

## Generation
Monthly peak sun hours (PSH) per city and mounting from `data/yield.json`, multiplied by
panel DC watts, a system efficiency (default 85%) and a shading loss. The day's energy is
spread across daylight hours with a cosine squared shape whose width tracks day length,
then clipped hour by hour at the inverter output cap (default 800 W).

The PSH values are PVGIS 5.3 monthly in-plane irradiation (MRcalc, PVGIS-ERA5, mean of
2005 to 2023, with terrain horizon) at each capital's CBD, converted to kWh/m2/day. All
mountings face north: `tilted` is sloped at the city's latitude, `flat` is horizontal and
`vertical` is a 90 degree slope. To refresh them, query
`https://re.jrc.ec.europa.eu/api/v5_3/MRcalc` with `raddatabase=PVGIS-ERA5`,
`aspect=180` (PVGIS counts 0 as south), `horirrad=1` for flat and `selectrad=1` with
`angle` for the others, then divide each month's total by its days and average the years.

### Check against BoM (2026-10-20)
The `flat` column was compared with BoM mean daily solar exposure (horizontal,
satellite-derived) from the extended climate statistics table for one station per city
(`https://www.bom.gov.au/climate/averages/tables/cw_<site>_All.shtml`, MJ/m2 divided by
3.6). BoM has no tilted-surface data, so `tilted` and `vertical` rest on PVGIS's
transposition alone.

| City | BoM site | Years | BoM kWh/m2/yr | Table | Diff | Worst month |
|---|---|---|---|---|---|---|
| Melbourne | 086338 Olympic Park | 1990-2026 | 1527 | 1586 | +3.9% | Sep +6.7% |
| Sydney | 066062 Observatory Hill | 1990-2026 | 1654 | 1715 | +3.7% | Nov +6.7% |
| Brisbane | 040913 Brisbane | 1990-2026 | 1877 | 1807 | -3.7% | Jun -9.2% |
| Adelaide | 023090 Kent Town | 1990-2026 | 1763 | 1808 | +2.5% | Sep +5.5% |
| Perth | 009225 Perth Metro | 1990-2026 | 1953 | 1966 | +0.7% | Jul -8.2% |
| Hobart | 094029 Ellerslie Road | 2007-2026 | 1351 | 1425 | +5.5% | Apr +10.8% |
| Canberra | 070351 Airport | 2007-2026 | 1703 | 1724 | +1.3% | Jun -7.8% |
| Darwin | 014015 Airport | 1990-2026 | 2175 | 2140 | -1.6% | Jun -5.5% |

PVGIS-ERA5 runs 1 to 6% above BoM in the southern cities and 2 to 4% below in Brisbane and
Darwin. That is small next to the other uncertainties, so the table was left as is.

## Load
A four part profile: baseload (24 h), morning bump (6 to 9), daytime (9 to 17), evening
(17 to 22). Occupancy presets set these.

## Tariff
The default tariff is a flat rate set from each city's default (reference) offer for
2026–27, c/kWh including GST, for the network that covers the CBD. These are
`presets.defaultOffers`:

| City | c/kWh | Offer | Source |
|---|---|---|---|
| Melbourne | 25.96 | Victorian Default Offer, CitiPower | ESC VDO 2026–27 Price Determination, Schedule 1 |
| Sydney | 33.14 | Default Market Offer, Ausgrid | Secondary sources (a) |
| Brisbane | 27.97 | Default Market Offer, Energex | Secondary sources (a) |
| Adelaide | 41.91 | Default Market Offer, SA Power Networks | Secondary sources (a) |
| Perth | 33.26 | Synergy A1, regulated | Secondary sources quoting Synergy's 1 July 2026 brochure |
| Hobart | 27.95 | Aurora tariff 31, regulated | OTTER 2026–27 standing offer schedule |
| Canberra | 36.95 | ActewAGL Home, standing offer | ActewAGL ACT Standard plan prices from 1 July 2026 |
| Darwin | 31.68 | Jacana residential, regulated | Jacana Energy pricing page |

(a) The DMO is an annual bill cap, not a usage rate. These rates were taken from comparison
sites, then checked against the AER's final annual DMO prices: supply plus rate times the
reference usage gives Ausgrid $1,898 (DMO $1,899 at 3,900 kWh), Energex $1,987 ($1,988 at
4,600 kWh) and SAPN $2,333 ($2,334 at 4,000 kWh). Check them against the AER final
determination before release.

Suburbs on other networks pay different rates (for example 27.35 to 31.98 c in other
Melbourne zones), so the rate stays editable. Changing city resets it to that city's offer.

TOU presets. The battery-only kit switches to the city's own (`presets.touByCity`) and to
the example elsewhere. Where a tariff's cheapest period is a midday solar soak, that is
the engine's `offPeak` and the tariff's own "off-peak" is the engine's `shoulder`.

| Preset | Peak | Shoulder | Off-peak | Source |
|---|---|---|---|---|
| `tou_vdo` Melbourne, VDO CitiPower | 38.31 c, 4 pm to 9 pm | 21.17 c, other times | 16.59 c solar soak, 11 am to 4 pm | ESC VDO 2026–27 Price Determination, Schedule 3 |
| `tou_ausgrid` Sydney, DMO | 60.20 c, 3 pm to 9 pm, Nov to Mar and Jun to Aug | none (set to off-peak) | 24.04 c, other times, and all day in Apr, May, Sep, Oct | Secondary sources (b) |
| `tou_energex` Brisbane, DMO | 47.79 c, 4 pm to 9 pm | 25.30 c, 9 pm to 11 am | 6.98 c, 11 am to 4 pm | Secondary sources (b) |
| `tou_sapn` Adelaide, DMO | 56.22 c, 6 am to 10 am and 4 pm to midnight | 32.55 c overnight, midnight to 6 am | 17.04 c solar sponge, 10 am to 4 pm | Secondary sources (b) |
| `tou_vic` example | 40 c, 3 pm to 9 pm | 28 c | 20 c, 10 pm to 7 am | Example only |

(b) Taken from wattmaths.com.au, which cites Appendix C of the AER final determination for
the Ausgrid off-peak rate but gives no document for the others. HomeBillLab and EcoFlow
give the same Ausgrid rates. The windows match each network's 2026–27 tariff structure
(Ausgrid via Amber, Energex's residential tariff page, SAPN's 2026–27 statement of
compliance). Unlike the flat rates, these can't be checked against the annual DMO price,
because that needs the AER's assumed usage split. Sources disagree on Ausgrid's peak
season and on SAPN's rates (another site gives 58.84 / 35.17 c). Check all three against
the AER final determination before release.

Windows can wrap midnight (22 to 7) or sit inside the day (11 to 16), and a tariff can
list several (`peakWindows`, `offPeakWindows`). With `peakMonths`, peak hours outside
those months are off-peak. A day with no peak hours has nothing to shift energy into, so
the battery then works as on a flat tariff: no holding, no reserve, no grid charging.

## Dispatch, each hour
1. PV meets load directly
2. Surplus PV charges the battery (charge rate and capacity limited)
3. Remaining surplus is exported at the feed-in rate (default 0 c)
4. Battery meets remaining load (discharge rate limited; held through off-peak on TOU).
   On TOU it also keeps a reserve through shoulder hours for the rest of the day's peak:
   the expected peak shortfall (capped at one full battery) less the PV surplus still
   due to refill it before the peak. This uses foresight of the typical day.
5. Grid meets the rest
6. On TOU with grid charging enabled, battery charges from grid during off-peak if
   peak rate x round trip efficiency beats the off-peak rate. It leaves room for the PV
   surplus still due before the next peak, looking across midnight to the next morning,
   less any shoulder use before that PV arrives. This stops a solar soak, or an off-peak
   that runs through the morning, filling the battery from the grid and exporting the PV

Each month is run twice so the battery state settles, then scaled by days in month.

## Cash flow
Year 1 saving, degraded 0.5%/yr and escalated 3%/yr, against upfront cost. Payback is
interpolated within the year it turns positive. No discounting in the default view.

## Known simplifications
- One typical day per month, no weather variability
- Battery losses applied symmetrically on charge and discharge
- No standby draw for the inverter or battery electronics
- No daily supply charge changes (plug-in does not change them)
- Yield values come from ERA5 reanalysis. Horizontal values agree with BoM within about
  6% a year (see above). Tilted and vertical values have no independent check
