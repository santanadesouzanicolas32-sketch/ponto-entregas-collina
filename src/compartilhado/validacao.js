/* Conferências pequenas usadas ao ler dados de fora (disco, backup, arquivos). */
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isInt = (n) => Number.isInteger(n);
const str = (v, max) => String(v ?? '').slice(0, max);
