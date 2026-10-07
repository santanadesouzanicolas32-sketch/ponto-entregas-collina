/* ============================================================
   Painel (estilo Power BI): filtros que se cruzam, indicadores, gráficos, mapa de calor
   e tabela detalhada. Tudo calculado no aparelho a partir dos registros.
   ============================================================ */
const BI = { period: '7', blocks: new Set(), band: null, day: null, hour: null, dow: null, noValue: false, metric: 'n', sort: { k: 't', dir: -1 }, page: 1 };
const BI_PERIODS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['90', '90 dias'], ['tudo', 'Tudo']];
const DOW_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Todas as entregas válidas (sem turnos de teste), achatadas para análise. */
function biRows() {
  const out = [];
  for (const s of DB.shifts) {
    for (const d of s.deliveries) if (!d.del) out.push({ id: d.id, t: d.t, date: s.date, block: d.block, apt: d.apt, floor: d.floor, v: d.v ?? null, source: d.source, review: d.review, sid: s.id });
  }
  return out;
}

function biRange(period, rows) {
  const today = ymdOf(now());
  if (period === 'hoje') return { from: today, to: today, days: 1 };
  if (period === 'mes') { const from = today.slice(0, 8) + '01'; return { from, to: today, days: Math.round((Date.parse(today) - Date.parse(from)) / 864e5) + 1 }; }
  if (period === 'tudo') {
    const from = rows.length ? rows.reduce((m, r) => (r.date < m ? r.date : m), today) : today;
    return { from, to: today, days: Math.round((Date.parse(today) - Date.parse(from)) / 864e5) + 1, all: true };
  }
  const n = Number(period) || 7;
  return { from: addDays(today, -(n - 1)), to: today, days: n };
}

/** Aplica os filtros. `skip` ignora uma dimensão (o gráfico dessa dimensão mostra tudo e só destaca a seleção, como no Power BI). */
function biApply(rows, R, skip = {}) {
  return rows.filter((r) =>
    (skip.range || (r.date >= R.from && r.date <= R.to))
    && (skip.block || !BI.blocks.size || BI.blocks.has(r.block))
    && (skip.band || !BI.band || floorBand(r.floor) === BI.band)
    && (skip.day || !BI.day || r.date === BI.day)
    && (skip.hour || BI.hour == null || hourOf(r.t) === BI.hour)
    && (skip.dow || BI.dow == null || dowOfYmd(r.date) === BI.dow)
    && (!BI.noValue || r.v == null));
}

const sumV = (rows) => rows.reduce((a, r) => a + (r.v || 0), 0);
const withV = (rows) => rows.filter((r) => r.v != null).length;
const delta = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

function biKpis(rows, R) {
  const all = biRows();
  const cur = biApply(all, R);
  let prev = null;
  if (!R.all) {
    const P = { from: addDays(R.from, -R.days), to: addDays(R.from, -1) };
    prev = biApply(all, P, { day: true, hour: true, dow: true });
  }
  const n = cur.length, sales = sumV(cur), nv = withV(cur);
  const pn = prev ? prev.length : null, ps = prev ? sumV(prev) : null, pnv = prev ? withV(prev) : null;
  // valor/hora e entregas/hora só fazem sentido sem recortes por bloco/andar/hora/dia da semana
  const sliced = BI.blocks.size || BI.band || BI.hour != null || BI.dow != null || BI.noValue;
  const shiftsIn = DB.shifts.filter((s) => (BI.day ? s.date === BI.day : s.date >= R.from && s.date <= R.to));
  const nowMs = now();
  const net = shiftsIn.reduce((a, s) => a + summarize(s, nowMs).net, 0);
  const hours = net / 3600;
  return {
    n, sales, nv, ticket: nv ? sales / nv : null,
    perHour: !sliced && hours >= 0.05 ? n / hours : null, salesHour: !sliced && hours >= 0.05 ? sales / hours : null,
    dN: pn != null ? delta(n, pn) : null, dS: ps != null ? delta(sales, ps) : null,
    dT: pnv ? delta(nv ? sales / nv : 0, ps / pnv) : null,
  };
}

function biDaily(all, R) {
  const rows = biApply(all, R, { day: true });
  const map = {};
  for (const r of rows) { const o = (map[r.date] ||= { n: 0, v: 0 }); o.n++; o.v += r.v || 0; }
  const days = [];
  const total = Math.min(R.days, 120);                // limite de colunas legíveis
  for (let i = total - 1; i >= 0; i--) { const d = addDays(R.to, -i); days.push({ date: d, n: map[d]?.n || 0, v: map[d]?.v || 0 }); }
  return days;
}

