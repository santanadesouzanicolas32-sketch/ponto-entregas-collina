/* Leitura da comanda: interpreta o texto do OCR (bloco, apartamento, valor). */
/* ---------------- leitura da comanda: interpretação do texto (OCR) ---------------- */
// Valor da comanda: prefere "TOTAL"/"VALOR TOTAL"/"A PAGAR"; sem rótulo, usa o maior "R$ x,xx" e pede conferência.
function moneyFromToken(tok) {
  const f = String(tok).replace(/[OQD]/g, '0').replace(/[IL|!]/g, '1').replace(/S/g, '5').replace(/\s+/g, '');
  try { const c = parseMoney(f); return c && c >= 100 ? c : null; } catch { return null; }
}
function parseValue(raw) {
  const NUM = '(\\d[\\dOQDIL|!S]{0,3}(?:[.,][\\dOQDIL|!S]{3})*[.,][\\dOQDIL|!S]{2})(?![\\dOQDIL|!S])';
  const labeled = [/\bTOTAL\s*(?:GERAL|A\s*PAGAR|PEDIDO|DO\s*PEDIDO)?\s*[:=]?\s*(?:R\s*\$?)?\s*/, /\bVALOR\s*(?:TOTAL|A\s*PAGAR|DO\s*PEDIDO)?\s*[:=]?\s*(?:R\s*\$?)?\s*/, /\bA\s*PAGAR\s*[:=]?\s*(?:R\s*\$?)?\s*/];
  for (const pre of labeled) {
    const m = raw.match(new RegExp(pre.source + NUM));
    if (m) { const c = moneyFromToken(m[1]); if (c) return { value: c, sure: true }; }
  }
  let best = null;
  for (const m of raw.matchAll(new RegExp('R\\s*\\$\\s*' + NUM, 'g'))) { const c = moneyFromToken(m[1]); if (c && (!best || c > best)) best = c; }
  return best ? { value: best, sure: false } : { value: null, sure: false };
}

// O OCR confunde caracteres parecidos (l/I/| por 1, Z por 2, S por 5, G por C...). Aqui corrigimos só dentro dos
// formatos esperados e marcamos a leitura como "para conferir" quando uma correção foi necessária.
const BLOCK_LETTER = { A: 'A', B: 'B', C: 'C', G: 'C', '(': 'C', 8: 'B' };
const BLOCK_DIGIT = { 1: '1', 2: '2', I: '1', L: '1', '|': '1', '!': '1', Z: '2' };
const DIGIT_FIX = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', '!': '1', Z: '2', S: '5', B: '8' };
function aptFromToken(tok) {
  let t = String(tok || '').replace(/\s+/g, ''), fixed = false;
  let m = t.match(/^(?:SS|S5|5S|55|S8|\$S|S\$)(\d{1,2})$/);          // subsolo: "SS12" lido como S812, 5512...
  if (m) { fixed = !t.startsWith('SS'); return finishApt('SS' + m[1], fixed); }
  m = t.match(/^SS([A-Z|!]{1,2}|\d[A-Z|!]|[A-Z|!]\d)$/);
  if (m) { const d = m[1].replace(/./g, (c) => DIGIT_FIX[c] ?? c); if (/^\d{1,2}$/.test(d)) return finishApt('SS' + d, true); }
  if (/^SS\d{1,2}$/.test(t)) return finishApt(t, false);
  const f = t.replace(/./g, (c) => (/\d/.test(c) ? c : DIGIT_FIX[c] ?? c));
  if (/^\d{2,3}$/.test(f)) return finishApt(f, f !== t);
  return null;
}
function finishApt(apt, fixed) { try { const n = normalizeApt(apt); return { apt: n.apt, floor: n.floor, fixed }; } catch { return null; } }

/** Extrai bloco e apartamento do texto reconhecido. O texto bruto (nome, telefone) NUNCA é guardado. */
function parseComanda(rawText) {
  let t = String(rawText || '').toUpperCase().replace(/¦/g, '|').replace(/\s+/g, ' ');
  const labeled = t;   // o número logo depois de "APTO" é lido antes da limpeza (4 caracteres podem ser um subsolo mal lido: 5512 = SS12)
  // remove telefones, CEP e números longos (evitam falsos apartamentos)
  t = t.replace(/\(?\d{2}\)?\s*9?\s*\d{4}\s*[-.]?\s*\d{4}/g, ' ').replace(/\d{5}\s*-\s*\d{3}/g, ' ').replace(/\d{4,}/g, ' ');
  let block = null, apt = null, floor = null, explicitBlock = false, explicitApt = false, fixed = false;
  const TOK = /([A-Z0-9|!$]{2,5})(?![A-Z0-9])/.source;

  let m = t.match(/\b(?:BLOCO|BLOC|BLO|BL|TORRE|TR)\s*[:.\-]?\s*([ABCG(8])\s*[-.]?\s*([12ILZ|!])(?![A-Z0-9])/);
  if (m) { block = BLOCK_LETTER[m[1]] + BLOCK_DIGIT[m[2]]; explicitBlock = true; fixed = fixed || m[1] !== block[0] || m[2] !== block[1]; }

  m = labeled.match(new RegExp(/\b(?:APARTAMENTO|APTO|APT|AP|UNIDADE|UN)\.?\s*[:.\-NºO°]*\s*/.source + TOK));
  if (m) { const a = aptFromToken(m[1]); if (a) { ({ apt, floor } = a); explicitApt = true; fixed = fixed || a.fixed; } }

  if (!block || !apt) {                                   // formato combinado: "C1-241", "C1 241"
    m = t.match(new RegExp(/(?:^|[^A-Z0-9])[A-Z]?([ABCG(])\s*([12ILZ|!])\s*[-–/,. ]\s*/.source + TOK));
    if (m) {
      const a = aptFromToken(m[3]);
      if (a) {
        const b = BLOCK_LETTER[m[1]] + BLOCK_DIGIT[m[2]];
        block = block || b; if (!apt) { apt = a.apt; floor = a.floor; }
        fixed = fixed || a.fixed || m[1] !== b[0] || m[2] !== b[1];
      }
    }
  }
  if (!apt) {
    m = t.match(/\b(?:SS|SUBSOLO)\s*(\d{1,2})\b/);
    if (m) { const a = finishApt('SS' + m[1], false); if (a) { apt = a.apt; floor = a.floor; } }
  }
  if (block && !CFG.blocks.includes(block)) block = null;
  const readable = !!(block && apt);
  let confidence = 'nenhuma';
  if (readable) confidence = explicitBlock && explicitApt && !fixed ? 'alta' : 'media';
  else if (block || apt) confidence = 'baixa';
  const val = parseValue(labeled);
  return { block, apt, floor, readable, confidence, needsReview: confidence !== 'alta', value: val.value, valueSure: val.sure };
}
