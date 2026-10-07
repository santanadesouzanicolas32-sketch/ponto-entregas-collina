# Ponto de Entregas Collina

Dois arquivos prontos para o GitHub Pages, sem servidor:

| Página | Para quem | O que faz |
|---|---|---|
| `index.html` | Entregadores (Pedro, Bruno, João, Kauã, Nicolas) | Registra turno e entregas; no fim, envia o fechamento ao gerente |
| `gerente.html` | Gerente (celular ou computador) | Acompanha o desenvolvimento de cada entregador e consulta qualquer registro |

A página do gerente não tem link no aplicativo e pede aos buscadores que não a indexem.

## Como os dados chegam ao gerente

**Conexão automática (recomendada).** Os registros de cada entregador vão sozinhos para um repositório **privado** do GitHub (`ponto-dados`, um arquivo por entregador, cada envio é um commit) e o gerente os recebe na própria página, conferindo a cada minuto.

Configuração única, feita pelo gerente em `gerente.html` → **Dados → Conexão automática**:

1. Criar uma chave de acesso (fine-grained token) só para o repositório `ponto-dados`, com **Contents: Read and write**.
2. Colar a chave na página e tocar em **Conectar**.
3. Tocar em **Link para os entregadores** e mandar o link, no privado, a cada um. Ao abrir o link uma vez no celular, a conexão fica guardada e o endereço é limpo.

Depois disso o entregador não faz mais nada: cada alteração é enviada em poucos segundos (e quando a internet volta). O envio **soma** ao que já está na nuvem, então apagar os dados do aparelho não apaga o que o gerente já recebeu.

**Por arquivo (alternativa, sem configuração).** Entregador: **Ajustes → Enviar fechamento ao gerente** gera `entregas-<nome>-<data>.json` (compartilha pelo WhatsApp no celular). Gerente: **Dados → Importar**. Reimportar não duplica: vale o arquivo mais recente de cada turno.

Em qualquer caminho, cada arquivo leva um código de integridade (SHA-256); se o conteúdo for alterado, a importação recusa. Os dados do gerente ficam só no navegador dele.

## Entrega esquecida

No aplicativo, **+ Manual → Esqueci de registrar**: informa o horário em que a entrega foi feita (precisa estar dentro do turno e fora das pausas). Ela entra na ordem do horário, aparece com a marca **DEPOIS** e o painel do gerente mostra a hora em que foi realmente registrada. Depois de salva, o horário não muda.

## O que o gerente enxerga

- **Visão geral:** entregas, vendido, ticket médio e entregas por hora da equipe; ranking com índice ajustado e tendência; entregas por dia, evolução semanal, bloco, faixa de andar, mapa de calor.
- **Entregadores:** a mesma análise para um entregador, turno a turno (entrada, saída, pausas, horas líquidas, pontualidade), evolução semanal contra os demais, qualidade do registro.
- **Consultas:** todas as entregas com horário exato (hh:mm:ss), bloco, apartamento, valor, origem (foto/digitado) e situação (normal, corrigida, excluída, para conferir, lançada depois), com filtros e planilha CSV. Cada registro mostra o histórico: valor original, correção, exclusão, hora em que uma entrega esquecida foi registrada, turno e entregas vizinhas — para responder a qualquer questionamento.
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

Para trabalhar com os dados da conexão automática fora do navegador: `git clone` do repositório `ponto-dados` e aponte as ferramentas para a pasta `entregas/`. O consolidado gerado pode ser importado no `gerente.html` como qualquer outro arquivo. Dados de exemplo ficam marcados e o painel avisa; **Dados → Remover dados de exemplo** os apaga.

## Testes

- `index.html?selftest` — 68 autotestes do aplicativo (inclui entrega esquecida)
- `gerente.html?selftest` — 37 autotestes do painel (integridade, junção, justiça dos cálculos, conexão automática com GitHub simulado, telas)
- `pytest ferramentas/testes` — 43 testes, incluindo a conferência do código de integridade entre JavaScript e Python

## Atenção

Este repositório (o do site) é **público**: não coloque arquivos de entregas reais aqui. Os dados reais ficam no repositório **privado** `ponto-dados`. O link de conexão contém a chave de acesso desse repositório; quem a tiver consegue ler e escrever nele, então envie só aos entregadores. Se alguém sair da equipe ou o link vazar, apague a chave no GitHub e gere outra.

A leitura da comanda por foto (OCR) roda no aparelho e pode errar com foto ruim: por isso há conferência manual, e registros duvidosos ficam marcados.
