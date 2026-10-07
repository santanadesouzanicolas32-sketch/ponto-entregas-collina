/* ============================================================
   Autotestes do sistema do gerente. Abra  gerente.html?selftest
   Usam dados em memória: não tocam nos dados reais importados.
   ============================================================ */
async function runMgrTests() {
  const results = [];
  const saved = { ST, MPERSIST, fixedNow, MC, DB, persist, cfg: SYNC.cfg, fetch: SYNC.fetch, off: SYNC.off, etags: ETAGS, state: { ...SYNC.state }, pull: { ...PULL } };
  // GitHub de mentira, em memória: mesmas regras do real (token, sha/etag, 304, 404, 409/422)
  const TOKEN = 'github_pat_TESTE0000000000000000';
  const fakeGh = () => {
    const files = {}, g = { files, puts: 0, gets: 0, beforePut: null, offline: false, token: TOKEN };
    let n = 0;
    const res = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => body, json: async () => JSON.parse(body) });
    g.fetch = async (url, o = {}) => {
      if (g.offline) throw new TypeError('Failed to fetch');
      if (o.headers.Authorization !== `Bearer ${g.token}`) return res(401, '{"message":"Bad credentials"}');
      const path = url.replace('https://api.github.com', ''), repo = /^\/repos\/([^/]+\/[^/]+)$/.exec(path), file = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/.exec(path);
      if (repo) return res(200, JSON.stringify({ full_name: repo[1], private: true, permissions: { push: true } }));
      const f = decodeURIComponent(file[1]);
      if ((o.method || 'GET') === 'GET') {
        g.gets++;
        if (!files[f]) return res(404, '{"message":"Not Found"}');
        const etag = `"${files[f].sha}"`;
        return o.headers['If-None-Match'] === etag ? res(304, '', { etag }) : res(200, files[f].text, { etag });
      }
      g.puts++;
      if (g.beforePut) { const h = g.beforePut; g.beforePut = null; h(); }
      const b = JSON.parse(o.body);
      if (files[f] && !b.sha) return res(422, '{"message":"sha wasn\'t supplied"}');
      if (files[f] && files[f].sha !== b.sha) return res(409, '{"message":"does not match"}');
      files[f] = { text: new TextDecoder().decode(Uint8Array.from(atob(b.content), (c) => c.charCodeAt(0))), sha: `sha${++n}`, message: b.message };
      return res(200, JSON.stringify({ content: { sha: files[f].sha } }));
    };
    return g;
  };
  const withGh = async (fn) => {
    const g = fakeGh(); SYNC.fetch = g.fetch; SYNC.cfg = { repo: 'dono/ponto-dados', token: g.token }; SYNC.off = false; ETAGS = {}; PULL.err = null; PULL.at = null;
    DB = emptyDb(); DB.user = { name: 'João', id: 'joao', goal: 60 }; persist = false;
    try { await fn(g); } finally { SYNC.fetch = null; }
  };
  const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} esperado ${JSON.stringify(b)} obtido ${JSON.stringify(a)}`); };
  const ok = (c, m = 'condição falsa') => { if (!c) throw new Error(m); };
  const near = (a, b, tol, m = '') => { if (a == null || Math.abs(a - b) > tol) throw new Error(`${m} esperado ~${b} obtido ${a}`); };
  const rejects = async (fn, re) => { try { await fn(); } catch (e) { if (re.test(e.message)) return; throw new Error(`mensagem inesperada: ${e.message}`); } throw new Error('esperava erro'); };
  const T = async (name, fn) => {
    ST = novoEstado(); MPERSIST = false; MC = null; fixedNow = localToMs('2026-10-07', 18);
    try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: String(e && e.message || e) }); }
  };
  const MIN = 60000, at = (d, h, m = 0, s = 0) => localToMs(d, h, m) + s * 1000;
  // turno no formato interno do aplicativo (entregador)
  const mkShift = (date, preset, [h1, m1], [h2, m2], dels, breaks = []) => {
    const sched = localToMs(date, preset);
    return { id: `s-${date}-${preset}`, date, preset, sched, plannedEnd: sched + (preset === 15 ? 500 : 520) * MIN, start: localToMs(date, h1, m1), end: h2 == null ? null : localToMs(date, h2, m2), closeReason: null,
      breaks: breaks.map(([a, b, c, d]) => ({ s: localToMs(date, a, b), e: localToMs(date, c, d) })),
      deliveries: dels.map(([h, m, b, a, v, extra], i) => { const n = normalizeApt(a); return { id: `d-${date}-${i}`, t: localToMs(date, h, m), block: b, apt: n.apt, floor: n.floor, review: false, source: 'manual', del: false, v: v ?? null, ...(extra || {}) }; }) };
  };
  const mkExport = async (riderId, shifts, exp = fixedNow) => { const db = emptyDb(); db.user = { name: rname(riderId), id: riderId, goal: 60 }; db.shifts = shifts; return buildExport(db, exp); };
  const load = async (riderId, shifts, exp) => importTexts([{ name: `${riderId}.json`, text: JSON.stringify(await mkExport(riderId, shifts, exp)) }]);
  const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  // N entregas espalhadas de hora em hora a partir de h0
  const spread = (h0, n) => rep(n, (i) => [h0 + Math.floor(i / 10), (i % 10) * 6, CFG.blocks[i % 6], `${(i % 17) + 11}${(i % 4) + 1}`.slice(0, 3), 1000 + i]);

  try {
    /* ---- arquivo de fechamento: formato, integridade, validação ---- */
    await T('equipe: Pedro, Bruno, João, Kauã e Nicolas, com reconhecimento por nome', () => {
      eq(ROSTER.map((r) => r.nome), ['Pedro', 'Bruno', 'João', 'Kauã', 'Nicolas']);
      eq(['Joao Silva', 'KAUÃ', 'kaua souza', ' nicolas  santana', 'Pedro'].map((n) => riderByName(n)?.id), ['joao', 'kaua', 'kaua', 'nicolas', 'pedro']); eq(riderByName('Maria'), null);
    });
    await T('fechamento: formato v2 com integridade que não muda com a ordem das chaves', async () => {
      const e = await mkExport('nicolas', [mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 5290]])]);
      eq([e.formato, e.versao, e.entregador], ['ponto-collina/entregas', 2, { id: 'nicolas', nome: 'Nicolas' }]); ok(/^sha256:[0-9a-f]{64}$/.test(e.integridade));
      eq(e.turnos[0].entregas[0], { id: 'd-2026-10-06-0', t: at('2026-10-06', 16, 5), bloco: 'C1', apto: '241', andar: 24, valor: 5290, origem: 'manual', conferir: false, original: null, editadaEm: null, excluida: false, excluidaEm: null, tardia: false, registradaEm: null });
      eq(canonical({ b: 1, a: [2, { d: null, c: 'x' }] }), '{"a":[2,{"c":"x","d":null}],"b":1}');
      eq(await sha256hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
    await T('fechamento: exige saber quem é o entregador', async () => {
      const db = emptyDb(); db.user = { name: 'Fulano', id: null, goal: 60 };
      try { await buildExport(db); throw new Error('aceitou'); } catch (e) { eq(e.code, 'NO_RIDER'); }
    });
    await T('importação: aceita o arquivo íntegro e recusa se for alterado, sem código ou de quem não é da equipe', async () => {
      const e = await mkExport('bruno', [mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 5290]])]), tx = (o) => [{ name: 'a.json', text: JSON.stringify(o) }];
      const good = await importTexts(tx(e)); ok(good[0].ok && good[0].novos === 1 && good[0].entregador === 'Bruno', 'deveria importar');
      const tampered = JSON.parse(JSON.stringify(e)); tampered.turnos[0].entregas[0].valor = 9999; ST = { v: 1, riders: {} };
      ok(/não confere/.test((await importTexts(tx(tampered)))[0].erro), 'valor alterado deve ser recusado');
      const noSig = { ...e }; delete noSig.integridade; ok(/integridade/.test((await importTexts(tx(noSig)))[0].erro));
      const other = { ...e, entregador: { id: 'maria', nome: 'Maria' } }; ok(/desconhecido/.test((await importTexts(tx(other)))[0].erro));
      ok(/JSON/.test((await importTexts([{ name: 'x', text: '{não é json' }]))[0].erro)); ok(/Formato/.test((await importTexts(tx({ a: 1 })))[0].erro)); ok(/Arquivo inválido/.test((await importTexts(tx(null)))[0].erro));
      eq(Object.keys(ST.riders), [], 'nada foi gravado dos arquivos inválidos');
    });
    await T('importação: backup do aplicativo (não é fechamento) é recusado com orientação', async () => {
      const db = emptyDb(); db.user = { name: 'Nicolas', id: 'nicolas', goal: 60 }; db.shifts = [mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 5290]])];
      const r = await importTexts([{ name: 'backup.json', text: JSON.stringify(db) }]); ok(!r[0].ok && /Formato não reconhecido/.test(r[0].erro), r[0].erro);
    });
    await T('importação: descarta registros inválidos e conta o que foi descartado', async () => {
      const e = await mkExport('joao', [mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 5290]])]);
      e.turnos[0].entregas.push({ id: 'x', t: 1, bloco: 'Z9', apto: '241', valor: 1 }, { id: 'y', t: 2, bloco: 'A1', apto: '999', valor: 1 }, { t: 'a' });
      e.turnos.push({ id: 'ruim', data: 'lixo', entrada: 1 });
      e.integridade = 'sha256:' + await sha256hex(canonical({ entregador: 'joao', turnos: e.turnos }));
      const r = await importTexts([{ name: 'a.json', text: JSON.stringify(e) }]); eq([r[0].ok, r[0].novos, r[0].descartadas], [true, 1, 3]);
      eq(compute().shifts[0].live.length, 1);
    });
    await T('importação: valor negativo ou absurdo vira "sem valor"; origem desconhecida vira digitado', async () => {
      const e = await mkExport('joao', [mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 5290], [16, 10, 'A1', '241', 5], [16, 20, 'B1', '181', 7]])]);
      e.turnos[0].entregas[1].valor = -5; e.turnos[0].entregas[2].valor = 99999999; e.turnos[0].entregas[2].origem = '???';
      e.integridade = 'sha256:' + await sha256hex(canonical({ entregador: 'joao', turnos: e.turnos }));
      await importTexts([{ name: 'a.json', text: JSON.stringify(e) }]); const d = compute().shifts[0].dels; eq(d.map((x) => x.valor), [5290, null, null]); eq(d[2].origem, 'manual');
    });

    /* ---- junção de arquivos ---- */
    await T('junção: reimportar não duplica; vale o arquivo mais recente; arquivo velho não sobrescreve o novo', async () => {
      const s1 = mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 1000]]);
      let r = await load('pedro', [s1], at('2026-10-06', 23, 30)); eq([r[0].novos, r[0].atualizados], [1, 0]);
      r = await load('pedro', [s1], at('2026-10-06', 23, 30)); eq([r[0].novos, r[0].atualizados, r[0].mantidos], [0, 1, 0], 'mesmo arquivo: atualiza, não duplica');
      const s2 = JSON.parse(JSON.stringify(s1)); s2.deliveries[0].v = 2000; s2.deliveries.push({ ...s2.deliveries[0], id: 'novo', t: at('2026-10-06', 17), v: 500 });
      r = await load('pedro', [s2], at('2026-10-07', 8)); eq([r[0].atualizados], [1]); eq(compute().shifts.length, 1); eq(compute().shifts[0].live.map((d) => d.valor), [2000, 500]);
      r = await load('pedro', [s1], at('2026-10-06', 23, 30)); eq([r[0].mantidos], [1], 'versão antiga ignorada'); eq(compute().shifts[0].live.length, 2);
    });
    await T('junção: turnos de dias diferentes se somam; consolidado vai e volta sem perder nada', async () => {
      await load('kaua', [mkShift('2026-10-05', 15, [15, 0], [23, 20], spread(15, 12))]); await load('kaua', [mkShift('2026-10-06', 16, [16, 0], [0, 40], spread(16, 8))].map((s) => ({ ...s, end: s.end + 864e5 })));
      await load('bruno', [mkShift('2026-10-06', 15, [15, 0], [23, 20], spread(15, 5))]);
      const c = await buildConsolidated(); eq(c.formato, 'ponto-collina/consolidado'); eq(c.entregadores.map((e) => e.entregador.id), ['bruno', 'kaua']);
      const before = compute().shifts.map((s) => [s.rid, s.id, s.live.length]); ST = { v: 1, riders: {} }; MC = null;
      const r = await importTexts([{ name: 'c.json', text: JSON.stringify(c) }]); eq(r.every((x) => x.ok), true);
      eq(compute().shifts.map((s) => [s.rid, s.id, s.live.length]), before);
    });
    await T('junção: dados de exemplo ficam marcados e podem ser removidos sem tocar nos reais', async () => {
      const e = await mkExport('pedro', [mkShift('2026-10-06', 15, [15, 0], [23, 20], spread(15, 6))]); e.exemplo = true;
      await importTexts([{ name: 'ex.json', text: JSON.stringify(e) }]); ok(compute().shifts[0].ex, 'marcado como exemplo'); ok(dataQuality()[0].text.includes('EXEMPLO'));
      await load('bruno', [mkShift('2026-10-06', 15, [15, 0], [23, 20], spread(15, 6))]); await actions['m-rmex']();
      eq(compute().shifts.map((s) => s.rid), ['bruno']);
    });

    /* ---- cálculos ---- */
    await T('horas líquidas e entregas por hora (mínimo de 4 h para exibir)', async () => {
      await load('joao', [mkShift('2026-10-06', 15, [15, 0], [19, 0], spread(15, 20), [[17, 0, 17, 30]])]);
      const a = aggregate(sliceShifts(mRange('7'), 0)); eq([a.shifts, a.n, a.net], [1, 20, 3.5 * 3600]); eq(a.enough, false); eq(a.perHour, null, 'abaixo de 4 h líquidas: sem taxa');
      await load('joao', [mkShift('2026-10-06', 15, [15, 0], [19, 30], spread(15, 20), [[17, 0, 17, 30]])]); const b = aggregate(sliceShifts(mRange('7'), 0)); eq(b.enough, true); near(b.perHour, 5, 1e-9);
    });
    await T('vendido, ticket e cobertura de valor contam só o que foi informado', async () => {
      await load('bruno', [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[16, 0, 'A1', '241', 5000], [16, 10, 'B1', '181', 3000], [16, 20, 'C1', '151', null], [16, 30, 'C2', '152', null]])]);
      const a = aggregate(sliceShifts(mRange('7'), 0)); eq([a.n, a.sales, a.nv, a.ticket, a.coverage], [4, 8000, 2, 4000, 0.5]); ok(!('salesHour' in a), 'R$/h não é métrica: o valor da comanda não mede o entregador');
    });
    await T('excluídas não contam; corrigidas contam com o valor novo e mostram o original', async () => {
      const edit = { orig: { block: 'A1', apt: '241', v: 1000 }, edAt: at('2026-10-06', 18) }, del = { del: true, delAt: at('2026-10-06', 18, 5) };
      await load('nicolas', [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[16, 0, 'B2', '182', 5000, edit], [16, 10, 'B1', '181', 3000], [16, 20, 'C1', '151', 700, del]])]);
      const s = compute().shifts[0], a = aggregate([s]); eq([s.dels.length, s.live.length, a.n, a.sales], [3, 2, 2, 8000]); near(a.editedPct, 0.5, 1e-9); near(a.deletedPct, 1 / 3, 1e-9);
      const d = s.dels[0]; eq(d.original, { bloco: 'A1', apto: '241', valor: 1000 }); eq([statusOf(d), statusOf(s.dels[2]), statusOf(s.dels[1])], ['Corrigida', 'Excluída', 'Normal']);
    });
    await T('turno aberto conta até o momento do envio', async () => {
      await load('kaua', [mkShift('2026-10-07', 15, [15, 0], [null], spread(15, 5))], at('2026-10-07', 17)); const s = compute().shifts[0]; eq([s.saida, s.sm.net, s.sm.status], [null, 2 * 3600, 'open']);
    });
    await T('horas por faixa do dia somam o líquido, sem pausas e atravessando a meia-noite', async () => {
      await load('pedro', [{ ...mkShift('2026-10-06', 16, [16, 20], [0, 40], [], [[18, 0, 18, 30], [23, 50, 0, 10]]), end: at('2026-10-06', 0, 40) + 864e5, breaks: [{ s: at('2026-10-06', 18), e: at('2026-10-06', 18, 30) }, { s: at('2026-10-06', 23, 50), e: at('2026-10-07', 0, 10) }] }]);
      const s = compute().shifts[0], sum = s.byHour.reduce((a, b) => a + b, 0); eq(sum, s.sm.net); eq(s.byCell.reduce((a, b) => a + b, 0), s.sm.net, 'por dia da semana também soma o líquido');
      eq([s.byCell[1 * 24 + 18], s.byCell[2 * 24 + 0]], [1800, 1800], 'terça 18h (pausa) e quarta 00h: a virada do dia vai para o dia seguinte'); eq(s.byHour[18], 1800, 'meia hora de pausa em 18h'); eq(s.byHour[0], 1800, 'virada do dia: 00:10 a 00:40'); eq(s.byHour[23], 3000, '23:00 a 23:50 (depois a pausa)'); eq(s.byHour[16], 2400, '16:20 a 17:00');
    });
    const two = (id, f, h2 = 19) => load(id, ['2026-10-05', '2026-10-06'].map((d) => mkShift(d, 15, [15, 0], [h2, 0], f)));
    const uniform = (perHour, hours = 4) => rep(perHour * hours, (i) => [15 + Math.floor(i / perHour), (i % perHour) * (60 / perHour), CFG.blocks[i % 6], `${i % 17 + 11}1`, 1000]);
    const others = (base, id) => benchmarkOf(base.filter((s) => s.rid !== id));
    await T('índice ajustado: compara com os DEMAIS (o próprio entregador não entra na referência)', async () => {
      await two('pedro', uniform(10)); await two('bruno', uniform(5));
      const base = sliceShifts(mRange('7'), 0), p = adjustedIndex(base.filter((s) => s.rid === 'pedro'), others(base, 'pedro')), b = adjustedIndex(base.filter((s) => s.rid === 'bruno'), others(base, 'bruno'));
      near(p.index, 200, 0.01); near(b.index, 50, 0.01); near(p.expected, 40, 1e-9); near(p.actual, 80, 1e-9);
    });
    await T('índice ajustado: não pune quem trabalha em horário mais fraco', async () => {
      // Pedro e Bruno 15h-17h com 20/h (hora forte); Bruno 17h-19h com 4/h (hora fraca); João só 17h-19h com 4/h; cada um em duas terças para a referência ter dados
      const dias = ['2026-09-29', '2026-10-06'];
      for (const d of dias) {
        await load('pedro', [mkShift(d, 15, [15, 0], [17, 0], rep(40, (i) => [15 + Math.floor(i / 20), (i % 20) * 3, 'A1', `${i % 17 + 11}1`]))]);
        await load('bruno', [mkShift(d, 15, [15, 0], [19, 0], [...rep(40, (i) => [15 + Math.floor(i / 20), (i % 20) * 3, 'B1', `${i % 17 + 11}1`]), ...rep(8, (i) => [17 + Math.floor(i / 4), (i % 4) * 15, 'B1', `${i % 17 + 11}2`])])]);
        await load('joao', [mkShift(d, 15, [17, 0], [19, 0], rep(8, (i) => [17 + Math.floor(i / 4), (i % 4) * 15, 'C1', `${i % 17 + 11}3`]))]);
      }
      const base = sliceShifts(mRange('30'), 0), j = adjustedIndex(base.filter((s) => s.rid === 'joao'), others(base, 'joao')), all = benchmarkOf(base);
      ok(all.hour[15].rate > all.hour[17].rate * 3, 'hora forte tem ritmo bem maior'); near(j.index, 100, 1, 'João fez 4/h num horário em que os outros fazem 4/h: índice ~100');
      ok(aggregate(base.filter((s) => s.rid === 'joao')).n / 4 < aggregate(base.filter((s) => s.rid === 'pedro')).n / 4, 'o ritmo bruto dele parece menor');
    });
    await T('índice ajustado: corrige também o dia da semana (quem pega o dia fraco não é penalizado)', async () => {
      const seg = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => addDays('2026-08-17', 7 * k)), sex = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => addDays('2026-08-14', 7 * k));
      for (const id of ['bruno', 'joao']) await load(id, [...seg.map((d) => mkShift(d, 15, [15, 0], [19, 0], uniform(3))), ...sex.map((d) => mkShift(d, 15, [15, 0], [19, 0], uniform(10)))]);
      await load('pedro', seg.map((d) => mkShift(d, 15, [15, 0], [19, 0], uniform(3))));         // Pedro só pega segundas, e faz o mesmo ritmo dos outros nas segundas
      const base = sliceShifts(mRange('tudo'), 0), rs = base.filter((s) => s.rid === 'pedro'), bench = others(base, 'pedro'), p = adjustedIndex(rs, bench);
      const horaSo = p.actual / ((aggregate(rs).net / 3600) * bench.hour[15].rate);               // como seria só pela hora do dia
      ok(horaSo < 0.5, `só pela hora ele pareceria muito abaixo (${horaSo.toFixed(2)})`); ok(p.index > 85 && p.index < 95, `pelo dia da semana ele fica perto de 100 (${p.index.toFixed(1)})`);
    });
    await T('índice ajustado: dados insuficientes não geram número', async () => {
      await load('joao', [mkShift('2026-10-06', 15, [15, 0], [15, 30], [[15, 5, 'A1', '241', 1000]])]); const base = sliceShifts(mRange('7'), 0); eq(adjustedIndex(base, benchmarkOf(base)), null);
    });
    await T('tendência: melhorando, caindo, estável e dados insuficientes', async () => {
      const series = (rates) => rates.map((r, i) => mkShift(addDays('2026-09-20', i), 15, [15, 0], [19, 0], rep(Math.round(r * 4), (k) => [15 + Math.floor(k / 12), (k % 12) * 5 % 60, 'A1', '241', 100])));
      const t = async (id, rates) => { await load(id, series(rates)); return trendOf(compute().shifts.filter((s) => s.rid === id)); };
      let r = await t('pedro', [5, 5, 5, 6, 6, 6, 8, 8, 8, 8]); eq([r.enough, r.label], [true, 'melhorando']); ok(r.delta > 8);
      r = await t('bruno', [8, 8, 8, 8, 8, 6, 6, 5, 5, 5]); eq(r.label, 'caindo');
      r = await t('joao', [6, 6, 6, 6, 6, 6, 6, 6, 6, 6]); eq(r.label, 'estável');
      r = await t('kaua', [6, 6, 7, 7]); eq([r.enough, r.count], [false, 4]);
    });
    await T('evolução semanal agrupa por semana (começando na segunda)', async () => {
      eq(['2026-10-05', '2026-10-06', '2026-10-11', '2026-10-12'].map(weekStart), ['2026-10-05', '2026-10-05', '2026-10-05', '2026-10-12']);
      await load('pedro', [mkShift('2026-09-30', 15, [15, 0], [19, 0], spread(15, 8)), mkShift('2026-10-06', 15, [15, 0], [19, 0], spread(15, 16))]);
      const w = weeklyRate(compute().shifts); eq(w.map((x) => [x.w, x.n]), [['2026-09-28', 8], ['2026-10-05', 16]]); near(w[1].rate, 4, 1e-9);
    });
    await T('períodos: hoje, 7 dias, este mês e tudo', async () => {
      eq(mRange('hoje'), { from: '2026-10-07', to: '2026-10-07', days: 1 }); eq(mRange('7'), { from: '2026-10-01', to: '2026-10-07', days: 7 }); eq(mRange('mes').from, '2026-10-01');
      await load('pedro', [mkShift('2026-09-02', 15, [15, 0], [19, 0], spread(15, 3))]); eq(mRange('tudo').from, '2026-09-02');
    });
    await T('filtro por turno 15h/16h e por período', async () => {
      await load('pedro', [mkShift('2026-10-05', 15, [15, 0], [19, 0], spread(15, 4)), mkShift('2026-10-06', 16, [16, 0], [20, 0], spread(16, 6))]);
      eq([sliceShifts(mRange('7'), 0).length, sliceShifts(mRange('7'), 15).length, sliceShifts(mRange('7'), 16).length, sliceShifts(mRange('hoje'), 0).length], [2, 1, 1, 0]);
    });

    /* ---- consulta de registros (dúvidas dos entregadores) ---- */
    const seedQuery = async () => {
      await load('pedro', [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[15, 22, 'C2', '273', 1908], [15, 39, 'C1', '12', 1166], [17, 5, 'A1', '241', 5290, { source: 'photo' }], [20, 30, 'B2', 'SS12', null]])]);
      await load('bruno', [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[15, 22, 'C2', '273', 2000, { orig: { block: 'C2', apt: '272', v: 2000 }, edAt: at('2026-10-06', 18) }], [18, 0, 'A2', '71', 900, { del: true, delAt: at('2026-10-06', 18, 1) }], [19, 0, 'B1', '241', 3000, { review: true }]])]);
    };
    await T('consulta: por entregador, dia e faixa de horário', async () => {
      await seedQuery(); const q = (o) => queryDeliveries({ riders: new Set(), ...o }).map((d) => `${d.rid}:${d.bloco}${d.apto}`).sort();
      eq(q({}).length, 7); eq(q({ riders: new Set(['bruno']) }).length, 3); eq(q({ from: '2026-10-07' }), []); eq(q({ to: '2026-10-05' }), []);
      eq(q({ tFrom: '15:00', tTo: '15:30' }), ['bruno:C2273', 'pedro:C2273']); eq(q({ tFrom: '15:39', tTo: '15:39' }), ['pedro:C112']); eq(q({ tFrom: '20:00' }), ['pedro:B2SS12']);
    });
    await T('consulta: bloco, apartamento, valor, origem e situação', async () => {
      await seedQuery(); const q = (o) => queryDeliveries({ riders: new Set(), ...o }).map((d) => `${d.rid}:${d.bloco}${d.apto}`).sort();
      eq(q({ block: 'C2' }), ['bruno:C2273', 'pedro:C2273']); eq(q({ apt: '241' }), ['bruno:B1241', 'pedro:A1241']); eq(q({ apt: 'ss' }), ['pedro:B2SS12']); eq(q({ vMin: 2000 }), ['bruno:B1241', 'bruno:C2273', 'pedro:A1241']);
      eq(q({ vMin: 1000, vMax: 2000 }), ['bruno:C2273', 'pedro:C112', 'pedro:C2273']); eq(q({ source: 'photo' }), ['pedro:A1241']);
      eq(q({ status: 'editada' }), ['bruno:C2273']); eq(q({ status: 'excluida' }), ['bruno:A271']); eq(q({ status: 'conferir' }), ['bruno:B1241']); eq(q({ status: 'normal' }).length, 4);
    });
    await T('consulta: o registro mostra horário exato, valores originais e o turno', async () => {
      await seedQuery(); const d = allDeliveries().find((x) => x.rid === 'bruno' && x.original); eq([fmtTimeSec(at('2026-10-06', 15, 22, 7)), d.original.apto, d.apto], ['15:22:07', '272', '273']);
      const s = compute().shifts.find((x) => x.rid === 'bruno'); eq([fmtTime(s.entrada), fmtTime(s.saida)], ['15:00', '23:00']);
    });

    /* ---- qualidade dos dados ---- */
    await T('atenção: dados desatualizados, entregador sem arquivo e mais de um turno no mesmo dia', async () => {
      await load('pedro', [mkShift('2026-10-01', 15, [15, 0], [19, 0], spread(15, 3))], Date.now() - 5 * 864e5);
      await load('bruno', [{ ...mkShift('2026-10-06', 15, [15, 0], [19, 0], spread(15, 3)) }, { ...mkShift('2026-10-06', 16, [16, 0], [20, 0], spread(16, 3)), id: 'outro' }], Date.now());
      const t = dataQuality().map((i) => i.text).join(' | ');
      ok(t.includes('Pedro: dados só até') && t.includes('Joao') === false && t.includes('João: nenhum arquivo') && t.includes('Bruno: mais de um turno no mesmo dia'), t);
    });

    await T('entrada recuada por entrega esquecida: chega ao painel com a entrada batida de verdade', async () => {
      const sh = mkShift('2026-10-06', 15, [16, 10], [23, 0], [[16, 20, 'A1', '241', 1000]]); sh.startOrig = at('2026-10-06', 19, 19);
      await load('bruno', [sh]); const s = compute().shifts[0]; eq([s.entrada, s.entradaOriginal], [at('2026-10-06', 16, 10), at('2026-10-06', 19, 19)]);
      ok(dataQuality().some((i) => i.text.includes('entrada recuada')));
      actions['m-shift']({ dataset: { r: 'bruno', s: sh.id } }); try { ok($('sheet').textContent.includes('Entrada ajustada') && $('sheet').textContent.includes('19:19')); } finally { closeSheet(); }
      const pre = mkShift('2026-10-05', 15, [15, 0], [23, 0], [[16, 0, 'A1', '241', 1000]]); await load('joao', [pre]); eq(compute().shifts.find((x) => x.rid === 'joao').entradaOriginal, null);
    });

    await T('mapa de calor: entrega depois da meia-noite cai no dia da semana real (quarta 00h, não terça)', async () => {
      const sh = mkShift('2026-10-06', 16, [16, 0], [null], [[17, 0, 'A1', '241', 1000]]); sh.end = at('2026-10-07', 0, 40);
      sh.deliveries.push({ id: 'x', t: at('2026-10-07', 0, 10), block: 'B1', apt: '151', floor: 15, review: false, source: 'manual', del: false, v: 500 });
      await load('bruno', [sh]); const h = heatmap(compute().shifts);
      ok(/title="Qua 00h: 1"/.test(h) && /title="Ter 17h: 1"/.test(h) && /title="Ter 00h: 0"/.test(h), 'deveria estar em Qua 00h');
    });

    await T('robustez: 300 arquivos com campos trocados/apagados não derrubam a importação nem as telas', async () => {
      let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const base = await mkExport('bruno', [mkShift('2026-10-05', 15, [15, 0], [23, 0], spread(15, 12), [[18, 0, 18, 20]]), mkShift('2026-10-06', 16, [16, 0], [null], spread(16, 6))]);
      const valores = [null, 'x', '', -1, 0, 1e20, {}, [], true, '2026-13-45', 1.5, [1, 2]];
      const paths = (o, pre = []) => (o && typeof o === 'object' ? Object.keys(o).flatMap((k) => [[...pre, k], ...paths(o[k], [...pre, k])]) : []);
      const host = document.createElement('div'); host.id = 'view'; document.body.appendChild(host); const falhas = [];
      try {
        for (let i = 0; i < 300; i++) {
          const o = JSON.parse(JSON.stringify(base)), alvo = paths({ turnos: o.turnos }), p = alvo[Math.floor(rnd() * alvo.length)], v = valores[Math.floor(rnd() * valores.length)];
          let ref = { turnos: o.turnos }; for (const k of p.slice(0, -1)) ref = ref[k]; if (rnd() < 0.3) delete ref[p[p.length - 1]]; else ref[p[p.length - 1]] = v;
          o.integridade = 'sha256:' + await sha256hex(canonical({ entregador: 'bruno', turnos: o.turnos }));
          ST = novoEstado(); MC = null;
          try {
            await importTexts([{ name: 'f.json', text: JSON.stringify(o) }]); MG.period = 'tudo'; MG.rider = 'bruno';
            for (const fn of [renderGeral, renderInd, renderCons, renderDados]) { fn(host); const t = host.textContent; if (/undefined|NaN|\[object/.test(t)) throw new Error(fn.name + ' mostra undefined/NaN'); }
            dataQuality(); await buildConsolidated();
          } catch (e) { falhas.push(`${p.join('.')}=${JSON.stringify(v)}: ${e.message}`); }
        }
      } finally { host.remove(); MG.period = '30'; }
      ok(!falhas.length, falhas.slice(0, 3).join(' | ') + ` (${falhas.length} falhas)`);
    });

    /* ---- turnos ignorados ---- */
    await T('ignorar turno: sai das análises, consultas e do consolidado, e volta ao restaurar', async () => {
      await load('bruno', [mkShift('2026-10-05', 15, [15, 0], [23, 0], spread(15, 6)), mkShift('2026-10-06', 15, [15, 0], [23, 0], spread(15, 4))]);
      eq([compute().shifts.length, allDeliveries().length], [2, 10]);
      await ignoreShift('bruno', 's-2026-10-05-15', 'Turno de teste');
      eq([compute().shifts.length, allDeliveries().length, activeTurnos('bruno').length], [1, 4, 1]); eq(ignoredList().map((i) => [i.rid, i.data, i.entregas, i.motivo]), [['bruno', '2026-10-05', 6, 'Turno de teste']]);
      eq((await buildConsolidated()).entregadores[0].turnos.length, 1, 'consolidado só com o que vale');
      await load('bruno', [mkShift('2026-10-05', 15, [15, 0], [23, 0], spread(15, 6))], Date.now() + 1000);          // chega de novo pela nuvem: continua ignorado
      eq(compute().shifts.length, 1);
      await restoreShift('bruno', 's-2026-10-05-15'); eq([compute().shifts.length, ignoredList().length], [2, 0]);
    });
    await T('ignorar turno: aviso de dia repetido deixa de aparecer quando um dos turnos é ignorado', async () => {
      await load('bruno', [mkShift('2026-10-06', 15, [15, 0], [19, 0], spread(15, 3)), { ...mkShift('2026-10-06', 16, [16, 0], [20, 0], spread(16, 3)), id: 'outro' }]);
      ok(dataQuality().some((i) => i.text.includes('mais de um turno no mesmo dia')));
      await ignoreShift('bruno', 'outro', 'Turno duplicado'); ok(!dataQuality().some((i) => i.text.includes('mais de um turno no mesmo dia')));
    });
    await T('ignorar turno: a ficha do turno oferece o botão e ele funciona', async () => {
      await load('bruno', [mkShift('2026-10-06', 15, [15, 0], [19, 0], spread(15, 3))]);
      const host = document.createElement('div'); document.body.appendChild(host);
      try {
        actions['m-shift']({ dataset: { r: 'bruno', s: 's-2026-10-06-15' } }); ok($('ignGo'), 'botão Ignorar');
        $('ignGo').click(); ok($('ignGo').dataset.sure, 'pede confirmação'); eq(compute().shifts.length, 1);
        $('ignGo').click(); await new Promise((r) => setTimeout(r, 30)); eq(compute().shifts.length, 0); eq(ST.ignorados['bruno|s-2026-10-06-15'].motivo, 'Nome escolhido errado');
      } finally { host.remove(); closeSheet(); }
    });

    /* ---- pontos de atenção ---- */
    await T('atenção: com a conexão automática, folga não vira "desatualizado"', async () => {
      await load('pedro', [mkShift('2026-10-01', 15, [15, 0], [19, 0], spread(15, 3))], Date.now() - 5 * 864e5);
      SYNC.cfg = null; ok(dataQuality().some((i) => i.text.includes('Pedro: dados só até')) && freshness(ST.riders.pedro).cls === 'warn');
      SYNC.cfg = { repo: 'dono/ponto-dados', token: TOKEN };
      ok(!dataQuality().some((i) => i.text.includes('dados só até')), 'sem aviso de atraso'); eq(freshness(ST.riders.pedro), { cls: 'ok', text: 'automático' });
      ok(dataQuality().some((i) => i.text.includes('Bruno: ainda não enviou nada')));
    });
    await T('atenção: relógio do aparelho adiantado é apontado', async () => {
      await load('kaua', [mkShift('2026-10-06', 15, [15, 0], [19, 0], spread(15, 3))], fixedNow + 3 * 3600000);
      ok(dataQuality().some((i) => i.text.includes('Kauã: o relógio do aparelho está adiantado')));
    });
    await T('atenção: muitas entregas lançadas depois viram aviso (a partir de 5 e mais de 10%)', async () => {
      const late = (n) => rep(n, (i) => [16, i, 'A1', `${i % 17 + 11}1`, 1000, { late: true, regAt: at('2026-10-06', 17, 0) }]);
      await load('pedro', [mkShift('2026-10-06', 15, [15, 0], [19, 0], [...spread(15, 20), ...late(4)])]);
      ok(!dataQuality().some((i) => i.text.includes('lançadas depois')), '4 de 24: abaixo do mínimo');
      await load('bruno', [mkShift('2026-10-06', 15, [15, 0], [19, 0], [...rep(20, (i) => [15, i, 'B1', `${i % 17 + 11}2`, 1000]), ...late(6)])]);
      const t = dataQuality().map((i) => i.text).join(' | '); ok(t.includes('Bruno: 23% das entregas (6 de 26)') && !t.includes('Pedro: 1'), t);
    });

    /* ---- conexão automática ---- */
    await T('conexão: o link do gerente leva repositório e chave, e link torto é ignorado', () => {
      const c = { repo: 'dono/ponto-dados', token: TOKEN }, link = syncLink('https://x.github.io/app/', c);
      ok(link.startsWith('https://x.github.io/app/#sync='));
      eq(parseSyncHash('#' + link.split('#')[1]), c);
      eq([parseSyncHash('#sync=@@@'), parseSyncHash(''), parseSyncHash('#sync=' + b64url('{"r":"a b","t":"curto"}')), parseSyncHash('#outra=1')], [null, null, null, null]);
      eq(unb64url(b64url('João é ção')), 'João é ção');
    });
    await T('conexão: o entregador envia, o gerente recebe e confere a integridade', async () => {
      await withGh(async (g) => {
        DB.shifts = [mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 5290], [17, 0, 'B2', '12', null]])];
        eq(await syncPush(), true); eq([g.puts, SYNC.state.ok, SYNC.state.err], [1, true, null]);
        ok(g.files['entregas/joao.json'].message.startsWith('João'), 'mensagem do commit');
        const r = await syncPull(); eq([r.changed, PULL.err], [1, null]);
        eq(ST.riders.joao.turnos[0].entregas.map((e) => e.apto), ['241', '12']); eq(r.report.filter((x) => x.estado === 'sem arquivo').length, 4);
      });
    });
    await T('conexão: reenvio sem mudança não gera nada novo; turno aberto renova a hora do envio', async () => {
      await withGh(async (g) => {
        DB.shifts = [mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 5290]])];
        await syncPush(); await syncPush(); eq(g.puts, 1);
        DB.shifts = [mkShift('2026-10-06', 15, [15, 3], [null], [[16, 5, 'C1', '241', 5290]])];
        await syncPush(); await syncPush(); eq(g.puts, 3);
      });
    });
    await T('conexão: o que já está com o gerente nunca se perde (aparelho novo ou dados apagados)', async () => {
      await withGh(async (g) => {
        DB.shifts = [mkShift('2026-10-05', 15, [15, 0], [23, 0], [[16, 0, 'A1', '111', 1000]]), mkShift('2026-10-06', 15, [15, 0], [23, 0], [[16, 0, 'B1', '222', 2000]])];
        await syncPush();
        DB.shifts = [mkShift('2026-10-07', 15, [15, 0], [null], [[16, 0, 'C1', '281', 3000]])];        // aparelho novo: só tem o turno de hoje
        await syncPush();
        await syncPull({ force: true });
        eq(ST.riders.joao.turnos.map((s) => s.data), ['2026-10-05', '2026-10-06', '2026-10-07']);
        DB.shifts = []; await syncPush();                                                               // dados apagados: não apaga a nuvem
        eq(JSON.parse(g.files['entregas/joao.json'].text).turnos.length, 3);
      });
    });
    await T('conexão: se outro envio chega no meio, tenta de novo com a versão certa', async () => {
      await withGh(async (g) => {
        DB.shifts = [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[16, 0, 'A1', '111', 1000]])];
        await syncPush();
        DB.shifts.push(mkShift('2026-10-07', 15, [15, 0], [23, 0], [[16, 0, 'B1', '222', 2000]]));
        g.beforePut = () => { g.files['entregas/joao.json'].sha = 'outra-versao'; };
        eq(await syncPush(), true); eq(g.puts, 3); eq(JSON.parse(g.files['entregas/joao.json'].text).turnos.length, 2);
      });
    });
    await T('conexão: busca só o que mudou (304) e recusa arquivo de outro entregador', async () => {
      await withGh(async (g) => {
        DB.shifts = [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[16, 0, 'A1', '111', 1000]])];
        await syncPush(); await syncPull(); const getsA = g.gets;
        const r2 = await syncPull(); eq(r2.changed, 0); eq(r2.report.find((x) => x.id === 'joao').estado, 'igual'); eq(g.gets - getsA, 5);
        g.files['entregas/pedro.json'] = { text: g.files['entregas/joao.json'].text, sha: 'x1' };
        const r3 = await syncPull(); eq(r3.report.find((x) => x.id === 'pedro').estado, 'erro'); ok(!ST.riders.pedro);
      });
    });
    await T('conexão: painel vazio (dados do navegador apagados) baixa tudo de novo, mesmo com a memória de "nada mudou"', async () => {
      await withGh(async (g) => {
        DB.shifts = [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[16, 0, 'A1', '111', 1000]])];
        await syncPush(); await syncPull(); ok(ST.riders.joao);
        ST = novoEstado();                                                  // o banco do navegador sumiu, mas a memória (etag) ficou
        const r = await syncPull(); eq(r.changed, 1); ok(ST.riders.joao, 'dados de volta');
      });
    });
    await T('conexão: arquivo adulterado na nuvem é recusado pela integridade', async () => {
      await withGh(async (g) => {
        DB.shifts = [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[16, 0, 'A1', '111', 1000]])];
        await syncPush();
        const o = JSON.parse(g.files['entregas/joao.json'].text); o.turnos[0].entregas[0].valor = 99999; g.files['entregas/joao.json'] = { text: JSON.stringify(o), sha: 'z' };
        const r = await syncPull(); eq(r.report.find((x) => x.id === 'joao').estado, 'erro'); ok(!ST.riders.joao);
      });
    });
    await T('conexão: sem internet e chave inválida geram avisos claros, sem travar', async () => {
      await withGh(async (g) => {
        DB.shifts = [mkShift('2026-10-06', 15, [15, 0], [23, 0], [[16, 0, 'A1', '111', 1000]])];
        g.offline = true; eq(await syncPush(), false); ok(/Sem internet/.test(SYNC.state.err), SYNC.state.err);
        await syncPull(); ok(/Sem internet/.test(PULL.err));
        g.offline = false; g.token = 'github_pat_OUTRA00000000000000000'; eq(await syncPush(), false); ok(/token/.test(SYNC.state.err), SYNC.state.err);
        await rejects(() => ghCheck(SYNC.cfg), /token/);
        g.token = TOKEN; eq(await syncPush(), true); eq(SYNC.state.err, null);
      });
    });
    await T('conexão: sem escolher quem é, ou sem conexão, não envia nada', async () => {
      await withGh(async (g) => {
        DB.user = { name: 'Fulano', id: null, goal: 60 }; DB.shifts = [mkShift('2026-10-06', 15, [15, 0], [23, 0], [])];
        eq(await syncPush(), false); eq(g.puts, 0);
        DB.user = { name: 'João', id: 'joao', goal: 60 }; SYNC.cfg = null; eq(await syncPush(), false); eq(g.puts, 0);
      });
    });
    await T('esquecida: aparece como lançada depois no painel, com a hora do registro, e dá para filtrar', async () => {
      const sh = mkShift('2026-10-06', 15, [15, 3], [23, 20], [[16, 5, 'C1', '241', 5290], [17, 0, 'B2', '12', 2000, { late: true, regAt: localToMs('2026-10-06', 17, 40) }]]);
      await load('bruno', [sh]);
      const l = allDeliveries().filter((d) => d.rid === 'bruno'); eq(l.map((d) => [d.apto, d.tardia, d.registradaEm]), [['241', false, null], ['12', true, localToMs('2026-10-06', 17, 40)]]);
      eq(queryDeliveries({ status: 'tardia' }).map((d) => d.apto), ['12']); eq(fmtLag(40 * MIN), '40 min'); eq(fmtLag(65 * MIN), '1h05');
      near(aggregate(compute().shifts).postedPct, 0.5, 1e-9);
      const host = document.createElement('div'); document.body.appendChild(host);
      try { MG.tab = 'ind'; MG.rider = 'bruno'; MG.period = 'tudo'; renderInd(host); ok(host.innerHTML.includes('lançadas depois')); } finally { host.remove(); MG.period = '30'; }
    });

    /* ---- apresentação ---- */
    await T('telas: renderizam com dados, sem dados e com poucos dados', async () => {
      const host = document.createElement('div'); host.id = 'view'; host.className = 'hide'; document.body.appendChild(host);
      try {
        for (const fn of [renderGeral, renderInd, renderCons, renderDados]) { fn(host); ok(host.innerHTML.length > 100, fn.name + ' vazio'); }
        await seedQuery(); for (const t of ['hoje', '7', '30', 'mes', '90', 'tudo']) { MG.period = t; for (const fn of [renderGeral, renderInd]) { fn(host); ok(!host.innerHTML.includes('undefined') && !host.innerHTML.includes('NaN'), `${fn.name}/${t}: undefined/NaN na tela`); } }
        MG.period = '30'; MG.rider = 'pedro'; renderGeral(host); ok(host.innerHTML.includes('Desempenho por entregador')); renderCons(host); ok(host.querySelector('#qres table'));
        eq(esc('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
      } finally { host.remove(); MG.period = '30'; }
    });
  } finally {
    ST = saved.ST; MPERSIST = saved.MPERSIST; fixedNow = saved.fixedNow; MC = saved.MC; DB = saved.DB; persist = saved.persist;
    SYNC.cfg = saved.cfg; SYNC.fetch = saved.fetch; SYNC.off = saved.off; ETAGS = saved.etags; Object.assign(SYNC.state, saved.state); Object.assign(PULL, saved.pull);
  }
  return results;
}

async function runMgrTestsView() {
  const res = await runMgrTests();
  const passed = res.filter((r) => r.ok).length;
  window.__selftest = { passed, total: res.length, failed: res.filter((r) => !r.ok) };
  const box = $('selftest');
  box.classList.remove('hide');
  box.innerHTML = `<div class="wrap" style="padding-top:20px"><h1 style="font-family:Cinzel,serif">Autotestes · Gerência</h1>
    <div class="card"><b style="font-size:22px" class="${passed === res.length ? 'good' : 'bad'}">${passed} / ${res.length} passaram</b></div>
    ${res.map((r) => `<div class="kv"><span>${r.ok ? '✔' : '✘'} ${esc(r.name)}</span><span class="${r.ok ? 'good' : 'bad'}">${r.ok ? 'ok' : esc(r.err)}</span></div>`).join('')}
    <p><a href="./gerente.html" style="color:var(--gold2)">Voltar</a></p></div>`;
  document.title = `Autotestes Gerência ${passed}/${res.length}`;
}
