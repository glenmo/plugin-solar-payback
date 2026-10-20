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

// 5. Battery only on TOU should produce a positive saving
const bo = run('Battery only, TOU arbitrage', {
  ...presets.kits.battery_only_2kwh,
  tariff: presets.tariffs.tou_vic,
  loadProfile: presets.occupancy.out_during_day,
});
assert(bo.annual.generation === 0);
assert(bo.annual.savingDollars > 0, 'arbitrage should save something');

// 6. Energy balance: load = direct + battery + import for each run
for (const r of [base, out, bat]) {
  const a = r.annual;
  const lhs = a.load;
  const rhs = a.selfConsumed + a.fromBattery + a.imported;
  assert(Math.abs(lhs - rhs) < 1, `energy balance off by ${lhs - rhs}`);
}

console.log('\nAll tests passed');
