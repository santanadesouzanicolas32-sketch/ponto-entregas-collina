// Confere o código antes de montar: erros de digitação, nomes que não existem, nomes repetidos
// e as regras de camadas (ver docs/ARQUITETURA.md). Qualquer problema para o build.
import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import globals from 'globals';

const raiz = path.resolve(import.meta.dirname, '..');
const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, '.teste', 'manifesto.json'), 'utf8'));
const ler = (f) => fs.readFileSync(path.join(raiz, 'src', f), 'utf8');

const comuns = { ecmaVersion: 2022, sourceType: 'script' };
let problemas = 0;
const aviso = (arquivo, linha, regra, msg) => { problemas++; console.log(`  ${arquivo}:${linha}  ${msg}  [${regra}]`); };

/* ---------- 1) cada página inteira: nomes inexistentes, repetidos e erros clássicos ---------- */
const nomesNaPagina = { LOGO: 'readonly', Tesseract: 'readonly' };      // LOGO vem do montador; Tesseract vem do CDN
const regrasPagina = {
  'no-undef': 'error', 'no-redeclare': ['error', { builtinGlobals: false }], 'no-dupe-keys': 'error', 'no-dupe-args': 'error',
  'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error', 'no-const-assign': 'error', 'no-func-assign': 'error',
  'no-self-assign': 'error', 'no-unsafe-negation': 'error', 'valid-typeof': 'error', 'use-isnan': 'error', 'no-fallthrough': 'error',
  'no-sparse-arrays': 'error', 'no-unsafe-finally': 'error', 'no-loss-of-precision': 'error', 'getter-return': 'error', 'no-class-assign': 'error',
  'no-compare-neg-zero': 'error', 'no-empty-pattern': 'error', 'no-ex-assign': 'error', 'no-global-assign': 'error', 'no-obj-calls': 'error',
  'no-unused-labels': 'error', 'no-useless-catch': 'error', 'require-yield': 'error', 'no-this-before-super': 'error', 'constructor-super': 'error',
};
async function lintPagina(titulo, arquivos) {
  let texto = '', linha = 1;
  const faixas = [];
  for (const f of arquivos) {
    const t = ler(f).replace(/\n$/, '');
    const n = t.split('\n').length;
    faixas.push({ f, de: linha, ate: linha + n - 1 });
    texto += t + '\n'; linha += n;
  }
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [{ files: ['**/*.js'], languageOptions: { ...comuns, globals: { ...globals.browser, ...nomesNaPagina } }, rules: regrasPagina }] });
  const [r] = await eslint.lintText(texto, { filePath: path.join(raiz, 'pagina.js') });
  for (const m of r.messages) {
    const fx = faixas.find((x) => m.line >= x.de && m.line <= x.ate);
    aviso(fx ? fx.f : titulo, fx ? m.line - fx.de + 1 : m.line, m.ruleId || 'erro', m.message);
  }
}
for (const [nome, p] of Object.entries(manifesto.paginas)) {
  await lintPagina(`${nome}`, p.arquivos);
  await lintPagina(`${nome} (com testes)`, [...p.arquivos, ...p.testes.filter((f) => !p.arquivos.includes(f))]);
}

/* ---------- 2) camadas: cada arquivo só pode usar o que a sua camada permite ---------- */
const DOM = ['document', 'window', 'location', 'history', 'alert', 'confirm', 'prompt'];
const TELA = ['$', 'esc', 'toast', 'toastAction', 'sheet', 'closeSheet', 'sheetOpen', 'confirmSheet', 'busy', 'download', 'skeleton', 'actions', 'attempt', 'render', 'mRender'];
const ARMAZENAMENTO = ['localStorage', 'sessionStorage', 'indexedDB', 'fetch'];
const ESTADO = ['DB', 'ST', 'SYNC', 'PULL'];
const camadas = [
  { nome: 'domínio (regras puras)', arquivos: ['compartilhado/equipe.js', 'compartilhado/tempo.js', 'compartilhado/formato.js', 'compartilhado/pedido.js', 'compartilhado/jornada.js', 'compartilhado/csv.js', 'compartilhado/integridade.js', 'entregador/comanda.js'],
    proibidos: [...DOM, ...TELA, ...ARMAZENAMENTO, ...ESTADO, 'navigator'] },
  { nome: 'dados (sem tela)', arquivos: ['compartilhado/nuvem.js', 'entregador/banco.js', 'entregador/turno.js', 'entregador/entregas.js', 'entregador/lancamentos.js', 'entregador/visao.js', 'entregador/relatorios.js', 'entregador/fechamento.js', 'entregador/envio.js', 'gerente/dados/armazenamento.js', 'gerente/dados/importacao.js', 'gerente/dados/calculo.js', 'gerente/dados/metricas.js', 'gerente/dados/consulta.js', 'gerente/nuvem.js'],
    proibidos: [...DOM.filter((x) => x !== 'location'), ...TELA] },
  { nome: 'tela (sem acesso direto a armazenamento)', arquivos: [...new Set(Object.values(manifesto.paginas).flatMap((p) => p.arquivos))].filter((f) => /\/ui\/|interface\.js|dom\.js/.test(f)),
    proibidos: [...ARMAZENAMENTO] },
];
// exceções conscientes e pequenas, com o motivo
const excecoes = {
  'compartilhado/nuvem.js': { permitido: ['location'], motivo: 'lê o #sync= do endereço' },
  'compartilhado/dom.js': { permitido: [], motivo: '' },
};
for (const c of camadas) {
  const eslint = new ESLint({ overrideConfigFile: true });
  for (const f of c.arquivos) {
    const livres = excecoes[f]?.permitido || [];
    const lista = c.proibidos.filter((n) => !livres.includes(n));
    const cfg = [{ files: ['**/*.js'], languageOptions: { ...comuns }, rules: { 'no-restricted-globals': ['error', ...lista.map((name) => ({ name, message: `a camada "${c.nome}" não pode usar isto` }))] } }];
    const e2 = new ESLint({ overrideConfigFile: true, overrideConfig: cfg });
    const [r] = await e2.lintText(ler(f), { filePath: path.join(raiz, f.replace(/\//g, '_')) });
    for (const m of r.messages) aviso(f, m.line, 'camada', `${m.message} (${m.message.match(/'([^']+)'/)?.[1] ?? ''})`);
  }
  void eslint;
}

/* ---------- 3) código morto: função ou constante de topo que ninguém usa ---------- */
{
  const todos = [...new Set(Object.values(manifesto.paginas).flatMap((p) => p.arquivos))];
  const textos = Object.fromEntries(todos.map((f) => [f, ler(f)]));
  const tudo = Object.values(textos).join('\n');
  const testes = ler('testes/entregador.js') + ler('testes/gerente.js');
  const entradas = new Set(['boot', 'mgrBoot']);
  for (const f of todos) {
    for (const m of textos[f].matchAll(/^(?:async\s+)?function\s+(\w+)|^(?:const|let|class)\s+(\w+)/gm)) {
      const n = m[1] || m[2];
      if (entradas.has(n)) continue;
      const usos = (tudo.match(new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) || []).length;
      if (usos <= 1) aviso(f, 0, 'morto', `"${n}" é declarado e nunca usado${new RegExp(`\\b${n}\\b`).test(testes) ? ' (só os testes usam)' : ''}`);
    }
  }
}

if (problemas) { console.log(`\n${problemas} problema(s).`); process.exit(1); }
console.log('Lint e camadas: sem problemas.');
