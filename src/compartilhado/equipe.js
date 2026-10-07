/* Equipe, configuração e erro padrão do sistema. */
const TZ = 'America/Sao_Paulo';
const CFG = {
  blocks: ['A1', 'B1', 'C1', 'A2', 'B2', 'C2'],
  maxFloor: 28,
  presets: { 15: 500, 16: 520 },           // minutos previstos: 15h -> 23:20, 16h -> 00:40
  lateTol: 5 * 60e3, otTol: 10 * 60e3, early: 60 * 60e3, stale: 6 * 36e5, dupMs: 20e3, maxLate: 10,
  minRateSec: 180, minProjSec: 600,
  maxPhotoSide: 1800,
};
const FLOOR_BANDS = [['SS', 0, 0], ['1-7', 1, 7], ['8-14', 8, 14], ['15-21', 15, 21], ['22-28', 22, 28]];
// Equipe de entregadores. O gerente identifica cada pessoa por este id.
const ROSTER = [
  { id: 'pedro', nome: 'Pedro' }, { id: 'bruno', nome: 'Bruno' }, { id: 'joao', nome: 'João' },
  { id: 'kaua', nome: 'Kauã' }, { id: 'nicolas', nome: 'Nicolas' },
];
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const riderById = (id) => ROSTER.find((r) => r.id === id) || null;
const riderByName = (name) => riderById(plain(name).split(/\s+/)[0]);

class AppErr extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
