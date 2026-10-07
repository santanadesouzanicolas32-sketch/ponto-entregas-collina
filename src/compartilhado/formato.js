/* Formatação de números e dinheiro (centavos). */
function dur(sec) { const m = Math.round((sec || 0) / 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; }
const num1 = (n) => (n == null ? '—' : String(Math.round(n * 10) / 10).replace('.', ','));
const pct = (n) => (n == null ? '' : `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}%`);
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (cents) => (cents == null ? '—' : BRL.format(cents / 100));
/** "52", "52,5", "52,50", "R$ 1.234,56", "1234.56" -> centavos (inteiro). Vazio -> null. Inválido -> erro. */
function parseMoney(text) {
  let s = String(text ?? '').replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!s) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+\.\d{1,2}$/.test(s)) throw new AppErr('INVALID_VALUE', 'Valor inválido. Exemplo: 52,90');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // 1.234 = mil duzentos e trinta e quatro
  const cents = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > 1000000) throw new AppErr('INVALID_VALUE', 'Valor fora do limite (até R$ 10.000,00).');
  return cents;
}