const deltaTag = (d) => (d == null ? '' : `<em class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))}%</em>`);

function biHeat(all, R) {
  const rows = biApply(all, R, { hour: true, dow: true });
  const grid = {};
  let mx = 0, hmin = 24, hmax = -1;
  for (const r of rows) {
    const h = hourOf(r.t), d = dowOfYmd(r.date), k = d * 24 + h;
    grid[k] = (grid[k] || 0) + 1; mx = Math.max(mx, grid[k]); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  }
  if (!rows.length) return '<div class="empty">Sem dados.</div>';
  const cells = [`<div class="hm-h"></div>${DOW_LABELS.map((d) => `<div class="hm-h">${d}</div>`).join('')}`];
  for (let h = hmin; h <= hmax; h++) {
    cells.push(`<div class="hm-h">${String(h).padStart(2, '0')}h</div>`);
    for (let d = 0; d < 7; d++) {
      const n = grid[d * 24 + h] || 0, a = n ? 0.15 + 0.85 * (n / mx) : 0;
      const sel = BI.dow === d && BI.hour === h ? ' sel' : '';
      cells.push(`<button class="hm-c${sel}" style="--a:${a.toFixed(2)}" data-act="bi-cell" data-d="${d}" data-h="${h}" title="${DOW_LABELS[d]} ${String(h).padStart(2, '0')}h: ${n} entregas" aria-label="${DOW_LABELS[d]} ${h}h: ${n}">${n || ''}</button>`);
    }
  }
  return `<div class="heat">${cells.join('')}</div>`;
}

function biBarsH(rows, key, allKeys) {
  const m = {};
  for (const k of allKeys || []) m[k] = { n: 0, v: 0 };
  for (const r of rows) { const k = key(r); if (k == null) continue; const o = (m[k] ||= { n: 0, v: 0 }); o.n++; o.v += r.v || 0; }
  return m;
}

