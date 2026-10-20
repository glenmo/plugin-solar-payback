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
   peak rate x round trip efficiency beats the off-peak rate

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
