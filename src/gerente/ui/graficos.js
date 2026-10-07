/* Interface do gerente: gráficos. */
/* ---------------- gráficos ---------------- */
function stackedDays(shifts, R) {
  const days = [], total = Math.min(R.days, 62);
  for (let i = total - 1; i >= 0; i--) days.push(addDays(R.to, -i));
  const by = {};
  for (const s of shifts) { const o = (by[s.data] ||= {}); o[s.rid] = (o[s.rid] || 0) + s.live.length; }
  const tot = (d) => Object.values(by[d] || {}).reduce((a, b) => a + b, 0), mx = Math.max(1, ...days.map(tot));
  return `<div class="stk${days.length > 31 ? ' thin' : ''}">${days.map((d) => {
    const segs = ROSTER.filter((r) => by[d]?.[r.id]).map((r) => `<i class="stk-seg" style="height:${(by[d][r.id] / mx) * 100}%;background:${RCOLORS[r.id]}"></i>`).join('');
    const tip = ROSTER.filter((r) => by[d]?.[r.id]).map((r) => `${r.nome} ${by[d][r.id]}`).join(' · ');
    return `<button class="stk-col${MG.day === d ? ' sel' : ''}" data-act="m-day" data-d="${d}" title="${ymdToDm(d)}: ${tip || 'sem entregas'}" aria-label="${ymdToDm(d)}: ${tot(d)} entregas">${segs}</button>`;
  }).join('')}</div><div class="axis"><span>${ymdToDm(days[0])}</span><span>máx ${mx} entregas/dia</span><span>${ymdToDm(days[days.length - 1])}</span></div>`;
}
actions['m-day'] = (el) => { MG.day = MG.day === el.dataset.d ? null : el.dataset.d; mRefresh(); };

function lineChart(series) {                    // series: [{id, pts:[{w, rate}]}]
  const weeks = [...new Set(series.flatMap((s) => s.pts.map((p) => p.w)))].sort();
  if (weeks.length < 2) return '<div class="empty">São necessárias pelo menos 2 semanas de dados para mostrar a evolução.</div>';
  const vals = series.flatMap((s) => s.pts.map((p) => p.rate)).filter((v) => v != null), mx = Math.max(1, ...vals) * 1.1;
  const X = (i) => 4 + (i / (weeks.length - 1)) * 592, Y = (v) => 176 - (v / mx) * 168;
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line class="grid" x1="0" x2="600" y1="${Y(mx * f)}" y2="${Y(mx * f)}"/>`).join('');
  const lines = series.map((s) => {
    const pts = weeks.map((w, i) => { const p = s.pts.find((q) => q.w === w); return p && p.rate != null ? `${X(i).toFixed(1)},${Y(p.rate).toFixed(1)}` : null; }).filter(Boolean);
    return pts.length > 1 ? `<polyline points="${pts.join(' ')}" style="stroke:${RCOLORS[s.id]}"/>` : '';
  }).join('');
  return `<svg class="linechart" viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="Evolução semanal de entregas por hora">${grid}${lines}</svg>
    <div class="axis"><span>sem. de ${ymdToDm(weeks[0])}</span><span>entregas por hora · máx ${num(mx / 1.1)}</span><span>sem. de ${ymdToDm(weeks[weeks.length - 1])}</span></div>
    <div class="legend">${series.map((s) => `<span>${rdot(s.id)}${esc(rname(s.id))} ${(() => { const l = [...s.pts].reverse().find((p) => p.rate != null); return l ? `<b style="color:var(--txt)">${num(l.rate)}</b>` : ''; })()}</span>`).join('')}</div>`;
}

function heatmap(shifts) {
  const grid = {}; let mx = 0, hmin = 24, hmax = -1, n = 0;
  for (const s of shifts) for (const d of s.live) {
    const h = hourOf(d.t), dw = (new Date(s.data + 'T12:00:00Z').getUTCDay() + 6) % 7, k = dw * 24 + h;
    grid[k] = (grid[k] || 0) + 1; mx = Math.max(mx, grid[k]); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); n++;
  }
  if (!n) return '<div class="empty">Sem dados.</div>';
  const L = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], cells = [`<div class="hm-h"></div>${L.map((d) => `<div class="hm-h">${d}</div>`).join('')}`];
  for (let h = hmin; h <= hmax; h++) {
    cells.push(`<div class="hm-h">${String(h).padStart(2, '0')}h</div>`);
    for (let d = 0; d < 7; d++) { const v = grid[d * 24 + h] || 0; cells.push(`<div class="hm-c" style="--a:${v ? (0.15 + 0.85 * v / mx).toFixed(2) : '0.00'};cursor:default" title="${L[d]} ${String(h).padStart(2, '0')}h: ${v}">${v || ''}</div>`); }
  }
  return `<div class="heat">${cells.join('')}</div>`;
}

function hbars(entries, color) {              // entries: [[label, n, v]]
  const mx = Math.max(1, ...entries.map((e) => e[1]));
  return entries.map(([k, n, v]) => `<div class="hbar"><span class="k">${esc(k)}</span><span class="b"><div style="width:${(n / mx) * 100}%;background:${color}"></div></span><span class="v">${n}${v ? ` · ${brl(v)}` : ''}</span></div>`).join('');
}
function distBlock(shifts) {
  const b = {}, a = {};
  for (const s of shifts) for (const d of s.live) { const x = (b[d.bloco] ||= [0, 0]); x[0]++; x[1] += d.valor || 0; const k = floorBand(d.andar); if (k) { const y = (a[k] ||= [0, 0]); y[0]++; y[1] += d.valor || 0; } }
  return {
    blocks: CFG.blocks.map((k) => [k, b[k]?.[0] || 0, b[k]?.[1] || 0]),
    bands: FLOOR_BANDS.map(([k]) => [k === 'SS' ? 'Subsolo' : `${k.replace('-', '–')}º andar`, a[k]?.[0] || 0, a[k]?.[1] || 0]),
  };
}
