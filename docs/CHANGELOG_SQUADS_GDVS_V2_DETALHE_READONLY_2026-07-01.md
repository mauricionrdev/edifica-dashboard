# Changelog — Squads/GDVs V2 com detalhe readonly

Data: 2026-07-01

## Objetivo

Evoluir as rotas paralelas `/v2/squads` e `/v2/gdvs` com uma prévia operacional mais útil, sem substituir as telas oficiais e sem tocar em backend, banco ou endpoints.

## Arquivos alterados

- `src/pages/v2/SquadsV2Page.jsx`
- `src/pages/v2/GdvsV2Page.jsx`
- `src/pages/v2/V2Operations.module.css`

## O que mudou

- A tabela de Squads V2 agora permite selecionar uma linha.
- A tabela de GDVs V2 agora permite selecionar uma linha.
- Foi adicionado painel lateral/operacional somente leitura para o item selecionado.
- O painel compara dados do ranking com a carteira carregada pelo shell atual.
- A prévia lista até 8 clientes vinculados ao squad/GDV selecionado.
- A tela deixa explícito que não executa `POST`, `PUT`, `PATCH` ou `DELETE`.

## Segurança

- Sem alteração de rota produtiva.
- Sem alteração em `/squads/:squadId`.
- Sem alteração em `/ranking-gdvs`.
- Sem alteração em `/ranking-squads`.
- Sem endpoint novo.
- Sem migration.
- Sem escrita em banco.
- Sem variável de ambiente nova.
- Compatível com frontend/backend separados.

## Validação esperada

- Abrir `/v2/squads`.
- Clicar em um squad da tabela.
- Confirmar que o painel mostra métricas do ranking e prévia da carteira do shell.
- Abrir `/v2/gdvs`.
- Clicar em um GDV da tabela.
- Confirmar que o painel mostra métricas do ranking e clientes vinculados.
- Confirmar que nenhuma tela oficial foi substituída.
