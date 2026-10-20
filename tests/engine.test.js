// Run with: node tests/engine.test.js
const assert = require('assert');
const path = require('path');
const engine = require('../src/engine.js');
const presets = require('../src/presets.js');
const yieldTable = require(path.join(__dirname, '..', 'data', 'yield.json'));

function run(name, overrides) {
  const inputs = { ...engine.defaults, ...overrides };
  const r = engine.calculate(inputs, yieldTable);
  const a = r.annual;
  console.log(`\n${name}`);
  console.log(`  generation   ${a.generation.toFixed(0)} kWh/yr`);
  console.log(`  self used    ${a.selfConsumed.toFixed(0)} kWh direct, ${a.fromBattery.toFixed(0)} kWh via battery (${(a.selfConsumptionFraction * 100).toFixed(0)}%)`);
  console.log(`  exported     ${a.exported.toFixed(0)} kWh`);
  console.log(`  saving       $${a.savingDollars.toFixed(0)}/yr`);
  console.log(`  payback      ${r.paybackYears ? r.paybackYears.toFixed(1) + ' yrs' : 'never within horizon'}`);
  console.log(`  15 yr net    $${r.netBenefit.toFixed(0)}`);
  return r;
}

// 1. Baseline: Melbourne, two panels, home all day, flat tariff
const base = run('Melbourne solar only, home all day', {
  ...presets.kits.solar_only_800,
  loadProfile: presets.occupancy.home_all_day,
});
assert(base.annual.generation > 800 && base.annual.generation < 1400, 'generation out of plausible range');
assert(base.annual.selfConsumed <= base.annual.generation);
assert(base.paybackYears > 2 && base.paybackYears < 12, 'payback out of plausible range');

// 2. Out during the day should be worse than home all day
const out = run('Melbourne solar only, out during day', {
  ...presets.kits.solar_only_800,
  loadProfile: presets.occupancy.out_during_day,
});
assert(out.annual.savingDollars < base.annual.savingDollars, 'out-during-day should save less');

// 3. Adding a battery to the out-during-day case should recover most of it
const bat = run('Melbourne solar plus 2 kWh battery, out during day', {
  ...presets.kits.solar_battery_2kwh,
  loadProfile: presets.occupancy.out_during_day,
});
assert(bat.annual.savingDollars > out.annual.savingDollars, 'battery should increase saving');

// 4. Vertical balcony in Hobart should be the worst solar case
const hob = run('Hobart vertical balcony, out during day', {
  ...presets.kits.solar_only_800,
  city: 'hobart', mounting: 'vertical',
  loadProfile: presets.occupancy.out_during_day,
});
assert(hob.annual.generation < base.annual.generation);

// 5. Battery only on TOU: charge off-peak, discharge into the peak
const tou = presets.tariffs.tou_vic;
const bo = run('Battery only, TOU arbitrage', {
  ...presets.kits.battery_only_2kwh,
  tariff: tou,
  loadProfile: presets.occupancy.out_during_day,
});
const boKit = presets.kits.battery_only_2kwh.battery;
assert(bo.annual.generation === 0);
assert(bo.annual.savingDollars > 0, 'arbitrage should save something');
// Grid energy in should come back out less round trip losses.
assert(Math.abs(bo.annual.fromBattery - bo.annual.gridCharged * boKit.roundTripEff) < 1, 'arbitrage round trip losses off');
// Peak load exceeds the battery, so every kWh out should displace peak energy, not shoulder.
const boValue = (bo.annual.savingDollars * 100 + bo.annual.gridCharged * tou.offPeak) / bo.annual.fromBattery;
assert(boValue > tou.peak * 0.98, `battery output worth ${boValue.toFixed(1)} c/kWh, should be near the ${tou.peak} c peak rate`);

// 5b. Solar plus battery on TOU: holding a peak reserve must not stop PV refilling the battery
const sbt = run('Melbourne solar plus 2 kWh battery, TOU, out during day', {
  ...presets.kits.solar_battery_2kwh,
  tariff: tou,
  loadProfile: presets.occupancy.out_during_day,
});
const sot = run('Melbourne solar only, TOU, out during day', {
  ...presets.kits.solar_only_800,
  tariff: tou,
  loadProfile: presets.occupancy.out_during_day,
});
assert(sbt.annual.savingDollars > sot.annual.savingDollars + bo.annual.savingDollars * 0.5, 'battery should add value on top of solar on TOU');
assert(sbt.annual.exported < sot.annual.exported * 0.2, 'battery should soak up most PV surplus');

// 5c. VDO TOU: off-peak is a midday solar soak (11 to 4), not overnight
const vdo = presets.tariffs.tou_vdo;
const bov = run('Battery only, VDO TOU (solar soak charging)', {
  ...presets.kits.battery_only_2kwh,
  tariff: vdo,
  loadProfile: presets.occupancy.out_during_day,
});
assert(bov.annual.gridCharged > 0, 'battery should grid charge in the solar soak');
assert(Math.abs(bov.annual.fromBattery - bov.annual.gridCharged * boKit.roundTripEff) < 1, 'VDO round trip losses off');
const bovValue = (bov.annual.savingDollars * 100 + bov.annual.gridCharged * vdo.offPeak) / bov.annual.fromBattery;
assert(bovValue > vdo.peak * 0.98, `VDO battery output worth ${bovValue.toFixed(1)} c/kWh, should be near the ${vdo.peak} c peak rate`);
// The solar soak is when PV runs, so grid charging must leave room for it rather than export it.
const sbv = run('Melbourne solar plus 2 kWh battery, VDO TOU, out during day', {
  ...presets.kits.solar_battery_2kwh,
  tariff: vdo,
  loadProfile: presets.occupancy.out_during_day,
});
const sov = run('Melbourne solar only, VDO TOU, out during day', {
  ...presets.kits.solar_only_800,
  tariff: vdo,
  loadProfile: presets.occupancy.out_during_day,
});
assert(sbv.annual.exported < sov.annual.exported * 0.2, 'grid charging should not crowd out PV in the solar soak');
assert(sbv.annual.gridCharged < bov.annual.gridCharged * 0.5, 'PV should replace most solar soak grid charging');
assert(sbv.annual.savingDollars > sov.annual.savingDollars, 'battery should add value on VDO TOU');

