# Edifica API

Backend limpo da plataforma Edifica. Node.js + Express + MySQL + JWT.

Este backend foi reescrito do zero a partir da lógica do protótipo original
(`Edifica_Dashboard__15_.html`). Nada do runtime legado (`legacy.js`, bridges,
localStorage) é usado. O banco é a única fonte de verdade.

## Stack

- Node.js 18+ (ESM)
- Express 4
- MySQL 8 via `mysql2/promise`
- Autenticação: JWT (`jsonwebtoken`) + hash de senha com `bcryptjs`
- Sem ORM — SQL direto, enxuto e auditável

## Estrutura

```
edifica-api/
├── server.js                 entry point
├── package.json
├── .env.example
├── migrations/
│   ├── 001_init.sql          schema completo
│   └── run.js                runner de migrations
├── scripts/
│   └── seed.js               cria admin master + squads padrão + template
└── src/
    ├── db/
    │   └── pool.js           pool mysql2 + helpers query() / withTransaction()
    ├── middleware/
    │   ├── auth.js           requireAuth + requireAdmin
    │   └── errors.js         error handler central
    ├── utils/
    │   ├── helpers.js        HttpError, UUID, parseJson, datas
    │   └── domain.js         ROLES, template oficial, cálculos de métricas
    └── routes/
        ├── auth.js           POST /login, GET /me, POST /logout
        ├── users.js          CRUD + toggle ativo (admin)
        ├── squads.js         CRUD de squads
        ├── clients.js        CRUD + instancia onboarding do template
        ├── metrics.js        GET/PUT semanas + recálculo de goal_status
        ├── onboarding.js     GET/PUT onboarding do cliente
        ├── analyses.js       CRUD de análises ICP/GDV
        └── template.js       GET/PUT/RESET do Modelo Oficial
```

## Como rodar localmente

### 1. Pré-requisitos

- Node.js 18+
- MySQL 8+ rodando localmente (ou em container)

### 2. Instalação

```bash
cd edifica-api
npm install
cp .env.example .env
# Edite .env: DB_*, JWT_SECRET, SEED_ADMIN_*
```

Para gerar um `JWT_SECRET` forte:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Banco de dados

Crie o usuário no MySQL (se ainda não existir) e aponte no `.env`. A migration
cria o database automaticamente caso não exista:

```sql
-- Opcional: criar user dedicado
CREATE USER 'edifica_user'@'%' IDENTIFIED BY 'edifica_pass';
GRANT ALL PRIVILEGES ON edifica.* TO 'edifica_user'@'%';
FLUSH PRIVILEGES;
```

Rode as migrations e o seed:

```bash
npm run migrate
npm run seed
```

O seed cria:
- um admin master (credenciais em `SEED_ADMIN_*` do `.env`)
- os 3 squads padrão (CAP João, CAP Humberto, CAP Samara)
- o Modelo Oficial de onboarding

### 4. Start

```bash
npm run dev      # com --watch (reinicia a cada alteração)
npm start        # modo produção
```

A API sobe em `http://localhost:3001` por padrão.

## Endpoints

Base: `/api`. Todas as rotas (exceto `/auth/login` e `/health`) exigem
header `Authorization: Bearer <token>`.

### Auth

| Método | Rota              | Corpo                          | Descrição                        |
|-------:|-------------------|--------------------------------|----------------------------------|
| POST   | `/auth/login`     | `{ identifier, password }`     | Login por e-mail OU nome         |
| GET    | `/auth/me`        | —                              | Usuário atual                    |
| POST   | `/auth/logout`    | —                              | No-op (JWT é stateless)          |

### Users (admin)

| Método | Rota                      | Descrição                  |
|-------:|---------------------------|----------------------------|
| GET    | `/users`                  | Lista todos                |
| POST   | `/users`                  | Cria novo usuário          |
| PUT    | `/users/:id`              | Atualiza dados / senha     |
| PATCH  | `/users/:id/toggle`       | Ativa/desativa             |
| DELETE | `/users/:id`              | Remove (exceto master)     |

### Squads

| Método | Rota               | Descrição              |
|-------:|--------------------|------------------------|
| GET    | `/squads`          | Lista                  |
| POST   | `/squads`          | Cria (admin)           |
| PUT    | `/squads/:id`      | Renomeia (admin)       |
| DELETE | `/squads/:id`      | Remove (admin)         |

