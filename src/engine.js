// Plug-in solar and battery payback engine.
// Pure functions, no DOM. Works in node (CommonJS) and the browser (window.PaybackEngine).
//
// Method: for each month build a 24 hour typical day of generation and load,
// run a simple dispatch (self-consume, then battery, then grid), scale by days
// in the month, then roll annual savings into a multi-year cash flow.

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Daylight shape: fraction of the day's energy in each hour, centred on solar noon.
// Width widens in summer. Returned array sums to 1.
function diurnalShape(month) {
  // Day length in hours, rough southern hemisphere curve (Jan long, Jul short).
  const dayLen = 12 + 2.5 * Math.cos((month / 12) * 2 * Math.PI);
  const halfWidth = dayLen / 2;
  const shape = new Array(24).fill(0);
  let total = 0;
  for (let h = 0; h < 24; h++) {
    const t = h + 0.5 - 12.5; // hours from solar noon, solar noon ~12:30 local
    if (Math.abs(t) < halfWidth) {
      const v = Math.cos((Math.PI / 2) * (t / halfWidth));
      shape[h] = Math.max(0, v * v);
      total += shape[h];
    }
  }
  return shape.map((v) => v / total);
}

// Hourly generation (kWh per hour) for a typical day in the given month.
function hourlyGeneration(inputs, yieldTable, month) {
  const city = yieldTable.cities[inputs.city];
  if (!city) throw new Error(`Unknown city: ${inputs.city}`);
  const psh = city[inputs.mounting][month];
  const kwDC = inputs.panelWatts / 1000;
  const derate = (1 - inputs.shadingLoss) * inputs.systemEfficiency;
  const dayEnergy = kwDC * psh * derate; // kWh for the day before clipping
  const shape = diurnalShape(month);
  const capKWh = inputs.inverterCapWatts / 1000; // per hour
  return shape.map((f) => Math.min(dayEnergy * f, capKWh));
}

// Hourly load (kWh per hour) from a simple profile.
// profile: { baseload (W), morning (W, 6-9), day (W, 9-17), evening (W, 17-22) }
function hourlyLoad(profile) {
  const load = [];
  for (let h = 0; h < 24; h++) {
    let w = profile.baseload;
    if (h >= 6 && h < 9) w += profile.morning;
    else if (h >= 9 && h < 17) w += profile.day;
    else if (h >= 17 && h < 22) w += profile.evening;
    load.push(w / 1000);
  }
  return load;
}

// True if hour h falls in any [start, end) window. A window may wrap midnight (22 to 7).
function inWindows(h, windows) {
  return windows.some(([s, e]) => (s < e ? h >= s && h < e : h >= s || h < e));
}

// TOU period for an hour of a month (0 = Jan): 'peak', 'shoulder' or 'offPeak'.
// A tariff gives either peakStart/peakEnd and offPeakStart/offPeakEnd, or lists of
// windows in peakWindows/offPeakWindows. If it sets peakMonths, peak hours in other
// months are off-peak.
function periodForHour(tariff, h, month) {
  const peakMonth = !tariff.peakMonths || month === undefined || tariff.peakMonths.includes(month);
  const peak = tariff.peakWindows || [[tariff.peakStart, tariff.peakEnd]];
  if (inWindows(h, peak)) return peakMonth ? 'peak' : 'offPeak';
  const off = tariff.offPeakWindows || [[tariff.offPeakStart, tariff.offPeakEnd]];
  return inWindows(h, off) ? 'offPeak' : 'shoulder';
}

// Tariff rate (c/kWh) for an hour.
function rateForHour(tariff, h, month) {
  if (tariff.type === 'flat') return tariff.flat;
  return tariff[periodForHour(tariff, h, month)];
}

