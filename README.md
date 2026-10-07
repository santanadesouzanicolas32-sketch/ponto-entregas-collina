# Ponto de Entregas Collina

Dois sites prontos para o GitHub Pages, sem servidor:

| Página | Para quem | O que faz |
|---|---|---|
| `index.html` | Entregadores (Pedro, Bruno, João, Kauã, Nicolas) | Registra turno e entregas; os registros vão sozinhos ao gerente |
| `gerente.html` | Gerente (celular ou computador) | Acompanha o desenvolvimento de cada entregador e consulta qualquer registro |

A página do gerente não tem link no aplicativo e pede aos buscadores que não a indexem.

## Como os dados chegam ao gerente

**Conexão automática (recomendada).** Os registros de cada entregador vão sozinhos para um repositório **privado** do GitHub
(`ponto-dados`, um arquivo por entregador, cada envio é um commit) e o gerente os recebe na própria página, conferindo a cada minuto.

Configuração única, feita pelo gerente em `gerente.html` → **Dados → Conexão automática**:

1. Criar uma chave de acesso (fine-grained token) só para o repositório `ponto-dados`, com **Contents: Read and write**.
2. Colar a chave na página e tocar em **Conectar**.
3. Tocar em **Link para os entregadores** e mandar o link, no privado, a cada um. Ao abrir o link uma vez no celular, a conexão fica guardada.

Depois disso cada alteração é enviada em poucos segundos (e quando a internet volta). O envio **soma** ao que já está na nuvem:
apagar os dados do aparelho não apaga o que o gerente já recebeu.

**Por arquivo (alternativa).** Entregador: **Ajustes → Enviar por arquivo**. Gerente: **Dados → Importar**. Reimportar não duplica: vale o arquivo mais recente de cada turno.

Em qualquer caminho, cada arquivo leva um código de integridade (SHA-256): se o conteúdo for alterado, a importação recusa.

## No aplicativo do entregador

- **Foto da comanda** lê bloco, apartamento e valor no próprio aparelho; **+ Manual** registra sem foto.
- **Entrega esquecida:** em **+ Manual → Esqueci de registrar**, informe o horário em que entregou. Ela volta para a ordem do horário,
  fica marcada com **DEPOIS** e o gerente vê a hora em que foi realmente registrada. Máximo de 10 por turno.
  Pode ser até antes da entrada batida (a partir de 1 h antes do início previsto): a entrada do turno recua para esse horário e o
  gerente vê, na ficha do turno, a entrada que foi realmente batida.
- **Nome:** escolhido na primeira vez; depois de registrar turnos ele não pode ser trocado (evita misturar dados de duas pessoas).

## O que o gerente enxerga

- **Visão geral:** ritmo, índice e tendência por entregador; entregas por dia e por semana; bloco, andar, mapa de calor.
- **Entregadores:** a mesma análise por pessoa, turno a turno, com qualidade do registro.
- **Consultas:** qualquer entrega com horário exato (hh:mm:ss), valor, origem e situação (normal, corrigida, excluída, para conferir,
  lançada depois), com filtros e planilha CSV. Cada registro mostra o histórico completo para responder a qualquer questionamento.
- **Dados:** conexão, situação dos envios, pontos de atenção (relógio adiantado, muitas entregas lançadas depois, dia repetido…),
  turnos ignorados.
- **Ignorar turno:** na ficha de um turno, "Ignorar nas análises" (nome errado, teste, duplicado). Não apaga; restaura em Dados.

## Como a comparação é justa

- **Horas líquidas:** entrada → saída menos as pausas. Turno aberto conta até a hora do envio.
- **Entregas por hora** só aparecem com 4 h ou mais no período; antes disso, "poucos dados".
- **Índice:** entregas feitas ÷ esperadas pelo ritmo **dos demais entregadores** (o próprio fica fora da conta) no **mesmo dia da semana e hora**;
  quando um dia tem pouco dado, o ritmo é puxado para o da hora. 100 = igual aos demais.
- **Vendido e ticket são informação**, não nota: dependem da comanda, por isso não têm destaque nem ranking.
- **Tendência:** últimos turnos contra os anteriores, só com 6 ou mais turnos fechados e variação acima de 8%.

## Desenvolvimento

O código fica em `src/`, organizado em camadas (veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md)). `index.html` e `gerente.html` são **gerados**.

```bash
npm install                                   # uma vez (eslint e jsdom)
pip install -r ferramentas/requirements.txt   # uma vez (typer e pytest)
python build.py                               # confere, monta e testa tudo
```

`python build.py` roda, nesta ordem: lint e regras de camadas, consistência de botões e ids, os testes das duas páginas e os testes
Python; **só se tudo passar** ele troca `index.html` e `gerente.html`. (`--rapido` só monta.)

## Ferramentas em Python (opcional)

Pasta `ferramentas/` (Typer): validar, juntar e resumir arquivos fora do navegador.

```bash
python ferramentas/consolidar.py validar  pasta_dos_arquivos
python ferramentas/consolidar.py consolidar pasta_dos_arquivos -o consolidado.json
python ferramentas/consolidar.py resumo consolidado.json
python ferramentas/consolidar.py exemplo pasta_de_teste      # arquivos de EXEMPLO para ver o painel
```

Para a conexão automática: `git clone` do repositório `ponto-dados` e aponte as ferramentas para a pasta `entregas/`.

## Atenção

Este repositório (o do site) é **público**: não coloque arquivos de entregas reais aqui. Os dados reais ficam no repositório **privado** `ponto-dados`.
O link de conexão contém a chave de acesso desse repositório; quem a tiver consegue ler e escrever nele, então envie só aos entregadores.
Se alguém sair da equipe ou o link vazar, apague a chave no GitHub e gere outra.

A leitura da comanda por foto (OCR) roda no aparelho e pode errar com foto ruim: por isso há conferência manual, e registros duvidosos ficam marcados.
