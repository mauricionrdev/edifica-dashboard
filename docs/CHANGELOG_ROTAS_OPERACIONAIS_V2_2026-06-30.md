# Changelog — Rotas Operacionais V2 em paralelo

Data: 2026-06-30
Base: `edi-central(44).zip`

## Objetivo

Acelerar a migração segura da Edifica Central com um patch maior, mantendo a produção intacta.

## Rotas adicionadas

- `/v2/dashboard`
- `/v2/retencao`
- `/v2/rankings`

## Segurança operacional

As três rotas são internas, ocultas da sidebar e carregadas via `React.lazy`.

Nenhuma rota produtiva foi substituída:

- `/` continua usando o Dashboard atual.
- `/dashboard/indicadores-por-squad` continua usando a Retenção atual.
- `/ranking-squads` e `/ranking-gdvs` continuam usando os rankings atuais.

## Permissões

- `/v2/dashboard`: `central.view`
- `/v2/retencao`: `central.view`
- `/v2/rankings`: `ranking.view`

## Escopo técnico

- Somente leitura.
- Sem criação de endpoint.
- Sem alteração de banco.
- Sem alteração de migrations.
- Sem alteração de regras de ranking, churn, squad, preencher semana ou dashboard atual.

## Endpoints consumidos

- `GET /api/metrics/summary`
- `GET /api/metrics/dashboard/targets`
- `GET /api/metrics/retention`
- `GET /api/metrics/ranking`
- `GET /api/metrics/ranking/gdvs`
- `GET /api/metrics/ranking/champions`

## Observação sobre campeão mensal

A rota `/v2/rankings` separa visualmente:

- ranking ao vivo do mês corrente;
- histórico oficial de campeões gravados no banco.

A lista de campeões deve continuar vindo somente do endpoint de snapshots fechados. O mês atual não deve aparecer ali antes de 00:00 em `America/Sao_Paulo` no primeiro dia do mês seguinte.

## Próxima etapa recomendada

Validar visualmente as três rotas internas com dados reais e comparar os principais números contra as rotas oficiais antes de qualquer troca produtiva.
