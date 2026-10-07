# Ponto de Entregas Collina

Controle pessoal de entregas do Empório Collina, em **um único arquivo** (`index.html`), pronto para o GitHub Pages.

- **Cada entrega:** bloco, apartamento, valor (R$) e o **horário em que foi registrada** (não pode ser alterado). Tire a foto da comanda: o bloco, o apartamento e o TOTAL são lidos **no próprio aparelho** (a foto não é enviada nem guardada). Quando a leitura é segura, registra sozinho, com botão *Desfazer*.
- **Turno:** entrada (15h/16h), pausa e saída. Mostra entregas, meta, previsão, entregas por hora, vendido e ticket médio. Ao sair, o resumo com o total de entregas e quanto foi vendido.
- **Painel (estilo Power BI):** entregas, vendido, ticket médio e vendido por hora, com comparação com o período anterior; gráfico por dia, por bloco e por andar; mapa de calor (dia da semana × hora); tabela detalhada. Os filtros se cruzam.
- **Histórico:** todas as entregas (busca por apartamento, bloco e data) e o espelho de ponto. Planilhas CSV.
- Os dados ficam **só no navegador** (localStorage). Backup e restauração em *Ajustes*.

Autotestes: abra `index.html?selftest`.
