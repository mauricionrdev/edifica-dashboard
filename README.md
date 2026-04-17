# Patch: aba de Clientes

10 arquivos novos/editados que implementam a aba `/clientes` completa:
listagem, busca, scope tabs, criação, edição inline via drawer e
exclusão (admin-only).

## Como aplicar

Copie a pasta `src/` por cima do seu projeto. Não apaga nada existente:
só adiciona os arquivos novos e sobrescreve dois que precisaram mudar.

```
src/App.jsx                                           (EDITADO)
src/api/clients.js                                    (EDITADO)
src/context/ToastContext.jsx                          (NOVO)
src/utils/clientHelpers.js                            (NOVO)
src/pages/ClientsPage.jsx                             (NOVO)
src/pages/ClientsPage.module.css                      (NOVO)
src/components/clients/ClientFormModal.jsx            (NOVO)
src/components/clients/ClientFormModal.module.css     (NOVO)
src/components/clients/ClientDetailDrawer.jsx         (NOVO)
src/components/clients/ClientDetailDrawer.module.css  (NOVO)
```

Depois:

```bash
npm run build
# subir dist/ pro Hostinger
```

Sem dependências novas — usa só `react`, `react-dom`, `react-router-dom`
que já estão no `package.json`.

## O que mudou em cada arquivo editado

### `src/App.jsx`
- Importado `ToastProvider` e `ClientsPage`.
- `ToastProvider` envolve o `<Routes>` (dentro do `AuthProvider`).
- Rota `path="clientes"` agora renderiza `<ClientsPage />` em vez do
  placeholder.

### `src/api/clients.js`
- Adicionadas três funções: `createClient(body)`, `updateClient(id, patch)`,
  `deleteClient(id)`. Batem com o contrato de `POST`, `PUT` e `DELETE
  /clients[/:id]` do backend (`src/routes/clients.js`).

## Funcionalidades entregues

**Listagem**
- Consome o `clients` do outlet context do `AppShell` (já carregado na
  entrada, sem requisições extras aqui).
- 4 cards de métrica no topo: Total, Ativos, Vencendo (endDate em ≤30d),
  Com squad.
- Busca client-side por nome, squad, gestor ou GDV.
- Scope tabs estilo Asana: Todos, Ativos, Vencendo, Churn, Com squad —
  cada um com contagem.
- Tabela usando as classes `.central-clients`, `.cc-hdr`, `.cc-row` do
  `base.css` (que já tinham refinamentos Stage 17/20).

**Criação (`POST /clients`)**
- Botão "+ Novo cliente" vai no `panelHeader` do AppShell (via
  `setPanelHeader`).
- Modal com todos os 9 campos que o backend aceita: `name`, `squadId`,
  `gdvName`, `gestor`, `status`, `fee`, `metaLucro`, `startDate`, `endDate`.
- Após criar: refresh da lista, abre o drawer do cliente novo, toast de
  sucesso.

**Edição inline (`PUT /clients/:id`) via drawer**
- Drawer lateral deslizando da direita (estilo Asana).
- Cada alteração salva sozinha:
  - text fields → debounce de 400ms
  - select/date → commit imediato
  - label do campo mostra "· salvando…" enquanto persiste
- Se a API recusar, o campo volta ao valor canônico e um toast de erro
  aparece.

**Exclusão (`DELETE /clients/:id`) — admin only**
- Seção "Zona perigosa" no drawer só aparece para admin/master.
- Confirmação explícita com texto avisando que onboarding/métricas/análises
  serão apagadas em cascata.

**Toasts**
- Sistema leve via portal no canto inferior direito.
- Fila com autodismiss em 3.5s; clique dispensa antes.
- Variantes: success (padrão), warn, error.

## Garantias de qualidade

Antes de entregar, validei estaticamente:
- **55 imports relativos** resolvem (0 quebrados)
- **Todas as classes CSS** referenciadas no JSX existem (globais em
  `base.css` + CSS Modules por arquivo)
- **Balanceamento de chaves/parênteses** em todos os `.jsx` ok

## Fora do escopo desta rodada

Aba Onboarding dentro do detalhe, análises ICP/GDV, contrato, dashboard
do cliente. Todos esses ficam para rodadas próprias — o drawer atual só
mostra dados do cliente + metadados.
