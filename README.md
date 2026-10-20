# Plug-in Solar and Battery Payback Calculator

Public payback calculator for plug-in (balcony / backyard) solar and plug-in battery
systems for Australian households. Built by Smart Energy Lab Services Pty Ltd.

Live at: https://tools.smartenergylab.software/payback/ (planned)

## What it answers

Given a plug-in solar system, a plug-in battery, or both, how many years until it pays
for itself, and what does it save per year.

## Why plug-in is different to rooftop solar

- Output is capped (800 W inverter limit is the default assumption)
- No STCs and no Cheaper Home Batteries rebate unless CEC listed and installed by an
  accredited installer, so hardware is bought at retail
- Export is usually not metered or paid, so feed-in tariff defaults to zero
- Panels are often vertical on a balcony or low tilt in a backyard
- Payback therefore depends almost entirely on self-consumption

## Layout

```
index.html          single page app (inputs, results, charts)
src/engine.js       calculation engine, no DOM dependencies
src/presets.js      kit presets (EcoFlow STREAM etc) and occupancy profiles
data/yield.json     monthly peak sun hours by capital city and tilt
tests/engine.test.js  node test harness for the engine
docs/METHOD.md      calculation method and assumptions
```

## Running the tests

```
node tests/engine.test.js
```

No build step. Open `index.html` in a browser or serve the folder with any static host.

## Status

Phase 1: engine and test harness. UI not started.

## Licence

MIT