### Clients

| Método | Rota                  | Descrição                                   |
|-------:|-----------------------|---------------------------------------------|
| GET    | `/clients`            | Lista (filtrada por squads do usuário)      |
| GET    | `/clients/:id`        | Detalhe                                     |
| POST   | `/clients`            | Cria + instancia onboarding                 |
| PUT    | `/clients/:id`        | Atualiza (churn seta churn_date)            |
| DELETE | `/clients/:id`        | Remove (admin). Cascata para filhos.        |

### Metrics

| Método | Rota                                  | Descrição                            |
|-------:|---------------------------------------|--------------------------------------|
| GET    | `/metrics/:clientId`                  | Todos os períodos do cliente         |
| GET    | `/metrics/:clientId/:periodKey`       | Uma semana (ex: `2026-04-S2`)        |
| PUT    | `/metrics/:clientId/:periodKey`       | Upsert + recalcula `goal_status`     |

Cada PUT recalcula automaticamente o `weekStatus` (se não vier no payload) e
agrega o `goal_status` do cliente considerando as 4 semanas do mês do `periodKey`.

### Onboarding

| Método | Rota                                   | Descrição                   |
|-------:|----------------------------------------|-----------------------------|
| GET    | `/clients/:clientId/onboarding`        | Estado atual                |
| PUT    | `/clients/:clientId/onboarding`        | Substitui `sections` inteiro|

### Analyses (ICP / GDV)

Tipos aceitos: `icp`, `gdvanalise`.

| Método | Rota                                                    |
|-------:|---------------------------------------------------------|
| GET    | `/clients/:clientId/analyses/:type`                     |
| POST   | `/clients/:clientId/analyses/:type`                     |
| PUT    | `/clients/:clientId/analyses/:type/:analysisId`         |
| DELETE | `/clients/:clientId/analyses/:type/:analysisId`         |

### Template (Modelo Oficial)

| Método | Rota                | Descrição                          |
|-------:|---------------------|------------------------------------|
| GET    | `/template`         | Estado atual                       |
| PUT    | `/template`         | Substitui sections (admin)         |
| POST   | `/template/reset`   | Restaura padrão embutido (admin)   |

### Health

```
GET /api/health
→ { status: "ok" | "degraded", db: boolean, timestamp }
```

## Modelo de domínio

Ver `src/utils/domain.js` para a fonte de verdade. Resumo:

- **ROLES**: `admin`, `cap`, `gestor`, `gdv`. Admin e `is_master` têm acesso a tudo. Demais ficam restritos aos `squads` atribuídos.
- **period_key** (métricas semanais): formato `YYYY-MM-Sw` com `w` ∈ {1,2,3,4}.
- **Cálculos canônicos** (iguais ao protótipo):
  - `leadsPrevistos = investimento / cpl`
  - `taxaConversao  = (fechados / volume) × 100`
  - `contratosPrevistos = leadsPrevistos × (taxa / 100)`
  - `isHit = contratosPrevistos ≥ metaLucro`
- **weekStatus**: `'vai'` se bater meta, `'nao'` caso contrário, `''` sem dados.
- **goal_status** (agregado do cliente): `'vai'` se alguma semana `vai` e nenhuma `nao`; `'nao'` se alguma `nao`; `''` caso contrário.

## Teste rápido (smoke)

Depois de `npm run migrate && npm run seed && npm start`:

```bash
# Health
curl http://localhost:3001/api/health

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"superadmin@edifica.com.br","password":"Edifica@2026!"}'

# Listar squads (substitua TOKEN)
curl http://localhost:3001/api/squads \
  -H "Authorization: Bearer TOKEN"
```

## Observações

- `goal_status` é denormalizado no `clients` para ordenar listas sem agregações pesadas. A verdade fica em `weekly_metrics`.
- Clientes sem squad só aparecem para admins. Revise esta regra em `routes/clients.js#filterBySquadAccess` se precisar mudar.
- Em produção, use `FRONTEND_URL` com HTTPS e `NODE_ENV=production`. O CORS permite apenas a origem declarada.
