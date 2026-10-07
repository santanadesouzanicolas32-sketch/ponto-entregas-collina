// Roda os testes das páginas (.teste/*.teste.html) dentro de um navegador simulado (jsdom).
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';

const raiz = path.resolve(import.meta.dirname, '..');
const pasta = path.join(raiz, '.teste');
const paginas = fs.readdirSync(pasta).filter((f) => f.endsWith('.teste.html')).sort();
let falhas = 0;

for (const nome of paginas) {
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => erros.push(String(e.message || e).split('\n')[0]));
  vc.on('error', (...a) => erros.push(a.join(' ').slice(0, 200)));
  const dom = new JSDOM(fs.readFileSync(path.join(pasta, nome), 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: `http://localhost/${nome}`, virtualConsole: vc,
    beforeParse(w) {
      Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    },
  });
  const w = dom.window;
  const limite = Date.now() + 120000;
  while (!w.__selftest && Date.now() < limite && !erros.length) await new Promise((r) => setTimeout(r, 100));
  const r = w.__selftest;
  if (!r) { falhas++; console.log(`${nome}: não terminou. ${erros.join(' | ')}`); w.close(); continue; }
  const resumo = `${nome.replace('.teste.html', '')}: ${r.passed}/${r.total} testes`;
  if (r.failed.length || erros.length) {
    falhas++;
    console.log(`${resumo}  <-- FALHOU`);
    for (const f of r.failed) console.log(`   ✘ ${f.name}\n       ${f.err}`);
    for (const e of erros) console.log(`   erro na página: ${e}`);
  } else console.log(resumo);
  w.close();
}
if (falhas) process.exit(1);
