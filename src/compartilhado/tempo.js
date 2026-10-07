/* Relógio e fuso (America/Sao_Paulo). `now()` é o único relógio do sistema. */
let clockOffset = 0, fixedNow = null;      // só testes
const now = () => fixedNow ?? Math.floor((Date.now() + clockOffset) / 1000) * 1000;   // precisão de 1 s, como o servidor
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

const mk = (o) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...o });
const F_TIME = mk({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const F_DM = mk({ day: '2-digit', month: '2-digit' });
const F_LONG = mk({ weekday: 'long', day: 'numeric', month: 'long' });
const F_SHORT = mk({ weekday: 'short', day: 'numeric', month: 'short' });
const F_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

function parts(ms) {
  const o = {};
  for (const p of F_PARTS.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
const ymdOf = (ms) => { const p = parts(ms); return `${p.year}-${p.month}-${p.day}`; };
const hourOf = (ms) => Number(parts(ms).hour) % 24;
/** Dia da semana no relógio de São Paulo: 0 = segunda ... 6 = domingo. */
const dowOfYmd = (ymd) => (new Date(ymd + 'T12:00:00Z').getUTCDay() + 6) % 7;
const dowOf = (ms) => dowOfYmd(ymdOf(ms));
/** Casa de 0 a 167 = dia da semana x hora (a mesma hora numa segunda e numa sexta são casas diferentes). */
const cellOf = (ms) => dowOf(ms) * 24 + hourOf(ms);
const fmtTime = (ms) => (ms == null ? '—' : F_TIME.format(new Date(ms)));
const fmtDM = (ms) => F_DM.format(new Date(ms));
const fmtDateTime = (ms) => `${fmtDM(ms)} ${fmtTime(ms)}`;
const ymdToDm = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** data + hora do relógio de São Paulo -> milissegundos UTC (resolve o deslocamento iterando; trata horário de verão) */
function localToMs(ymd, h, mi = 0) {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(guess);
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    const diff = target - shown;
    if (!diff) break;
    guess += diff;
  }
  return guess;
}
