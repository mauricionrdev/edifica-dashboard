# Edifica Dash — Changelog dos patches aplicados

Este projeto já contém os patches Fase 1, 2 e 3 aplicados.

## Fase 1 — Filtros e comparativo com período anterior

**Backend** (`edifica-api/src/utils/domain.js`, `edifica-api/src/routes/metrics.js`):
- `GET /api/metrics/summary` aceita `?squadId=` e `?clientId=`
- Resposta inclui `weekClosedPrev`, `weekDelta`, `weekDeltaPct`,
  `monthClosedPrev`, `monthDelta`, `monthDeltaPct`
- Novas funções: `previousPeriodKey`, `previousMonthPrefix`

**Frontend** (`src/pages/CentralPage.jsx`, `src/api/metrics.js`,
`src/pages/CentralPage.module.css`):
- Dropdowns de squad e cliente no topo da Central
- Chip `▲ +3 (+40%) vs sem. anterior` nos cards de Fechados
- Ocultação de seções Ranking/Meta-vs-Realizado quando filtra 1 cliente

## Fase 2 — Tela Preencher Semana + meta semanal editável

**Backend** (`edifica-api/src/utils/domain.js`,
`edifica-api/src/routes/metrics.js`,
`edifica-api/scripts/migrate-metaLucro-to-metaSemanal.js`):
- Novo campo `metaSemanal` no JSON de `weekly_metrics.data`
- `resolveWeekGoal(data, clientMetaLucro)` — fallback: metaSemanal →
  metaLucro → ceil(clientMetaLucro / 4)
- `aggregateClientSummary` com soma mensal das metas semanais + floor
  em `clients.meta_lucro`
- `deriveWeekStatus` compara fechados REAIS vs meta (não mais
  projeção)
- PUT sanitiza payload, só aceita campos conhecidos
- Script opcional de migração de dados legados (idempotente)

**Frontend** (`src/App.jsx`, `src/pages/PreencherSemanaPage.jsx`,
`src/pages/PreencherSemanaPage.module.css`):
- Rota `/preencher-semana` agora aponta para tela real (antes era
  placeholder)
- Auto-save com debounce 600ms
- Filtros squad/cliente, navegação S1..S4, seletor de mês
- Atalho "Copiar semana anterior" (exceto contratos fechados)
- Resumo ao vivo: Meta / Fechados / Progresso / Previstos / Taxa conv.

## Fase 3 — Modal centralizado (antes: drawer lateral)

**Frontend** (`src/components/clients/ClientDetailDrawer.jsx`,
`src/components/clients/ClientDetailDrawer.module.css`):
- Detalhes do cliente abrem agora como modal centralizado de até
  1080px de largura, fundo escurecido
- Grid dos campos vira 3 colunas em viewports ≥ 900px (antes 2)
- Responsivo: bottom sheet em telas ≤ 640px
- Body scroll lock enquanto modal aberto
- Click fora fecha, ESC fecha, click dentro não fecha

**Nenhuma classe CSS compartilhada foi removida.** ContractTab,
OverviewTab, OnboardingTab, AnalysisTab funcionam sem alteração.

## Mudanças de comportamento importantes

1. **isHit agora usa fechados reais** (não `contratosPrevistos`).
   Alguns clientes que apareciam "no prazo" pela projeção podem
   passar a aparecer "abaixo da meta".

2. **Meta mensal agora soma semanas** (antes era `max`). Em clientes
   com 4 semanas preenchidas, o número vai aumentar.

3. **A rota `/preencher-semana` agora funciona.** Antes era
   placeholder. Comunicar o time que já dá para preencher pela UI.

## Como buildar e deployar

```bash
# Backend
cd edifica-api
npm install
npm run migrate         # só na primeira vez
npm run seed            # só na primeira vez
npm start               # ou pm2 start server.js

# (Opcional) diagnóstico do banco
node diagnose.js

# Frontend
cd ..
npm install
npm run build
# Sobe dist/ no Hostinger Business via SFTP
```

## Testes validados

- 17/17 testes funcionais do `domain.js` passando
- Sintaxe Node OK em todos os arquivos backend
- Imports relativos resolvem em todos os arquivos tocados
- 106 classes CSS usadas no frontend (59 Central + 36 Preencher + 11
  Drawer) todas definidas
- Diff estrito CSS antigo vs novo no `ClientDetailDrawer`: nenhuma
  classe removida

## Consolidação posterior — fases 4 a 15

Depois dos patches iniciais, a plataforma evoluiu com as seguintes frentes:

- padronização visual premium/dark mode em dashboard, clientes, GDV, preencher semana, login e shell global;
- CRUD de squads no frontend;
- dashboard de squad;
- gestão de usuários e acessos no frontend integrada ao backend;
- solicitações de convite/redefinição de senha persistidas no backend;
- aprovação administrativa dessas solicitações com geração de senha temporária;
- hardening de segurança administrativa (auto desativação, último admin, admin master);
- audit logs com trilha de ações críticas;
- hardening de permissões no frontend.

Ver também: `docs/HANDOFF_FINAL_ESTADO_ATUAL.md`.
