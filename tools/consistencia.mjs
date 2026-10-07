// Confere as ligações que o JavaScript não confere sozinho: botões (data-act) e ids de elementos.
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, '.teste', 'manifesto.json'), 'utf8'));
const ler = (f) => fs.readFileSync(path.join(raiz, 'src', f), 'utf8');
let problemas = 0;
const erro = (m) => { problemas++; console.log('  ' + m); };

const paginas = { 'index.html': 'paginas/entregador.html', 'gerente.html': 'paginas/gerente.html' };
for (const [nome, p] of Object.entries(manifesto.paginas)) {
  const arquivos = p.arquivos.map((f) => [f, ler(f)]).concat([[paginas[nome], ler(paginas[nome])]]);
  const tudo = arquivos.map(([, t]) => t).join('\n');

  // --- ações: cada botão (data-act) tem uma ação registrada, sem repetição, e cada ação tem botão
  const registradas = new Map();
  for (const [f, t] of arquivos) {
    for (const m of t.matchAll(/\bactions\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) (registradas.get(m[1]) ?? registradas.set(m[1], []).get(m[1])).push(f);
    for (const m of t.matchAll(/\bactions\[\s*['"]([^'"]+)['"]\s*\]\s*=(?!=)/g)) (registradas.get(m[1]) ?? registradas.set(m[1], []).get(m[1])).push(f);
  }
  for (const [k, fs_] of registradas) if (fs_.length > 1) erro(`${nome}: a ação "${k}" é registrada ${fs_.length} vezes (${fs_.join(', ')}); a última apaga as outras`);
  const usadas = new Set();
  let dinamicas = 0;
  for (const m of tudo.matchAll(/data-act="([^"]*)"/g)) { if (m[1].includes('${')) dinamicas++; else usadas.add(m[1]); }
  for (const m of tudo.matchAll(/data-act=\\?"([^"\\]+)\\?"/g)) if (!m[1].includes('${')) usadas.add(m[1]);
  for (const k of usadas) if (!registradas.has(k)) erro(`${nome}: há botão data-act="${k}" mas nenhuma ação com esse nome`);
  if (!dinamicas) for (const k of registradas.keys()) if (!usadas.has(k) && !tudo.includes(`'${k}'`) && !tudo.includes(`"${k}"`)) erro(`${nome}: a ação "${k}" não tem nenhum botão`);

  // --- ids: todo $('id') aponta para um elemento que existe (no HTML ou em algum trecho de tela)
  const ids = new Set();
  const modelo = fs.readFileSync(path.join(raiz, 'build.py'), 'utf8');      // ids do cabeçalho (ícones) vêm do montador
  for (const m of modelo.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]);
  for (const m of tudo.matchAll(/\bid=\\?"([^"\\$]+)\\?"/g)) ids.add(m[1]);
  for (const m of tudo.matchAll(/\.id\s*=\s*'([^']+)'/g)) ids.add(m[1]);
  for (const [f, t] of arquivos) {
    for (const m of t.matchAll(/(?:\$|getElementById)\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!ids.has(m[1])) erro(`${nome}: ${f} procura o elemento #${m[1]}, que não existe`);
  }
  // --- ids repetidos dentro do HTML fixo
  const fixo = ler(paginas[nome]), vistos = new Map();
  for (const m of fixo.matchAll(/\bid="([^"]+)"/g)) vistos.set(m[1], (vistos.get(m[1]) || 0) + 1);
  for (const [k, n] of vistos) if (n > 1) erro(`${nome}: id "${k}" repetido no HTML (${n}x)`);
}
if (problemas) { console.log(`\n${problemas} problema(s).`); process.exit(1); }
console.log('Botões e ids: sem problemas.');
