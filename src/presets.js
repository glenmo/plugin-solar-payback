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

// Default (reference) flat usage rate per city, c/kWh including GST, 1 July 2026 to 30 June 2027.
// Each city uses the network that covers its CBD. Supply charges are left out because
// plug-in solar doesn't change them.
const defaultOffers = {
  melbourne: { flat: 25.96, source: 'Victorian Default Offer 2026–27, CitiPower' },
  sydney: { flat: 33.14, source: 'Default Market Offer 2026–27, Ausgrid' },
  brisbane: { flat: 27.97, source: 'Default Market Offer 2026–27, Energex' },
  adelaide: { flat: 41.91, source: 'Default Market Offer 2026–27, SA Power Networks' },
  perth: { flat: 33.26, source: 'Synergy A1 regulated tariff 2026–27' },
  hobart: { flat: 24.75, source: 'Aurora Energy tariff 32 regulated price 2026–27' },
  canberra: { flat: 36.95, source: 'ActewAGL standing offer (Home) 2026–27' },
  darwin: { flat: 31.68, source: 'Jacana Energy regulated residential tariff 2026–27' },
};

const tariffs = {
  default_offer: { name: 'Default offer for your city (flat)', type: 'flat', flat: 32 },
  // VDO three-period TOU (ESC VDO 2026–27 Price Determination, Schedule 3, CitiPower). The VDO's
  // solar soak is the cheapest period so it maps to offPeak; the VDO's "off-peak" maps to shoulder.
  tou_vdo: {
    name: 'Victorian Default Offer time of use (CitiPower)', type: 'tou', peak: 38.31, shoulder: 21.17, offPeak: 16.59,
    peakStart: 16, peakEnd: 21, offPeakStart: 11, offPeakEnd: 16,
    windows: 'Peak 4 pm to 9 pm. Off-peak is the VDO solar soak, 11 am to 4 pm. Shoulder is the VDO off-peak rate, all other times.',
  },
  // DMO 2026–27 time of use, from secondary sources (see docs/METHOD.md). Unverified against the AER.
  // Ausgrid has two periods; its peak only applies Nov to Mar and Jun to Aug, so shoulder is set to off-peak.
  tou_ausgrid: {
    name: 'Default Market Offer time of use (Ausgrid)', type: 'tou', peak: 60.2, shoulder: 24.04, offPeak: 24.04,
    peakStart: 15, peakEnd: 21, offPeakStart: 21, offPeakEnd: 15, peakMonths: [0, 1, 2, 5, 6, 7, 10, 11],
    windows: 'Peak 3 pm to 9 pm, November to March and June to August. Off-peak at all other times, all day in April, May, September and October. No shoulder.',
  },
  tou_energex: {
    name: 'Default Market Offer time of use (Energex)', type: 'tou', peak: 47.79, shoulder: 25.3, offPeak: 6.98,
    peakStart: 16, peakEnd: 21, offPeakStart: 11, offPeakEnd: 16,
    windows: 'Peak 4 pm to 9 pm, off-peak 11 am to 4 pm, shoulder 9 pm to 11 am.',
  },
  // SAPN's solar sponge is the cheapest period so it maps to offPeak; its overnight "off-peak" maps to shoulder.
  tou_sapn: {
    name: 'Default Market Offer time of use (SA Power Networks)', type: 'tou', peak: 56.22, shoulder: 32.55, offPeak: 17.04,
    peakWindows: [[6, 10], [16, 24]], offPeakWindows: [[10, 16]],
    windows: 'Peak 6 am to 10 am and 4 pm to midnight. Off-peak is the solar sponge, 10 am to 4 pm. Shoulder is the overnight off-peak rate, midnight to 6 am.',
  },
  // Synergy Midday Saver 2026–27, from secondary sources quoting Synergy's brochure. The midday
  // "super off-peak" maps to offPeak; the overnight off-peak maps to shoulder.
  tou_synergy: {
    name: 'Synergy Midday Saver time of use', type: 'tou', peak: 55.33, shoulder: 24.34, offPeak: 8.85,
    peakStart: 15, peakEnd: 21, offPeakStart: 9, offPeakEnd: 15,
    windows: 'Peak 3 pm to 9 pm. Off-peak is the super off-peak, 9 am to 3 pm. Shoulder is the overnight off-peak rate, 9 pm to 9 am.',
  },
  // Aurora tariff 93 (OTTER 2026–27 standing offer schedule). Two periods; the peak is weekdays only.
  tou_aurora: {
    name: 'Aurora Energy time of use (tariff 93)', type: 'tou', peak: 36.19, shoulder: 17.02, offPeak: 17.02,
    peakWindows: [[7, 10], [16, 21]], offPeakWindows: [[10, 16], [21, 7]], peakWeekdaysOnly: true,
    windows: 'Peak 7 am to 10 am and 4 pm to 9 pm on weekdays. Off-peak at all other times and all weekend. No shoulder.',
  },
  // ActewAGL Home Time-of-use (ACT Standard plan prices from 1 July 2026).
  tou_actewagl: {
    name: 'ActewAGL Home time of use', type: 'tou', peak: 49.72, shoulder: 33.57, offPeak: 29.92,
    peakWindows: [[7, 9], [17, 20]], offPeakWindows: [[22, 7]],
    windows: 'Peak 7 am to 9 am and 5 pm to 8 pm. Shoulder 9 am to 5 pm and 8 pm to 10 pm. Off-peak 10 pm to 7 am.',
  },
  // Jacana Energy residential time of use (Jacana pricing page, 1 July 2026). Two periods: a cheaper
  // midday rate (offPeak) and one rate at all other times (peak).
  tou_jacana: {
    name: 'Jacana Energy time of use', type: 'tou', peak: 33.22, shoulder: 33.22, offPeak: 25.83,
    peakStart: 15, peakEnd: 9, offPeakStart: 9, offPeakEnd: 15,
    windows: 'Off-peak 9 am to 3 pm. Peak at all other times. No shoulder.',
  },
  tou_vic: {
    name: 'Time of use (example)', type: 'tou', peak: 40, shoulder: 28, offPeak: 20, peakStart: 15, peakEnd: 21, offPeakStart: 22, offPeakEnd: 7,
    windows: 'Peak 3 pm to 9 pm, off-peak 10 pm to 7 am, shoulder otherwise.',
  },
};

// Each city's real TOU tariff. A city not listed uses the example.
const touByCity = {
  melbourne: 'tou_vdo', sydney: 'tou_ausgrid', brisbane: 'tou_energex', adelaide: 'tou_sapn',
  perth: 'tou_synergy', hobart: 'tou_aurora', canberra: 'tou_actewagl', darwin: 'tou_jacana',
};

const presetsApi = { kits, occupancy, tariffs, defaultOffers, touByCity };
if (typeof module !== 'undefined') module.exports = presetsApi;
if (typeof window !== 'undefined') window.PaybackPresets = presetsApi;