// 5d. Each city's own TOU (DMO, Synergy, Aurora, ActewAGL, Jacana): battery only should
//     arbitrage into the peak, and solar plus battery should beat solar only
const dmoRuns = [];
for (const [city, key] of Object.entries(presets.touByCity).filter(([c]) => c !== 'melbourne')) {
  const t = presets.tariffs[key];
  const b = run(`Battery only, ${t.name}`, {
    ...presets.kits.battery_only_2kwh, city, tariff: t, loadProfile: presets.occupancy.out_during_day,
  });
  const v = (b.annual.savingDollars * 100 + b.annual.gridCharged * t.offPeak) / b.annual.fromBattery;
  assert(Math.abs(b.annual.fromBattery - b.annual.gridCharged * boKit.roundTripEff) < 1, `${key} round trip losses off`);
  assert(v > t.peak * 0.98, `${key} battery output worth ${v.toFixed(1)} c/kWh, should be near the ${t.peak} c peak rate`);
  const sb = run(`${city} solar plus 2 kWh battery, ${t.name}, out during day`, {
    ...presets.kits.solar_battery_2kwh, city, tariff: t, loadProfile: presets.occupancy.out_during_day,
  });
  const so = run(`${city} solar only, ${t.name}, out during day`, {
    ...presets.kits.solar_only_800, city, tariff: t, loadProfile: presets.occupancy.out_during_day,
  });
  assert(sb.annual.savingDollars > so.annual.savingDollars, `battery should add value on ${key}`);
  assert(sb.annual.exported < so.annual.exported * 0.2, `battery should soak up most PV surplus on ${key}`);
  dmoRuns.push(b, sb, so);
}

// 5e. Ausgrid's peak only applies in some months. In April there's no peak, so a battery
//     only kit should neither grid charge nor discharge, and solar plus battery should
//     still use its stored PV at the off-peak rate rather than hold it.
const aus = presets.tariffs.tou_ausgrid;
const flatLoad = engine.hourlyLoad(presets.occupancy.out_during_day);
const aprBo = engine.dispatchDay(new Array(24).fill(0), flatLoad, boKit, aus, 0, 3);
assert(aprBo.gridCharged === 0 && aprBo.fromBattery === 0, 'no arbitrage in a month without a peak');
const sydApr = engine.hourlyGeneration({ ...engine.defaults, city: 'sydney' }, yieldTable, 3);
const aprSb = engine.dispatchDay(sydApr, flatLoad, presets.kits.solar_battery_2kwh.battery, aus, 0, 3);
assert(aprSb.fromBattery > 0.5, 'stored PV should be used in a month without a peak');
assert(aprSb.netSavingDollars * 100 > (aprSb.selfConsumed + aprSb.fromBattery) * aus.offPeak * 0.99, 'April should be valued at the off-peak rate');

// 5f. Aurora's peak is weekdays only. A weekend day has no peak, so battery only does nothing,
//     and the year is weighted 5 weekdays to 2 weekend days.
const aur = presets.tariffs.tou_aurora;
const wkend = engine.dispatchDay(new Array(24).fill(0), flatLoad, boKit, aur, 0, 6, true);
const wkday = engine.dispatchDay(new Array(24).fill(0), flatLoad, boKit, aur, 0, 6, false);
assert(wkend.gridCharged === 0 && wkend.fromBattery === 0, 'no arbitrage on a weekend without a peak');
assert(wkday.fromBattery > 0.5, 'weekday should arbitrage into the peak');
const hobBo = engine.calculate({ ...engine.defaults, ...presets.kits.battery_only_2kwh, city: 'hobart', tariff: aur, loadProfile: presets.occupancy.out_during_day }, yieldTable);
const wkdaySaving = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reduce((t, m) => t + engine.dispatchDay(new Array(24).fill(0), flatLoad, boKit, aur, 0, m, false).netSavingDollars * [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m], 0);
assert(Math.abs(hobBo.annual.savingDollars - wkdaySaving * 5 / 7) < 0.5, 'weekday-only peak should count 5 days in 7');

// 6. Energy balance: load = direct + battery + import for each run
for (const r of [base, out, bat, hob, bo, sbt, sot, bov, sbv, sov, ...dmoRuns]) {
  const a = r.annual;
  const lhs = a.load;
  const rhs = a.selfConsumed + a.fromBattery + a.imported;
  assert(Math.abs(lhs - rhs) < 1, `energy balance off by ${lhs - rhs}`);
}

// 7. Every city has a plausible default offer rate
for (const city of Object.keys(yieldTable.cities)) {
  const o = presets.defaultOffers[city];
  assert(o && o.flat > 15 && o.flat < 60 && o.source, `default offer missing or implausible for ${city}`);
}

console.log('\nAll tests passed');
