# Changelog — Semana, Squads e GDVs V2

**Data:** 2026-06-30  
**Tipo:** patch seguro de frontend  
**Escopo:** rotas paralelas V2, somente leitura

## Rotas adicionadas

- `/v2/preencher-semana`
- `/v2/squads`
- `/v2/gdvs`

## Garantias de segurança

- Nenhuma rota produtiva foi substituída.
- Nenhuma tela foi adicionada à sidebar.
- Nenhum endpoint foi criado.
- Nenhuma migration foi criada ou executada.
- Nenhum dado é salvo no banco.
- As novas telas usam apenas métodos GET já existentes.
- As rotas usam `React.lazy` para manter carregamento separado.

## Permissões

- `/v2/preencher-semana` → `metrics.view`
- `/v2/squads` → `squads.view`
- `/v2/gdvs` → `ranking.view`

## Endpoints consultados

- `GET /api/metrics/summary`
- `GET /api/metrics/campaigns`
- `GET /api/metrics/ranking`
- `GET /api/metrics/ranking/gdvs`

## Observação operacional

As telas V2 são ambientes de validação paralela. Elas servem para comparar leitura, estrutura visual e aderência de dados antes de qualquer troca nas rotas oficiais.
