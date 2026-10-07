/* Conferências pequenas usadas ao ler dados de fora (disco, backup, arquivos). */
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isInt = (n) => Number.isInteger(n);
const str = (v, max) => String(v ?? '').slice(0, max);
/** Devolve o.k; se ainda não existe, cria com make() (no lugar de ||=, que celulares antigos não entendem). */
const getOr = (o, k, make) => (o[k] === undefined ? (o[k] = make()) : o[k]);
/** Instante plausível (anos 2000 a 2100): valores fora disso quebram a formatação de datas e só podem vir de arquivo corrompido. */
const isTs = (n) => isNum(n) && n > 946684800000 && n < 4102444800000;
