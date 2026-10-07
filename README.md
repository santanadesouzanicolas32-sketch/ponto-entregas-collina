# Ponto de Entregas Collina

Dois arquivos prontos para o GitHub Pages, sem servidor:

| Página | Para quem | O que faz |
|---|---|---|
| `index.html` | Entregadores (Pedro, Bruno, João, Kauã, Nicolas) | Registra turno e entregas; no fim, envia o fechamento ao gerente |
| `gerente.html` | Gerente (celular ou computador) | Acompanha o desenvolvimento de cada entregador e consulta qualquer registro |

A página do gerente não tem link no aplicativo e pede aos buscadores que não a indexem.

## Como os dados chegam ao gerente

Não há servidor: cada entregador guarda os próprios registros no aparelho. Para o gerente ver:

1. O entregador abre o aplicativo → **Ajustes → Enviar fechamento ao gerente** (ou o mesmo botão no resumo do turno).
2. O celular abre o compartilhamento (WhatsApp etc.); no computador, baixa o arquivo `entregas-<nome>-<data>.json`.
3. O gerente abre `gerente.html` → **Dados → Importar** e escolhe os arquivos (vários de uma vez).

Reimportar não duplica: para cada turno vale o arquivo mais recente. Cada arquivo leva um código de integridade (SHA-256); se alguém editar o conteúdo, a importação recusa. Os dados do gerente ficam só no navegador dele.

## O que o gerente enxerga

- **Visão geral:** entregas, vendido, ticket médio e entregas por hora da equipe; ranking com índice ajustado e tendência; entregas por dia, evolução semanal, bloco, faixa de andar, mapa de calor.
- **Entregadores:** a mesma análise para um entregador, turno a turno (entrada, saída, pausas, horas líquidas, pontualidade), evolução semanal contra os demais, qualidade do registro.
- **Consultas:** todas as entregas com horário exato (hh:mm:ss), bloco, apartamento, valor, origem (foto/digitado) e situação, com filtros e planilha CSV. Cada registro mostra o histórico: valor original, correção, exclusão, turno e entregas vizinhas — para responder a qualquer questionamento.
- **Dados:** situação de cada envio, pontos de atenção (envio antigo, turno aberto, dia repetido), exportação consolidada.

## Como a comparação é justa

- **Horas líquidas:** da entrada à saída menos as pausas (sobreposições contadas uma vez). Turno aberto conta até a hora do envio.
- **Entregas por hora** só aparecem com pelo menos 4 h líquidas no período; antes disso, “poucos dados”.
- **Índice ajustado:** compara as entregas feitas com o esperado pelo ritmo da equipe **nas mesmas horas do dia** (20h rende mais que 15h). 100 = igual à equipe.
- **Tendência:** média dos últimos turnos contra a dos anteriores, só com 6 ou mais turnos fechados e variação acima de 8%.
- Entregas excluídas não contam; valores ausentes não entram no ticket médio (mostra-se o % com valor).

## Ferramentas em Python (opcional)

Pasta `ferramentas/` (Typer). Útil para guardar arquivos, juntar tudo e conferir números fora do navegador.

```bash
pip install -r ferramentas/requirements.txt
python ferramentas/consolidar.py validar  pasta_dos_arquivos
python ferramentas/consolidar.py consolidar pasta_dos_arquivos -o consolidado.json
python ferramentas/consolidar.py resumo consolidado.json
python ferramentas/consolidar.py exemplo pasta_de_teste      # arquivos de EXEMPLO para testar o painel
pytest ferramentas/testes
```

O consolidado gerado pode ser importado no `gerente.html` como qualquer outro arquivo. Dados de exemplo ficam marcados e o painel avisa; **Dados → Remover dados de exemplo** os apaga.

## Testes

- `index.html?selftest` — 61 autotestes do aplicativo
- `gerente.html?selftest` — 27 autotestes do painel (integridade, junção, justiça dos cálculos, telas)
- `pytest ferramentas/testes` — 41 testes, incluindo a conferência do código de integridade entre JavaScript e Python

## Atenção

Este repositório é **público**. Não coloque arquivos de entregas reais aqui (têm apartamentos, valores e horários). O fluxo acima mantém tudo fora do repositório.

A leitura da comanda por foto (OCR) roda no aparelho e pode errar com foto ruim: por isso há conferência manual, e registros duvidosos ficam marcados.
