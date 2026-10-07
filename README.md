# Ponto de Entregas Collina

Sistema de ponto e vendas para entregadores do Empório Collina, em **um único arquivo** (`index.html`), pronto para o GitHub Pages.

- **Entregas com bloco, apartamento e valor (R$).** Tire a foto da comanda: o bloco, o apartamento e o **TOTAL** são lidos **no próprio aparelho** (a foto não é enviada nem guardada). Quando a leitura é segura, a entrega é registrada sozinha, com botão *Desfazer*.
- **Painel estilo Power BI:** entregas, vendido, ticket médio, vendido por hora, comparação com o período anterior, gráfico por dia, por bloco e por andar, mapa de calor (dia da semana × hora), insights automáticos e tabela detalhada. Os filtros se cruzam: toque em um dia, bloco, andar ou célula do mapa.
- Ponto: entrada (15h/16h), pausas e saída, atraso, hora extra, jornada incompleta, avisos proativos e previsão da meta. Ao fechar o turno, aparece o resumo com total de entregas e quanto foi vendido.
- Planilhas CSV (espelho de ponto e entregas filtradas).
- Os dados ficam **só no navegador** de quem usa (localStorage). Há backup e restauração em *Ajustes*.

Autotestes: abra `index.html?selftest`.
