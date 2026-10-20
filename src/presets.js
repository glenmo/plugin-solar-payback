// Kit presets and household occupancy profiles.
// Prices and specs are placeholders to be confirmed against current retail listings.

const kits = {
  solar_only_800: {
    name: 'Two panel plug-in solar (800 W microinverter)',
    panelWatts: 880,
    inverterCapWatts: 800,
    battery: null,
    costDollars: 1200,
  },
  solar_battery_2kwh: {
    name: 'Two panels plus 2 kWh plug-in battery',
    panelWatts: 880,
    inverterCapWatts: 800,
    battery: { usableKWh: 1.9, chargeWatts: 800, dischargeWatts: 800, roundTripEff: 0.85, gridCharge: true },
    costDollars: 2400,
  },
  battery_only_2kwh: {
    name: 'Plug-in battery only, TOU arbitrage',
    panelWatts: 0,
    inverterCapWatts: 800,
    battery: { usableKWh: 1.9, chargeWatts: 800, dischargeWatts: 800, roundTripEff: 0.85, gridCharge: true },
    costDollars: 1500,
  },
};

const occupancy = {
  home_all_day: { name: 'Home most of the day', baseload: 250, morning: 500, day: 400, evening: 900 },
  out_during_day: { name: 'Out during the day', baseload: 250, morning: 500, day: 50, evening: 1000 },
  shift_worker: { name: 'Shift worker, home daytime, out evenings', baseload: 250, morning: 300, day: 500, evening: 300 },
};

const tariffs = {
  flat_32: { name: 'Flat 32 c/kWh', type: 'flat', flat: 32 },
  tou_vic: { name: 'Time of use (example)', type: 'tou', peak: 40, shoulder: 28, offPeak: 20, peakStart: 15, peakEnd: 21, offPeakStart: 22, offPeakEnd: 7 },
};

const presetsApi = { kits, occupancy, tariffs };
if (typeof module !== 'undefined') module.exports = presetsApi;
if (typeof window !== 'undefined') window.PaybackPresets = presetsApi;