function renderPainel(el) {
  const all = biRows();
  const R = biRange(BI.period, all);
  const rows = biApply(all, R);
  const K = biKpis(rows, R);
  const daily = biDaily(all, R);
  const maxDay = Math.max(1, ...daily.map((d) => (BI.metric === 'n' ? d.n : d.v)));
  const goal = userGoal();
  const nBars = daily.length, showLbl = nBars <= 16;
  const dayChart = `<div class="bi-bars${nBars > 40 ? ' thin' : ''}">${BI.metric === 'n' && nBars <= 31 ? `<i class="bi-goal" style="bottom:${Math.min(100, (goal / maxDay) * 100)}%" title="Meta ${goal}"></i>` : ''}${daily.map((d) => {
    const v = BI.metric === 'n' ? d.n : d.v, h = Math.max(1.5, (v / maxDay) * 100);
    return `<button class="bi-col${BI.day === d.date ? ' sel' : ''}${v === 0 ? ' zero' : ''}" data-act="bi-day" data-key="${d.date}" title="${ymdToDm(d.date)}: ${d.n} entregas · ${brl(d.v)}" aria-label="${ymdToDm(d.date)}: ${d.n} entregas"><span class="bi-bar" style="height:${h}%"></span>${showLbl ? `<small>${ymdToDm(d.date)}</small>` : ''}</button>`;
  }).join('')}</div>${!showLbl && daily.length ? `<div class="axis"><span>${ymdToDm(daily[0].date)}</span><span>${BI.metric === 'n' ? 'entregas por dia' : 'vendido por dia'} · máx ${BI.metric === 'n' ? maxDay : brl(maxDay)}</span><span>${ymdToDm(daily[daily.length - 1].date)}</span></div>` : ''}`;

  const hbars = (rowsIn, key, labelOf, isSel, act, dataAttr, allKeys) => {
    const m = biBarsH(rowsIn, key, allKeys);
    const entries = Object.entries(m);
    const mx = Math.max(1, ...entries.map(([, o]) => (BI.metric === 'n' ? o.n : o.v)));
    return entries.map(([k, o]) => ({ k, o })).sort((a, b) => b.o.n - a.o.n).map(({ k, o }) => {
      const val = BI.metric === 'n' ? o.n : o.v;
      return `<button class="hrow bi-h${isSel(k) ? ' sel' : ''}" data-act="${act}" ${dataAttr}="${esc(k)}"><span class="k">${esc(labelOf(k))}</span><span class="b"><div style="width:${(val / mx) * 100}%"></div></span><span class="v2">${o.n}${o.v ? ` · ${brl(o.v)}` : ''}</span></button>`;
    }).join('');
  };
  const blockRows = biApply(all, R, { block: true });
  const bandRows = biApply(all, R, { band: true });
  // filtros ativos
  const chips = [];
  if (BI.day) chips.push(['day', `Dia ${ymdToDm(BI.day)}`]);
  if (BI.dow != null && BI.hour != null) chips.push(['cell', `${DOW_LABELS[BI.dow]} ${String(BI.hour).padStart(2, '0')}h`]);
  if (BI.band) chips.push(['band', BI.band === 'SS' ? 'Subsolo' : `${BI.band.replace('-', '–')}º andar`]);
  if (BI.noValue) chips.push(['novalue', 'Sem valor']);
  const filtersOn = BI.blocks.size || chips.length;

  // tabela detalhada
  const sorted = [...rows].sort((a, b) => {
    const k = BI.sort.k, d = BI.sort.dir;
    const va = k === 't' ? a.t : k === 'v' ? (a.v ?? -1) : k === 'block' ? a.block : a.apt;
    const vb = k === 't' ? b.t : k === 'v' ? (b.v ?? -1) : k === 'block' ? b.block : b.apt;
    return (va < vb ? -1 : va > vb ? 1 : 0) * d || b.t - a.t;
  });
  const shown = sorted.slice(0, BI.page * 30);
  const th = (k, label, cls = '') => `<th class="${cls} sortable" data-act="bi-sort" data-k="${k}">${label}${BI.sort.k === k ? (BI.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;

  el.innerHTML = `
    <div class="bi-filters">
      <div class="bi-row" role="group" aria-label="Período">${BI_PERIODS.map(([k, l]) => `<button class="chip2${BI.period === k ? ' on' : ''}" data-act="bi-period" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="bi-row" role="group" aria-label="Bloco">${CFG.blocks.map((b) => `<button class="chip2${BI.blocks.has(b) ? ' on' : ''}" data-act="bi-block" data-k="${b}">${b}</button>`).join('')}
        ${FLOOR_BANDS.map(([k]) => `<button class="chip2 alt${BI.band === k ? ' on' : ''}" data-act="bi-band" data-k="${k}">${k === 'SS' ? 'SS' : k.replace('-', '–') + 'º'}</button>`).join('')}
        <button class="chip2 alt${BI.noValue ? ' on' : ''}" data-act="bi-novalue">Sem valor</button></div>
      ${filtersOn ? `<div class="bi-row">${chips.map(([k, l]) => `<button class="chip2 on rm" data-act="bi-rm" data-k="${k}">${esc(l)} ✕</button>`).join('')}<button class="linkbtn" data-act="bi-clear">Limpar filtros</button></div>` : ''}
    </div>
    <p class="mut bi-range">${R.from === R.to ? ymdToDm(R.from) : `${ymdToDm(R.from)} a ${ymdToDm(R.to)}`} · ${K.n} entregas selecionadas${R.days > 120 ? ' · gráfico mostra os últimos 120 dias' : ''}</p>
    ${!all.length ? '<div class="card empty">Ainda não há entregas registradas.<br>Registre as entregas no Turno e elas aparecem aqui.</div>' : `
    <div class="bi-kpis">
      <div class="kpi-card"><span>Entregas</span><b>${K.n}</b>${deltaTag(K.dN)}</div>
      <div class="kpi-card strong"><span>Vendido</span><b>${brl(K.sales)}</b>${deltaTag(K.dS)}</div>
      <div class="kpi-card"><span>Ticket médio</span><b>${K.ticket != null ? brl(Math.round(K.ticket)) : '—'}</b>${deltaTag(K.dT)}<small>${K.nv} de ${K.n} com valor</small></div>
      <div class="kpi-card"><span>Vendido por hora</span><b>${K.salesHour != null ? brl(Math.round(K.salesHour)) : '—'}</b><small>${K.perHour != null ? num1(K.perHour) + ' entregas/h' : 'sem recorte de bloco/hora'}</small></div>
    </div>
    <div class="card"><div class="row-between"><h2 style="margin:0">Por dia</h2><div class="seg mini"><button data-act="bi-metric" data-m="n" class="${BI.metric === 'n' ? 'on' : ''}">Entregas</button><button data-act="bi-metric" data-m="v" class="${BI.metric === 'v' ? 'on' : ''}">Vendido</button></div></div>${dayChart}<p class="mut" style="font-size:12px;margin:8px 0 0">Toque em uma barra para filtrar o dia. ${BI.metric === 'n' ? 'A linha tracejada é a sua meta.' : ''}</p></div>
    <div class="bi-grid">
      <div class="card"><h2>Por bloco</h2>${hbars(blockRows, (r) => r.block, (k) => k, (k) => BI.blocks.has(k), 'bi-block', 'data-k', CFG.blocks)}</div>
      <div class="card"><h2>Por faixa de andar</h2>${hbars(bandRows, (r) => floorBand(r.floor), (k) => (k === 'SS' ? 'Subsolo' : `${k.replace('-', '–')}º`), (k) => BI.band === k, 'bi-band', 'data-k', FLOOR_BANDS.map(([k]) => k))}</div>
    </div>
    <div class="card"><h2>Mapa de calor · dia da semana × hora</h2>${biHeat(all, R)}<p class="mut" style="font-size:12px;margin:8px 0 0">Mais dourado = mais entregas. Toque em uma célula para filtrar.</p></div>
    <div class="card"><div class="row-between" style="margin-bottom:10px"><h2 style="margin:0">Detalhe das entregas</h2><button class="btn sm" data-act="bi-csv">Baixar planilha</button></div>
      ${shown.length ? `<div class="scroll"><table class="tbl-click"><tr>${th('t', 'Data e hora')}${th('block', 'Bloco')}${th('apt', 'Apto')}${th('v', 'Valor', 'num')}</tr>
        ${shown.map((r) => `<tr data-act="edit-delivery" data-id="${esc(r.id)}"><td>${fmtDateTime(r.t)}${r.source === 'photo' ? ' <span class="tag photo">FOTO</span>' : ''}${r.review ? ' <span class="badge">CONFERIR</span>' : ''}</td><td>${esc(r.block)}</td><td>${esc(r.apt)}</td><td class="num">${r.v != null ? brl(r.v) : '<span class="mut">—</span>'}</td></tr>`).join('')}
        <tr class="totrow"><td colspan="3"><b>Total (${rows.length} entregas)</b></td><td class="num"><b>${brl(K.sales)}</b></td></tr></table></div>
        ${shown.length < rows.length ? '<button class="btn sm loadmore" data-act="bi-more">Carregar mais</button>' : ''}` : '<div class="empty">Nenhuma entrega nos filtros atuais.</div>'}</div>`}`;
}

/* ---- interações do painel ---- */
const biRefresh = () => { BI.page = 1; render(); };
actions['bi-period'] = (el) => { BI.period = el.dataset.p; BI.day = null; biRefresh(); };
actions['bi-block'] = (el) => { const k = el.dataset.k; BI.blocks.has(k) ? BI.blocks.delete(k) : BI.blocks.add(k); biRefresh(); };
actions['bi-band'] = (el) => { BI.band = BI.band === el.dataset.k ? null : el.dataset.k; biRefresh(); };
actions['bi-day'] = (el) => { BI.day = BI.day === el.dataset.key ? null : el.dataset.key; biRefresh(); };
actions['bi-cell'] = (el) => { const d = Number(el.dataset.d), h = Number(el.dataset.h); if (BI.dow === d && BI.hour === h) { BI.dow = null; BI.hour = null; } else { BI.dow = d; BI.hour = h; } biRefresh(); };
actions['bi-metric'] = (el) => { BI.metric = el.dataset.m; render(); };
actions['bi-novalue'] = () => { BI.noValue = !BI.noValue; biRefresh(); };
actions['bi-clear'] = () => { BI.blocks.clear(); BI.band = null; BI.day = null; BI.hour = null; BI.dow = null; BI.noValue = false; biRefresh(); };
actions['bi-rm'] = (el) => {
  const k = el.dataset.k;
  if (k === 'day') BI.day = null; else if (k === 'cell') { BI.dow = null; BI.hour = null; } else if (k === 'band') BI.band = null; else if (k === 'novalue') BI.noValue = false;
  biRefresh();
};
actions['bi-sort'] = (el) => { const k = el.dataset.k; BI.sort = { k, dir: BI.sort.k === k ? -BI.sort.dir : (k === 't' || k === 'v' ? -1 : 1) }; render(); };
actions['bi-more'] = () => { BI.page++; render(); };
actions['bi-csv'] = () => {
  const all = biRows(), R = biRange(BI.period, all);
  const rows = biApply(all, R).sort((a, b) => a.t - b.t);
  download(`entregas-${ymdOf(now())}.csv`, buildDeliveriesCsv(rows), 'text/csv;charset=utf-8');
  toast(`${rows.length} entregas na planilha`);
};