// Dispatch one typical day of a month (0 = Jan). Returns kWh totals and dollar saving for the day.
function dispatchDay(gen, load, battery, tariff, feedInCents, month) {
  let soc = 0; // kWh stored
  const cap = battery ? battery.usableKWh : 0;
  const maxCharge = battery ? battery.chargeWatts / 1000 : 0;
  const maxDischarge = battery ? battery.dischargeWatts / 1000 : 0;
  const eff = battery ? Math.sqrt(battery.roundTripEff) : 1; // split between charge and discharge

  let selfConsumed = 0, fromBattery = 0, exported = 0, imported = 0, gridCharged = 0;
  let savingCents = 0, costCents = 0;

  // On TOU, keep enough charge for the rest of today's peak hours rather than
  // spending it in the shoulder. reserve[h] is the battery output still wanted
  // in peak hours after h (at most a full battery), less the PV surplus expected
  // to top it up before then.
  // pvAhead[h] is the PV surplus still to come after hour h and before the next
  // peak, which grid charging leaves room for so it isn't exported instead.
  // A TOU day with no peak hours (outside peakMonths) has nothing to shift energy
  // into, so the battery then works as on a flat tariff.
  const period = [];
  for (let h = 0; h < 24; h++) period.push(tariff.type === 'tou' ? periodForHour(tariff, h, month) : 'flat');
  const shifting = period.includes('peak');
  const reserve = new Array(24).fill(0);
  const pvAhead = new Array(24).fill(0);
  if (cap > 0 && shifting) {
    let need = 0, refill = 0;
    for (let h = 23; h >= 0; h--) {
      reserve[h] = Math.max(0, Math.min(need, cap * eff) - refill * eff * eff);
      if (period[h] === 'peak') need += Math.min(Math.max(load[h] - gen[h], 0), maxDischarge);
      else if (need > 0) refill += Math.min(Math.max(gen[h] - load[h], 0), maxCharge);
    }
    // pvAhead runs over two days so an off-peak that starts after the evening peak
    // (9 pm to 3 pm) leaves room for the next morning's PV. Shoulder use before
    // that PV arrives frees room again, so it comes off.
    let ahead = 0;
    for (let i = 47; i >= 0; i--) {
      const h = i % 24;
      if (i < 24) pvAhead[h] = ahead;
      if (period[h] === 'peak') ahead = 0;
      else {
        ahead += Math.min(Math.max(gen[h] - load[h], 0), maxCharge);
        if (period[h] === 'shoulder') ahead = Math.max(0, ahead - Math.min(Math.max(load[h] - gen[h], 0), maxDischarge));
      }
    }
  }

  // Run two passes so battery state settles (day 1 charges, day 2 is representative).
  for (let pass = 0; pass < 2; pass++) {
    selfConsumed = 0; fromBattery = 0; exported = 0; imported = 0; gridCharged = 0;
    savingCents = 0; costCents = 0;
    for (let h = 0; h < 24; h++) {
      const rate = rateForHour(tariff, h, month);
      let g = gen[h];
      let l = load[h];

      // 1. Direct self consumption
      const direct = Math.min(g, l);
      selfConsumed += direct;
      savingCents += direct * rate;
      g -= direct;
      l -= direct;

      // 2. Surplus PV into battery
      if (g > 0 && cap > 0) {
        const room = (cap - soc) / eff;
        const chg = Math.min(g, room, maxCharge);
        soc += chg * eff;
        g -= chg;
      }
      // 3. Remaining surplus exported
      if (g > 0) {
        exported += g;
        savingCents += g * feedInCents;
      }

      // 4. Battery covers remaining load (but hold charge through off peak on TOU, it's cheaper
      //    to import then, and keep the peak reserve through the shoulder)
      const isOffPeak = shifting && period[h] === 'offPeak';
      const spare = soc * eff - (period[h] === 'peak' ? 0 : reserve[h]);
      if (l > 0 && spare > 0 && !isOffPeak) {
        const dis = Math.min(l, spare, maxDischarge);
        soc -= dis / eff;
        fromBattery += dis;
        savingCents += dis * rate;
        l -= dis;
      }
      // 5. Grid import for the rest
      if (l > 0) imported += l;

      // 6. Optional TOU arbitrage: charge from grid in off peak if it beats the peak rate after losses,
      //    leaving room for PV surplus still due before the peak
      if (battery && battery.gridCharge && isOffPeak) {
        const worth = tariff.peak * battery.roundTripEff > tariff.offPeak * 1.05;
        const room = (cap - soc) / eff - pvAhead[h];
        if (worth && room > 0) {
          const chg = Math.min(room, maxCharge);
          soc += chg * eff;
          gridCharged += chg;
          costCents += chg * rate;
        }
      }
    }
  }

  return {
    selfConsumed, fromBattery, exported, imported, gridCharged,
    netSavingDollars: (savingCents - costCents) / 100,
    generation: gen.reduce((a, b) => a + b, 0),
    load: load.reduce((a, b) => a + b, 0),
  };
}

