# Calculation method

## Generation
Monthly peak sun hours (PSH) per city and mounting from `data/yield.json`, multiplied by
panel DC watts, a system efficiency (default 85%) and a shading loss. The day's energy is
spread across daylight hours with a cosine squared shape whose width tracks day length,
then clipped hour by hour at the inverter output cap (default 800 W).

## Load
A four part profile: baseload (24 h), morning bump (6 to 9), daytime (9 to 17), evening
(17 to 22). Occupancy presets set these.

## Dispatch, each hour
1. PV meets load directly
2. Surplus PV charges the battery (charge rate and capacity limited)
3. Remaining surplus is exported at the feed-in rate (default 0 c)
4. Battery meets remaining load (discharge rate limited; held through off-peak on TOU)
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
- Yield table values are provisional and need verifying before release
