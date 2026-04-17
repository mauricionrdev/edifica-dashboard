# Edifica Dashboard

Frontend da plataforma Edifica. React 18 + Vite, consumindo a `edifica-api`.

Visual portado do frontend real (`FRONTEND.zip`): todo o CSS (tokens,
sidebar, topbar, cards, login, refinamentos Stage 12/17/18/20) e a
biblioteca de ícones SVG foram reaproveitados 1:1. Todo o runtime legado
(`legacy.js`, bridges, `callLegacy`, leituras de `localStorage` com
chaves `edifica_*`, IDs como `#vLogin`/`#vDash`/`#centralContent`) foi
removido. A API é a única fonte de verdade.

## Stack

- React 18 (ESM) + Vite 5
- `react-router-dom` 6
- CSS global (`styles/base.css` = `legacy.css` portado) + CSS Modules
  por página/componente
- Biblioteca de ícones própria (`components/ui/Icons.jsx` — SVG puro,
  sem dependências externas)
- Sem Tailwind, sem UI lib, sem `dangerouslySetInnerHTML`

## Estrutura

```
edifica-dashboard/
├── index.html
├── package.json
├── vite.config.js
├── .env.example                  VITE_API_URL
└── src/
    ├── main.jsx                  entry React
    ├── App.jsx                   router + AuthProvider
    ├── styles/
    │   ├── base.css              ← legacy.css portado (tokens + todas
    │   │                           as classes globais .sb .ni .nl .tbar
    │   │                           .mc .bmc .btn-y etc. + Stages)
    │   └── globals.css           importa fontes + base.css + overrides
    ├── api/
    │   ├── client.js             fetch wrapper (Bearer, ApiError, 401)
    │   ├── auth.js               /auth/login, /me, /logout
    │   ├── clients.js            /clients
    │   └── squads.js             /squads
    ├── context/
    │   └── AuthContext.jsx       token+user em sessionStorage
    ├── routes/
    │   └── ProtectedRoute.jsx    gate de rota autenticada
    ├── utils/
    │   ├── format.js             Intl pt-BR (moeda/%, meses)
    │   ├── centralMetrics.js     derivações da Central
    │   └── roles.js              labels de papel + isAdminUser
    ├── components/
    │   ├── ui/
    │   │   └── Icons.jsx         ← biblioteca SVG portada do real
    │   └── shell/
    │       ├── Sidebar.jsx       nav fixa (base.css + NavLink)
    │       ├── Sidebar.module.css
    │       ├── Topbar.jsx        header sticky minimalista
    │       ├── AppShell.jsx      layout com panelHeader controlável
    │       │                     por página via outlet context
    │       └── AppShell.module.css
    └── pages/
        ├── LoginPage.jsx         ← visual "Protocolo de Acesso" do real
        ├── LoginPage.module.css  ← portado de LoginView.module.css
        ├── CentralPage.jsx       ← visual DashboardView do real
        ├── CentralPage.module.css
        └── PlaceholderPage.jsx   stub para rotas não construídas
```

### Convenção de estilo

- **Classes globais** (em `base.css`) são usadas para a moldura do shell
  (`sb`, `tbar`, `ni`, `nl`, `lbtn`, `licon`, `uav`, etc.) porque o
  frontend real as refinou ao longo de quatro "Stages". Essas classes
  vivem sob um namespace previsível (prefixos curtos) e não colidem
  entre si.
- **CSS Modules** (`.module.css`) são usados para páginas e componentes
  mais recentes (Login, Central, Shell), seguindo a escolha do frontend
  real.
- Nenhum componente nosso usa `:global(#id)` — os IDs legados foram
  removidos.

### Panel header controlado pela página

O `AppShell` expõe `setPanelHeader({ title, actions })` via
`useOutletContext()`. Cada página chama esse setter em um `useEffect`
para ditar o que aparece no cabeçalho do frame (título + controles à
direita, ex: o seletor de período da Central). Isso substitui o padrão
de `createPortal` + `document.getElementById('dashboardPeriodControl')`
que o frontend real usava.

## Como rodar

```bash
cd edifica-dashboard
npm install
cp .env.example .env     # VITE_API_URL=http://localhost:3001/api
npm run dev
```

Sobe em `http://localhost:5173`. O backend precisa estar rodando
(`cd edifica-api && npm run dev`) e com seed aplicado (`npm run seed`).

### Login inicial

Use as credenciais do admin master do seed (`SEED_ADMIN_*` no `.env` do
backend). Fluxo:

1. `POST /auth/login` guarda `{ token, user }` em `sessionStorage`.
2. O `AppShell` dispara `GET /clients` e `GET /squads` em paralelo para
   hidratar a Sidebar e a Central.
3. Central renderiza no período corrente.

Em qualquer `401` posterior, o `AuthContext` faz logout automático e
redireciona para `/login` preservando a rota de origem.

## Rotas

| Rota                   | Estado         | Conteúdo                                      |
|------------------------|----------------|-----------------------------------------------|
| `/login`               | implementado   | "Protocolo de Acesso"                         |
| `/`                    | implementado   | Central (cards grandes + chart + alerta)      |
| `/clientes`            | placeholder    |                                               |
| `/preencher-semana`    | placeholder    |                                               |
| `/gdv`                 | placeholder    |                                               |
| `/squads/:squadId`     | placeholder    |                                               |
| `/equipe`              | placeholder    | admin                                         |
| `/modelo-oficial`      | placeholder    | admin                                         |

## O que foi descartado do frontend real

- Toda a pasta `src/legacy/` (incluindo `legacy.js` e os 5 bridges).
- `legacyBridge.js`, `LegacyModals.jsx`, `AppViews.jsx`.
- `services/sync.js`, `realtimeSync.js`, `setup.js`, `accessRequests.js`,
  `env.js` (bootstrap/health/fallback local que não se aplicam ao nosso
  backend).
- `scripts/build-hostinger.mjs`.
- Qualquer leitura/escrita em `localStorage` com chaves `edifica_*`.

O que **foi mantido** do real: todo o CSS visual (via `base.css`), a
biblioteca `UiIcons`, o módulo de estilo do Login, o visual do
DashboardView e o esqueleto do AppShell (layout com frame arredondado).

## O que vem a seguir

1. `/clientes` — lista com filtro, consumindo `GET /clients`.
2. `/preencher-semana` — formulário semanal por cliente, integrando
   `PUT /metrics/:clientId/:periodKey`.
3. `/gdv` — aba de análises GDV.
4. `/squads/:squadId` — dashboard por squad.
5. `/equipe` (admin) — CRUD de usuários.
6. `/modelo-oficial` (admin) — editor do template de onboarding.
7. Modal "+ Novo Cliente" como action do panelHeader na página Clientes.