// Annual energy and savings, plus a typical summer and winter day for charting.
function annualResult(inputs, yieldTable) {
  const load = hourlyLoad(inputs.loadProfile);
  const totals = { selfConsumed: 0, fromBattery: 0, exported: 0, imported: 0, gridCharged: 0, generation: 0, load: 0, savingDollars: 0 };
  const days = {};
  for (let m = 0; m < 12; m++) {
    const gen = inputs.panelWatts > 0 ? hourlyGeneration(inputs, yieldTable, m) : new Array(24).fill(0);
    const d = dispatchDay(gen, load, inputs.battery, inputs.tariff, inputs.feedInCents, m);
    const n = DAYS_IN_MONTH[m];
    for (const k of ['selfConsumed', 'fromBattery', 'exported', 'imported', 'gridCharged', 'generation', 'load']) totals[k] += d[k] * n;
    totals.savingDollars += d.netSavingDollars * n;
    if (m === 0) days.summer = { gen, load };
    if (m === 6) days.winter = { gen, load };
  }
  totals.selfConsumptionFraction = totals.generation > 0 ? (totals.selfConsumed + totals.fromBattery - totals.gridCharged) / totals.generation : 0;
  return { totals, days };
}

// Multi-year cash flow and payback.
function cashFlow(inputs, annualSaving) {
  const years = inputs.years || 15;
  const rows = [];
  let cumulative = -inputs.costDollars;
  let payback = null;
  for (let y = 1; y <= years; y++) {
    const degr = Math.pow(1 - inputs.degradation, y - 1);
    const esc = Math.pow(1 + inputs.priceEscalation, y - 1);
    const saving = annualSaving * degr * esc;
    const prev = cumulative;
    cumulative += saving;
    if (payback === null && cumulative >= 0) payback = y - 1 + (-prev) / saving;
    rows.push({ year: y, saving, cumulative });
  }
  return { rows, paybackYears: payback, netBenefit: cumulative };
}

function calculate(inputs, yieldTable) {
  const a = annualResult(inputs, yieldTable);
  const cf = cashFlow(inputs, a.totals.savingDollars);
  return { annual: a.totals, days: a.days, cashFlow: cf.rows, paybackYears: cf.paybackYears, netBenefit: cf.netBenefit };
}

const defaults = {
  city: 'melbourne',
  mounting: 'tilted',
  panelWatts: 880,
  inverterCapWatts: 800,
  shadingLoss: 0.05,
  systemEfficiency: 0.85,
  battery: null,
  loadProfile: { baseload: 250, morning: 500, day: 100, evening: 900 },
  tariff: { type: 'flat', flat: 32 },
  feedInCents: 0,
  costDollars: 1200,
  degradation: 0.005,
  priceEscalation: 0.03,
  years: 15,
};

const api = { calculate, annualResult, cashFlow, hourlyGeneration, hourlyLoad, dispatchDay, defaults };

if (typeof module !== 'undefined') module.exports = api;
if (typeof window !== 'undefined') window.PaybackEngine = api;
