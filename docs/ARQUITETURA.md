# Arquitetura

Dois sites estáticos (sem servidor próprio), montados a partir de `src/`:

| Arquivo publicado | Para quem | Monta a partir de |
|---|---|---|
| `index.html` | Entregadores | `compartilhado/` + `entregador/` |
| `gerente.html` | Gerente | `compartilhado/` + `gerente/` |

`index.html` e `gerente.html` na raiz são **gerados**: nunca edite à mão. Edite `src/` e rode `python build.py`.

## Pastas

```
src/
  compartilhado/   usado pelas duas páginas (regras puras, nuvem, componentes de tela)
  entregador/      só o aplicativo do entregador  (banco, turno, entregas, envio, ui/)
  gerente/         só o painel do gerente         (dados/, nuvem, ui/)
  estilos/ assets/ paginas/   CSS, logo, HTML fixo de cada página
  testes/          testes que rodam dentro das páginas de teste (não são publicados)
tools/             conferências do build (lint, camadas, botões/ids, execução dos testes)
ferramentas/       utilitário Python opcional (Typer) + testes
docs/              este documento
build.py           confere, monta e testa tudo
```

## Camadas (e o que cada uma pode usar)

| Camada | Arquivos | Pode | Não pode |
|---|---|---|---|
| **Domínio** (regras puras) | `compartilhado/{equipe,tempo,formato,validacao,pedido,jornada,csv,integridade}.js`, `entregador/comanda.js` | cálculo, texto, datas | tela, `document`, `localStorage`, `fetch`, estado (`DB`, `ST`) |
| **Dados** (sem tela) | `compartilhado/nuvem.js`, `entregador/{banco,turno,entregas,visao,relatorios,fechamento,envio}.js`, `gerente/dados/*`, `gerente/nuvem.js` | armazenamento, rede, domínio | tela (`$`, `toast`, `sheet`, `actions`, `document`) |
| **Tela** | `*/ui/*`, `compartilhado/interface.js`, `dom.js` | tudo da tela, dados, domínio | falar direto com `localStorage`/`IndexedDB`/`fetch` |

Quando uma camada baixa precisa avisar a de cima (ex.: o banco gravou), ela expõe uma lista de ouvintes
(`SAVE_HOOKS`, `SAVE_ERROR_HOOKS`) e a camada de cima se registra. Nunca o contrário.

As duas páginas **não compartilham estado**: `DB` existe só no aplicativo; `ST` só no painel. Como cada página é montada
só com os seus arquivos, usar o estado errado vira "nome não definido" no lint, não um erro escondido em produção.

## O que o `python build.py` garante antes de trocar os arquivos publicados

1. **Lint** de cada página inteira: nomes que não existem, nomes declarados duas vezes (num único script, o segundo apaga o
   primeiro em silêncio), erros clássicos, código declarado e nunca usado.
2. **Camadas**: a tabela acima, por arquivo.
3. **Botões e ids**: todo `data-act="x"` tem uma ação registrada; nenhuma ação é registrada duas vezes; toda ação tem botão;
   todo `$('id')` aponta para um elemento que existe; sem `id` repetido no HTML fixo.
4. **Testes** das duas páginas (navegador simulado) e do Python. Se algo falhar, os arquivos publicados **não mudam**.

`python build.py --rapido` só monta (use para ver a página rápido; antes de publicar rode sem `--rapido`).

Primeira vez: `npm install` (instala eslint e jsdom) e `pip install -r ferramentas/requirements.txt`.

## Como mudar algo sem quebrar outra coisa

- Regra de negócio (horas, ritmo, índice, limites): arquivo do **domínio** ou de `gerente/dados/`; acompanhe de um teste em `src/testes/`.
- Texto ou botão: o arquivo `ui/` da aba correspondente. Botão novo = `data-act="x"` + `actions['x'] = ...` (o build avisa se faltar um dos dois).
- Campo novo no arquivo de fechamento: `entregador/fechamento.js` (gerar), `gerente/dados/importacao.js` (ler e limpar) e
  `ferramentas/consolidar.py` (`limpar_turnos`). O código de integridade é calculado sobre o JSON inteiro dos turnos, então o
  Python e o JavaScript precisam manter os mesmos campos; há um teste que confere isso com um arquivo gerado pelo navegador
  (`ferramentas/testes/fixtures/export_js.json`).
- Nome de função novo: o lint recusa se já existir outro com o mesmo nome em qualquer arquivo da mesma página.

## Compatibilidade e robustez

- O JavaScript é conferido como **ES2020** (sem `||=`/`??=`): celulares antigos de entregadores que não entendem sintaxe mais nova
  deixariam a página em branco. Para "criar se não existir" use `getOr` (`compartilhado/validacao.js`).
- Instantes lidos de fora (banco do aparelho, arquivos, Python) passam por `isTs`/`_ts` (anos 2000 a 2100); fora disso o registro é descartado.
- Há testes de robustez que embaralham campos de arquivos e bancos (300 casos cada) e exigem que nada quebre nem mostre `undefined`/`NaN`.

## Contratos

**Fechamento v2** (`ponto-collina/entregas`): `{formato, versao: 2, entregador: {id, nome}, exportadoEm, turnos[], integridade}`;
`integridade = "sha256:" + SHA256(JSON canônico de {entregador: id, turnos})` (chaves ordenadas, sem espaços, UTF-8).
Cada entrega: `id, t, bloco, apto, andar, valor, origem, conferir, original, editadaEm, excluida, excluidaEm, tardia, registradaEm`.

**Nuvem**: repositório privado `ponto-dados`, um arquivo por entregador em `entregas/<id>.json`. O envio **soma** ao que já
está lá (turnos que só existem na nuvem são mantidos). O painel só usa o ETag guardado de quem já tem dado na base.

## Regras de comparação (resumo; o painel tem a explicação completa)

- Horas líquidas = entrada → saída − pausas. Ritmo (entregas/h) só com 4 h ou mais no período.
- Índice = entregas feitas ÷ esperadas pelo ritmo **dos demais** (o próprio fica fora) no mesmo **dia da semana e hora**;
  casas com pouco dado são puxadas para o ritmo da hora (peso de 2 h). Mínimo de 5 entregas esperadas.
- Vendido e ticket são informação: não entram em destaque nem ranking.
- Entrega esquecida: máximo de 10 por turno; sempre marcada, com a hora em que foi realmente registrada.
- Turno errado: o gerente pode **ignorar** (não apaga; restaura em Dados).

## Limitações conhecidas

- A chave do link dá escrita em todos os arquivos do repositório de dados; o código de integridade detecta erro/corrupção,
  não fraude. Aceito por decisão do dono do sistema.
- Os horários vêm do relógio do aparelho (o painel avisa se um envio vem do futuro).
- A leitura da comanda por foto (OCR) roda no aparelho e ainda não foi calibrada com fotos reais.
