# Patch: tela de GDV (Central de Gestão Comercial)

Implementa a `/gdv` como interface operacional completa, seguindo o
padrão premium da dashboard (gradient border + backdrop-filter blur).

## Arquivos

```
src/App.jsx                         (EDITADO — 1 import + rota trocada)

src/api/metrics.js                  (NOVO — wrapper dos 3 endpoints de métricas)
src/utils/gdvMetrics.js             (NOVO — cálculos: calcWeek, aggregate, priority)

src/pages/GdvPage.jsx               (NOVO — 550 linhas)
src/pages/GdvPage.module.css        (NOVO — 700 linhas, padrão premium)
```

## Aplicar

```bash
unzip patch-gdv.zip
cp -r patch-gdv/src/* /caminho/do/projeto/src/
cd /caminho/do/projeto && npm run build
# subir dist/
```

Zero dependências novas. Reaproveita `ClientDetailDrawer` existente
para abrir detalhes de cliente ao clicar numa linha.

## O que está na tela

### Panel header
- Título: **Análises de GDV · {nome do GDV}**
- Navegador de mês (‹ Abril 2026 ›)
- Tabs de semana S1 · S2 · S3 · **S4** (ativa)
- Spinner discreto enquanto refetch está em voo

### Hero "Meta GDV"
Ocupa toda a largura, topo da tela. Mostra:
- Badge teal animado com nome do GDV
- Frase contextual (*"X/Y clientes devem bater meta em Abril · S2"*)
- Subtexto inteligente:
  - **Acima do target** → "Carteira está acima do target. Foque em…"
  - **Abaixo do target** → "Faltam N cliente(s) batendo meta para atingir 70%"
  - **Sem dados** → "Ainda não há clientes batendo meta…"
- **Dial circular SVG** à direita com % da carteira (verde/teal se ≥70%,
  vermelho se abaixo) — stroke-dashoffset animado 0.7s

### Grid 3×2 de métricas agregadas
1. **Contratos Fechados** — total da semana + "X/Y preencheram" (visibilidade do engajamento do time)
2. **Taxa de Conversão** — fechados/volume da carteira inteira
3. **Meta de Lucro** — colorida verde/vermelho com pill "✓ Vai bater" ou "✗ Em risco"
4. **Contratos Previstos** — pelo ritmo atual
5. **CPL Atual** — vs meta média da carteira, com pill ok/alto
6. **Leads Previstos** — vs meta de volume agregada

### Tabela "Clientes da carteira"
Ordenada por prioridade **descendente** (alta risco primeiro — é o que o
GDV precisa ver):
- Faixa lateral colorida indicando prioridade (vermelho/amarelo/verde/cinza)
- Nome + meta (squad + gestor)
- Badge de prioridade (Alta/Média/Baixa/Meta ok/Sem dados)
- Fechados / Previstos / Meta / Taxa
- Status pill (✓ Meta ok / ✗ Em risco / Sem dados)
- Hover destaca + click abre o drawer do cliente na aba GDV

### Estados
- **Carregando carteira**: spinner grande centralizado
- **Sem clientes com GDV**: card vazio explicando como incluir cliente na carteira
- **Loading métricas**: spinner na tabela + inline no header
- **Erro de rede**: mensagem no lugar da tabela

## Backend - endpoints usados

| Método | Rota                                   | Uso                          |
|-------:|----------------------------------------|------------------------------|
| GET    | `/metrics/:clientId/:periodKey`        | fetch paralelo por cliente   |
| (já usados) | `/clients`, `/clients/:id/*`, `/template` | do AppShell + Drawer     |

`periodKey = 'YYYY-MM-Sw'` (ex: `2026-04-S2`).

Quando um cliente não tem métricas preenchidas ainda, o backend
retorna um esqueleto `{ data: {}, computed }` — a tela marca esses
como "Sem dados" sem crashar.

## Cálculos (portados do frontend real)

`utils/gdvMetrics.js` exporta:

- **`calcWeek(metric)`** — replica `calcM` do legado. Retorna `{ inv,
  cpl, vol, fec, mLuc, mEmp, mVol, mCpl, lp, taxa, cp, isHit, cplOk,
  volOk, hasData }`. Fórmulas idênticas ao backend (`computeWeeklyMetrics`),
  desacoplado pra não depender do shape exato de `computed`.

- **`aggregateCarteira(rows)`** — equivalente a `buildAgg`. Soma totais
  e recalcula taxa/CPL agregados.

- **`getPriority(calc)`** — equivalente a `getPri`. Sem dados → pri-n
  (score 999 → vai pro topo pra atenção). Meta ok → pri-l. Acima de 50%
  da meta faltando → pri-h (alta). 15-50% → pri-m. Abaixo de 15% → pri-l.

- **`sortByPriority(rows)`** — ordena DESC por score (risco primeiro).

- **`hitRate(rows)`** — `{ h, t, pct }` de clientes batendo meta.

- **`GDV_TARGET = 70`** — meta mínima da carteira (% de clientes batendo meta).

## Performance

- Fetch paralelo via `Promise.all` de todas as métricas da semana.
- **Cache por periodKey** em estado local: trocar S2→S3→S2 não refaz
  fetch de S2. O cache invalida se o conjunto de clientes do GDV muda.
- `useMemo` em todos os derivados (agg, rows, sortedRows, hit) para não
  recalcular em cada render.
- Fetch cancelável via `fetchGenRef` (gen counter) — fetchs antigos
  são descartados silenciosamente.

## Design premium

Mesmo DNA da CentralPage:
- **Gradient border** via `padding-box` + `border-box` dupla camada
- **Backdrop-filter blur(12px)**
- Fundo 145deg dark gradient
- Acento teal (`#2dd4bf`) para elementos exclusivos do GDV,
  amarelo (`#f5c300`) para genéricos
- Cards variantes: `cardTeal` (hero acima do target),
  `cardRed` (hero abaixo do target)
- Animações: dial circular, gauge bar, fade-in suave

## Validação estática antes de entregar

- **114/114 imports** relativos resolvem
- **Todas as classes CSS** usadas no JSX existem (globais + módulos)
- **Balanceamento de brackets** OK em `GdvPage.jsx`, `gdvMetrics.js`,
  `metrics.js`

## Fora desta rodada

- Preenchimento de métricas (POST/PUT em `/metrics`) fica pra tela
  `/preencher-semana` — próxima rodada.
- Gráfico de evolução temporal (contratos fechados mês a mês) —
  ficaria bonito como 7º card, mas requer múltiplos fetchs históricos
  e pode ir numa evolução da GdvPage.
