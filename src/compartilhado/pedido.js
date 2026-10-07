/* Regras do pedido: bloco, apartamento e faixa de andar. */
/* ---------------- regras de ponto (porte das regras do servidor) ---------------- */
function normalizeApt(raw) {
  const apt = String(raw || '').replace(/\s+/g, '').toUpperCase();
  if (/^SS\d{1,2}$/.test(apt)) return { apt, floor: 0 };
  if (/^[1-9]\d{1,2}$/.test(apt)) {
    const n = parseInt(apt, 10), floor = Math.floor(n / 10), fin = n % 10;
    if (floor >= 1 && floor <= CFG.maxFloor && fin >= 1) return { apt: String(n), floor };
  }
  throw new AppErr('INVALID_APARTMENT', 'Apartamento inválido. Use andar+final (ex: 241) ou SS + número (ex: SS12).');
}
function normalizeBlock(raw) {
  const b = String(raw || '').trim().toUpperCase();
  if (!CFG.blocks.includes(b)) throw new AppErr('INVALID_BLOCK', `Bloco inválido. Use um destes: ${CFG.blocks.join(', ')}.`);
  return b;
}
function floorBand(f) {
  if (f == null) return null;
  const b = FLOOR_BANDS.find(([, lo, hi]) => f >= lo && f <= hi);
  return b ? b[0] : null;
}
