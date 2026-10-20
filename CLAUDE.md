# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Public payback calculator for plug-in (balcony/backyard) solar and plug-in battery systems for Australian households. Plain JavaScript, no build step, no dependencies, no `package.json`. Status: engine, tests and UI are built. Yield values and kit prices are still provisional.

## Commands

```
node tests/engine.test.js     # run all tests
```

There is no test framework. The test file is one script of scenario runs plus `assert` calls, so there is no way to run a single test except by commenting out the others. Each scenario prints a summary (generation, self-consumption, saving, payback) before its asserts. No linter is configured.

To view the app, serve the folder (`python3 -m http.server`) and open it. Opening `index.html` from disk fails because `src/app.js` fetches `data/yield.json`.

## Architecture

- `src/engine.js` holds all calculation logic as pure functions with no DOM access. `src/presets.js` holds kit, occupancy and tariff presets. Both files use a dual export footer (`module.exports` for node, `window.PaybackEngine` / `window.PaybackPresets` for the browser) and must stay loadable as plain `<script>` tags with no `require`/`import`. Keep that footer pattern when adding modules. Classic scripts share one global scope in the browser, so top-level names must be unique across files (node won't catch a clash because each `require` has its own scope).
- `src/app.js` is the UI: an IIFE that reads the form into an engine inputs object, calls `calculate`, and draws two hand-built SVG charts (cumulative cash flow columns, typical-day lines) with hover tooltips. Colours are CSS custom properties in `index.html`, with light and dark values.
- `data/yield.json` holds monthly peak sun hours per city × mounting (`tilted`, `flat`, `vertical`), Jan–Dec. The engine takes it as an argument (`calculate(inputs, yieldTable)`) rather than loading it, so the browser will need to fetch it.
- Inputs are a single flat object; callers spread `engine.defaults`, then a preset kit (`presets.kits.*`), then overrides. Kits set panel/inverter/battery/cost fields; `loadProfile` and `tariff` come from `presets.occupancy` / `presets.tariffs`. `battery: null` means no battery; `panelWatts: 0` means battery only.
- Pipeline: `calculate` → `annualResult` (12 months, one typical 24 h day each: `hourlyGeneration` + `hourlyLoad` → `dispatchDay`, scaled by days in month) → `cashFlow` (degradation, price escalation, interpolated payback year).
- `dispatchDay` runs each day twice so battery state of charge settles. The order within each hour is: direct self-consumption → charge battery from surplus → export → battery discharge (held during TOU off-peak) → grid import → optional grid charge in off-peak. `docs/METHOD.md` documents this order and the known simplifications. Update it when the method changes.

## Domain conventions

- Units: power in W, energy in kWh, tariffs in c/kWh, money in dollars. Rates such as `shadingLoss`, `degradation` and `roundTripEff` are fractions (0–1).
- Plug-in defaults that differ from rooftop solar: inverter output capped at 800 W (generation is clipped per hour), feed-in tariff defaults to 0, hardware priced at retail with no STCs or rebates. Payback therefore depends mostly on self-consumption.
- Yield table values and preset prices/specs are provisional placeholders that must be verified before release, so don't treat them as ground truth.
- The tests assert plausibility ranges and relative orderings (for example, out-during-day saves less than home-all-day, and a battery increases saving) plus a load energy balance (`load ≈ selfConsumed + fromBattery + imported`). Changes to the method should keep these holding.
