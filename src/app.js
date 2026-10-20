// Browser UI for the payback calculator. Reads the form, runs PaybackEngine,
// renders the results and two inline SVG charts. No dependencies.

(function () {
  const engine = window.PaybackEngine;
  const presets = window.PaybackPresets;
  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let yieldTable = null;
  let lastResult = null;
  let season = 'summer';
  let tariffBeforeBatteryOnly = null; // set while a battery-only kit has switched the tariff to TOU

  // ---------- formatting ----------
  const money = (v) => {
    const sign = v < 0 ? '−' : '';
    return sign + '$' + Math.round(Math.abs(v)).toLocaleString('en-AU');
  };
  const compactMoney = (v) => {
    const a = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (a >= 1000) return sign + '$' + (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return sign + '$' + Math.round(a);
  };
  const kwh = (v) => Math.round(v).toLocaleString('en-AU');

  // ---------- theme ----------
  // "auto" removes data-theme so the CSS follows prefers-color-scheme. The
  // inline script in index.html applies the saved choice before first paint.
  function setTheme(mode, save) {
    if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
    else { mode = 'auto'; delete document.documentElement.dataset.theme; }
    document.querySelectorAll('[data-theme-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === mode)));
    if (save) {
      try {
        if (mode === 'auto') localStorage.removeItem('theme');
        else localStorage.setItem('theme', mode);
      } catch (e) { /* storage blocked: the choice lasts for this page view only */ }
    }
  }
  setTheme(document.documentElement.dataset.theme, false);
  document.querySelectorAll('[data-theme-choice]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeChoice, true)));

  // ---------- form setup ----------
  function fillSelect(sel, entries) {
    sel.replaceChildren();
    for (const [value, label] of entries) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      sel.appendChild(o);
    }
  }

  function setNum(id, v) { $(id).value = v; }
  function num(id, fallback) {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : fallback;
  }

  function applyKit(key) {
    const k = presets.kits[key];
    setNum('panelWatts', k.panelWatts);
    setNum('inverterCapWatts', k.inverterCapWatts);
    setNum('costDollars', k.costDollars);
    $('hasBattery').checked = !!k.battery;
    if (k.battery) {
      setNum('usableKWh', k.battery.usableKWh);
      setNum('batteryWatts', k.battery.chargeWatts);
      setNum('roundTripEff', Math.round(k.battery.roundTripEff * 100));
      $('gridCharge').checked = !!k.battery.gridCharge;
    }
    // Battery only kits only make sense on time of use. Switch to it (the city's own
    // where there is one), and switch back when leaving the kit unless the tariff was
    // changed in the meantime.
    if (k.panelWatts === 0 && $('tariff').value === 'default_offer') {
      tariffBeforeBatteryOnly = 'default_offer';
      $('tariff').value = cityTou();
      applyTariff(cityTou());
    } else if (k.panelWatts > 0 && tariffBeforeBatteryOnly) {
      $('tariff').value = tariffBeforeBatteryOnly; // its rate field still holds the earlier value
      tariffBeforeBatteryOnly = null;
      syncTariffFields();
    }
    syncBatteryFields();
  }

  // The TOU preset a battery-only kit switches to: the city's real one where there is one.
  function cityTou() {
    return presets.touByCity[$('city').value] || 'tou_vic';
  }

  function applyOccupancy(key) {
    const o = presets.occupancy[key];
    for (const f of ['baseload', 'morning', 'day', 'evening']) setNum(f, o[f]);
  }

  function applyTariff(key) {
    const t = presets.tariffs[key];
    if (key === 'default_offer') applyDefaultOffer();
    else if (t.type === 'flat') setNum('flat', t.flat);
    else for (const f of ['peak', 'shoulder', 'offPeak']) setNum(f, t[f]);
    syncTariffFields();
  }

  // Flat rate from the city's default (regulated reference) offer.
  function applyDefaultOffer() {
    const o = presets.defaultOffers[$('city').value];
    setNum('flat', o ? o.flat : presets.tariffs.default_offer.flat);
    $('flatSource').textContent = o ? o.source : '';
  }

  function syncBatteryFields() {
    $('batteryFields').disabled = !$('hasBattery').checked;
  }

  // Ticking or unticking the battery switches to the matching solar kit, so the
  // upfront cost includes (or drops) the battery instead of modelling it for free.
  function toggleBattery() {
    const want = $('hasBattery').checked;
    if (!!presets.kits[$('kit').value].battery !== want) {
      const key = Object.keys(presets.kits).find((k) => !!presets.kits[k].battery === want && presets.kits[k].panelWatts > 0);
      if (key) { $('kit').value = key; applyKit(key); return; }
    }
    syncBatteryFields();
  }

  function syncTariffFields() {
    const t = presets.tariffs[$('tariff').value];
    const tou = t.type === 'tou';
    document.querySelector('.tou-only').hidden = !tou;
    $('touWindows').textContent = tou ? t.windows : '';
    document.querySelector('.flat-only').hidden = tou;
    $('flatSource').hidden = $('tariff').value !== 'default_offer';
  }

  function readInputs() {
    const d = engine.defaults;
    const t = presets.tariffs[$('tariff').value];
    const tariff = t.type === 'flat'
      ? { type: 'flat', flat: num('flat', t.flat) }
      : { ...t, peak: num('peak', t.peak), shoulder: num('shoulder', t.shoulder), offPeak: num('offPeak', t.offPeak) };
    const batteryWatts = num('batteryWatts', 800);
    const battery = $('hasBattery').checked
      ? {
          usableKWh: Math.max(0, num('usableKWh', 0)),
          chargeWatts: batteryWatts,
          dischargeWatts: batteryWatts,
          roundTripEff: Math.min(1, Math.max(0.01, num('roundTripEff', 85) / 100)),
          gridCharge: $('gridCharge').checked,
        }
      : null;
    return {
      ...d,
      city: $('city').value,
      mounting: $('mounting').value,
      panelWatts: Math.max(0, num('panelWatts', d.panelWatts)),
      inverterCapWatts: Math.max(0, num('inverterCapWatts', d.inverterCapWatts)),
      shadingLoss: Math.min(1, Math.max(0, num('shadingLoss', 5) / 100)),
      systemEfficiency: Math.min(1, Math.max(0, num('systemEfficiency', 85) / 100)),
      battery: battery && battery.usableKWh > 0 ? battery : null,
      loadProfile: {
        baseload: Math.max(0, num('baseload', 0)),
        morning: Math.max(0, num('morning', 0)),
        day: Math.max(0, num('day', 0)),
        evening: Math.max(0, num('evening', 0)),
      },
      tariff,
      feedInCents: Math.max(0, num('feedInCents', 0)),
      costDollars: Math.max(0, num('costDollars', d.costDollars)),
      degradation: Math.max(0, num('degradation', 0.5) / 100),
      priceEscalation: num('priceEscalation', 3) / 100,
      years: Math.min(30, Math.max(1, Math.round(num('years', 15)))),
    };
  }

  // ---------- results ----------
  function render() {
    if (!yieldTable) return;
    const inputs = readInputs();
    const r = engine.calculate(inputs, yieldTable);
    lastResult = { r, inputs };
    const a = r.annual;

    const pb = $('payback');
    pb.replaceChildren();
    if (r.paybackYears !== null) {
      pb.style.fontSize = '';
      pb.append(r.paybackYears.toFixed(1));
      const s = document.createElement('small');
      s.textContent = 'years';
      pb.append(s);
      $('paybackNote').textContent =
        `Pays back during year ${Math.ceil(r.paybackYears)}, then saves about ${money(r.cashFlow[r.cashFlow.length - 1].saving)} a year by year ${inputs.years}.`;
    } else {
      pb.textContent = 'Not within ' + inputs.years + ' yrs';
      pb.style.fontSize = '32px';
      $('paybackNote').textContent = a.savingDollars <= 0
        ? 'This setup does not save money each year at these rates.'
        : `Savings of ${money(a.savingDollars)} a year are not enough to cover ${money(inputs.costDollars)} within ${inputs.years} years.`;
    }

    $('tSaving').textContent = money(a.savingDollars);
    $('tGen').textContent = kwh(a.generation);
    if (a.generation > 0) {
      $('tSelf').textContent = Math.round(a.selfConsumptionFraction * 100) + '%';
      $('tSelfSub').textContent = 'of generation';
    } else {
      $('tSelf').textContent = '–';
      $('tSelfSub').textContent = 'no panels';
    }
    $('tNetLabel').textContent = `Net after ${inputs.years} years`;
    $('tNet').textContent = money(r.netBenefit);

    const rows = [
      ['Solar generated', a.generation],
      ['Used directly in the home', a.selfConsumed],
      ['Used later from the battery', a.fromBattery],
      ['Battery charged from grid', a.gridCharged],
      ['Exported to grid', a.exported],
      ['Still bought from grid', a.imported],
      ['Total household use', a.load],
    ];
    const dl = $('energy');
    dl.replaceChildren();
    for (const [label, v] of rows) {
      if (v === 0 && (label.includes('battery') || label.includes('Battery'))) continue;
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = kwh(v) + ' kWh';
      dl.append(dt, dd);
    }

    renderCashTable(r);
    drawCharts();
  }

  function renderCashTable(r) {
    const t = $('cashTable');
    t.replaceChildren();
    const head = t.insertRow();
    for (const h of ['Year', 'Saving', 'Cumulative']) {
      const th = document.createElement('th'); th.textContent = h; head.appendChild(th);
    }
    for (const row of r.cashFlow) {
      const tr = t.insertRow();
      tr.insertCell().textContent = row.year;
      tr.insertCell().textContent = money(row.saving);
      tr.insertCell().textContent = money(row.cumulative);
    }
  }

  // ---------- chart helpers ----------
  function el(name, attrs, parent) {
    const n = document.createElementNS(SVG_NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function niceStep(range, target) {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  function ticks(min, max, target) {
    if (max === min) max = min + 1;
    const step = niceStep(max - min, target);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  // Bar path with 4px rounded data end and square baseline end.
  function barPath(x, w, y0, y1) {
    const up = y1 < y0;
    const h = Math.abs(y1 - y0);
    const r = Math.min(4, w / 2, h);
    if (h < 0.5) return '';
    if (up) {
      return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
    }
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }

  function makeTip(container) {
    let tip = container.querySelector('.tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tip';
      tip.hidden = true;
      container.appendChild(tip);
    }
    return tip;
  }

  function showTip(tip, container, x, y, title, rows) {
    tip.replaceChildren();
    const t = document.createElement('div'); t.className = 't'; t.textContent = title;
    tip.appendChild(t);
    for (const [color, value, label] of rows) {
      const r = document.createElement('div'); r.className = 'r';
      if (color) {
        const k = document.createElement('i'); k.className = 'key-line'; k.style.background = color;
        r.appendChild(k);
      }
      const b = document.createElement('b'); b.textContent = value;
      const e = document.createElement('em'); e.textContent = label;
      r.append(b, e);
      tip.appendChild(r);
    }
    tip.hidden = false;
    const cw = container.clientWidth;
    const tw = tip.offsetWidth;
    let left = x + 14;
    if (left + tw > cw) left = x - tw - 14;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = Math.max(0, y - 10) + 'px';
  }

  // ---------- cash flow chart ----------
  function drawCash(container, r, inputs) {
    const W = Math.max(300, container.clientWidth);
    const H = W < 500 ? 220 : 260;
    const m = { t: 16, r: 8, b: 26, l: 48 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = r.cashFlow.map((d) => d.cumulative);
    const ys = ticks(Math.min(0, -inputs.costDollars, ...vals), Math.max(0, ...vals), 5);
    const yMin = ys[0], yMax = ys[ys.length - 1];
    const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
    const n = r.cashFlow.length;
    const band = iw / n;
    const bw = Math.min(24, band * 0.62);
    const x = (i) => m.l + band * i + (band - bw) / 2;

    container.replaceChildren();
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Cumulative saving minus upfront cost by year' }, container);

    for (const v of ys) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: v === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
      el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = compactMoney(v);
    }

    const labelEvery = n > 20 ? 5 : n > 10 ? 2 : 1;
    const bars = [];
    r.cashFlow.forEach((d, i) => {
      const color = d.cumulative >= 0 ? 'var(--pos)' : 'var(--neg)';
      const p = el('path', { d: barPath(x(i), bw, y(0), y(d.cumulative)), fill: color }, svg);
      bars.push(p);
      if ((i + 1) % labelEvery === 0 || i === 0) {
        el('text', { x: x(i) + bw / 2, y: H - 8, 'text-anchor': 'middle' }, svg).textContent = d.year;
      }
    });
    el('text', { x: m.l, y: H - 8, 'text-anchor': 'end', dx: -8 }, svg).textContent = 'Year';

    // Direct label on the final bar only
    const last = r.cashFlow[n - 1];
    const ly = last.cumulative >= 0 ? y(last.cumulative) - 6 : y(last.cumulative) + 14;
    const lt = el('text', { x: x(n - 1) + bw / 2, y: ly, 'text-anchor': 'end', style: 'fill:var(--text);font-weight:600' }, svg);
    lt.textContent = money(last.cumulative);

    // Hover: whole band is the hit target
    const tip = makeTip(container);
    const hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', tabindex: 0 }, svg);
    let active = -1;
    function at(i) {
      if (active >= 0 && bars[active]) bars[active].removeAttribute('opacity');
      active = i;
      bars.forEach((b, j) => b.setAttribute('opacity', j === i ? 1 : 0.55));
      const d = r.cashFlow[i];
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      showTip(tip, container, (x(i) + bw / 2) * scale, y(Math.max(0, d.cumulative)) * scale, `Year ${d.year}`, [
        [null, money(d.cumulative), 'cumulative'],
        [null, money(d.saving), 'saved that year'],
      ]);
    }
    function clear() { bars.forEach((b) => b.removeAttribute('opacity')); tip.hidden = true; active = -1; }
    hit.addEventListener('pointermove', (e) => {
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (W / rect.width);
      at(Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / band))));
    });
    hit.addEventListener('pointerleave', clear);
    hit.addEventListener('blur', clear);
    hit.addEventListener('focus', () => at(n - 1));
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { at(Math.min(n - 1, active + 1)); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { at(Math.max(0, active - 1)); e.preventDefault(); }
    });
  }

  // ---------- typical day chart ----------
  function drawDay(container, day) {
    const W = Math.max(300, container.clientWidth);
    const H = W < 500 ? 200 : 240;
    const m = { t: 12, r: 8, b: 26, l: 48 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const gen = day.gen.map((v) => v * 1000);
    const load = day.load.map((v) => v * 1000);
    // Fixed y range across seasons so January and July compare honestly
    const both = lastResult.r.days;
    const peak = Math.max(...both.summer.gen, ...both.winter.gen, ...both.summer.load) * 1000;
    const ys = ticks(0, Math.max(100, peak), 4);
    const yMax = ys[ys.length - 1];
    const x = (h) => m.l + (h / 24) * iw;
    const y = (v) => m.t + ih - (v / yMax) * ih;

    container.replaceChildren();
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Solar output and household use across a typical day' }, container);
    for (const v of ys) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: v === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
      el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v >= 1000 ? (v / 1000) + ' kW' : v + ' W';
    }
    for (const h of [0, 6, 12, 18, 24]) {
      const label = h === 0 || h === 24 ? '12 am' : h === 12 ? '12 pm' : h < 12 ? h + ' am' : (h - 12) + ' pm';
      el('text', { x: x(h), y: H - 8, 'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg).textContent = label;
    }

    const pts = (arr) => arr.map((v, h) => [x(h + 0.5), y(v)]);
    const linePath = (p) => p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('');
    const gp = pts(gen), lp = pts(load);
    el('path', { d: linePath(gp) + `L${gp[23][0]},${y(0)}L${gp[0][0]},${y(0)}Z`, fill: 'var(--gen)', opacity: 0.1 }, svg);
    el('path', { d: linePath(lp), fill: 'none', stroke: 'var(--load)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    el('path', { d: linePath(gp), fill: 'none', stroke: 'var(--gen)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);

    const cross = el('line', { y1: m.t, y2: m.t + ih, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' }, svg);
    const dotG = el('circle', { r: 4, fill: 'var(--gen)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, svg);
    const dotL = el('circle', { r: 4, fill: 'var(--load)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, svg);
    const tip = makeTip(container);
    const hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', tabindex: 0 }, svg);
    let active = -1;
    function at(h) {
      active = h;
      const cx = x(h + 0.5);
      for (const n of [cross, dotG, dotL]) n.setAttribute('visibility', 'visible');
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
      dotG.setAttribute('cx', cx); dotG.setAttribute('cy', y(gen[h]));
      dotL.setAttribute('cx', cx); dotL.setAttribute('cy', y(load[h]));
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      const fmt = (h2) => { const hh = h2 % 24; return (hh % 12 || 12) + (hh < 12 ? ' am' : ' pm'); };
      showTip(tip, container, cx * scale, m.t * scale, `${fmt(h)} to ${fmt(h + 1)}`, [
        ['var(--gen)', Math.round(gen[h]) + ' W', 'solar'],
        ['var(--load)', Math.round(load[h]) + ' W', 'use'],
      ]);
    }
    function clear() { for (const n of [cross, dotG, dotL]) n.setAttribute('visibility', 'hidden'); tip.hidden = true; active = -1; }
    hit.addEventListener('pointermove', (e) => {
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (W / rect.width);
      at(Math.max(0, Math.min(23, Math.floor(((px - m.l) / iw) * 24))));
    });
    hit.addEventListener('pointerleave', clear);
    hit.addEventListener('blur', clear);
    hit.addEventListener('focus', () => at(12));
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { at(Math.min(23, active + 1)); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { at(Math.max(0, active - 1)); e.preventDefault(); }
    });
  }

  function drawCharts() {
    if (!lastResult) return;
    drawCash($('cashChart'), lastResult.r, lastResult.inputs);
    drawDay($('dayChart'), lastResult.r.days[season]);
  }

  // ---------- init ----------
  function init() {
    fillSelect($('kit'), Object.entries(presets.kits).map(([k, v]) => [k, v.name]));
    fillSelect($('city'), Object.entries(yieldTable.cities).map(([k, v]) => [k, v.name]));
    fillSelect($('mounting'), Object.entries(yieldTable.mountings).map(([k, v]) => [k, v]));
    fillSelect($('occupancy'), Object.entries(presets.occupancy).map(([k, v]) => [k, v.name]));
    fillSelect($('tariff'), Object.entries(presets.tariffs).map(([k, v]) => [k, v.name]));

    const d = engine.defaults;
    $('city').value = d.city;
    $('mounting').value = d.mounting;
    $('occupancy').value = 'home_all_day';
    $('tariff').value = 'default_offer';
    applyTariff('default_offer');
    applyOccupancy('home_all_day');
    setNum('feedInCents', d.feedInCents);
    setNum('shadingLoss', Math.round(d.shadingLoss * 100));
    setNum('systemEfficiency', Math.round(d.systemEfficiency * 100));
    setNum('roundTripEff', 85);
    setNum('usableKWh', 1.9);
    setNum('batteryWatts', 800);
    setNum('priceEscalation', d.priceEscalation * 100);
    setNum('degradation', d.degradation * 100);
    setNum('years', d.years);
    $('kit').value = 'solar_only_800';
    applyKit('solar_only_800');

    $('kit').addEventListener('change', (e) => { applyKit(e.target.value); render(); });
    $('occupancy').addEventListener('change', (e) => { applyOccupancy(e.target.value); render(); });
    // A new city brings its own default offer. While a battery-only kit has switched
    // to TOU, the flat field still updates so the rate is right when switching back.
    $('city').addEventListener('change', () => {
      if ($('tariff').value === 'default_offer' || tariffBeforeBatteryOnly === 'default_offer') { applyDefaultOffer(); syncTariffFields(); }
      // A TOU the battery-only kit picked follows the city too.
      if (tariffBeforeBatteryOnly && $('tariff').value !== cityTou()) { $('tariff').value = cityTou(); applyTariff(cityTou()); }
    });
    $('tariff').addEventListener('change', (e) => { tariffBeforeBatteryOnly = null; applyTariff(e.target.value); render(); });
    $('hasBattery').addEventListener('change', toggleBattery);
    $('inputs').addEventListener('input', render);
    $('inputs').addEventListener('change', render);
    $('inputs').addEventListener('submit', (e) => e.preventDefault());

    document.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => {
      season = b.dataset.season;
      document.querySelectorAll('[data-season]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      drawCharts();
    }));

    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawCharts); }).observe($('cashChart'));

    render();
  }

  fetch('data/yield.json')
    .then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then((data) => { yieldTable = data; }, (err) => { console.error(err); })
    .then(() => {
      if (yieldTable) { init(); return; }
      const p = document.createElement('p');
      p.className = 'error';
      p.textContent = 'Could not load the sun hours table (data/yield.json). If you opened this file directly, serve the folder over http instead.';
      document.querySelector('main').prepend(p);
    });
})();
