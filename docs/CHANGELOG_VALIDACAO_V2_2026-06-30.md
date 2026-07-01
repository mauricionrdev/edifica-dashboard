# Changelog — Validação V2

Data: 2026-06-30

## Objetivo

Criar uma tela interna para acelerar a validação das rotas V2 sem promover nenhuma tela para produção e sem executar operações de escrita.

## Arquivos alterados

- `src/App.jsx`
- `src/utils/routeMeta.js`
- `src/pages/v2/V2OverviewPage.jsx`
- `src/pages/v2/ValidationV2Page.jsx`

## Nova rota

- `/v2/validacao`

## Segurança

- Rota paralela e oculta da sidebar.
- Protegida por `team.view`.
- Usa apenas chamadas GET.
- Não cria, edita ou remove registros.
- Não altera banco.
- Não cria migration.
- Não substitui rota oficial.

## Leituras verificadas

- `GET /api/metrics/summary`
- `GET /api/metrics/retention`
- `GET /api/metrics/ranking`
- `GET /api/metrics/ranking/gdvs`
- `GET /api/metrics/ranking/champions`
- `GET /api/metrics/traffic-management`
- `GET /api/metrics/dashboard/targets`
- `GET /api/template`

## Uso esperado

Antes de promover qualquer rota V2, abrir `/v2/validacao` e conferir:

1. endpoints críticos sem erro;
2. rota oficial e rota V2 lado a lado;
3. permissão esperada de cada tela;
4. critério manual de promoção;
5. ausência de impacto em banco.
