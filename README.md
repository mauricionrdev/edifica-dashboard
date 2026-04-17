# Patch: tabs completas do cliente + Modelo Oficial

Implementação completa das 5 abas do drawer de cliente e da página
`/modelo-oficial`. Aplique copiando `src/` por cima do projeto.

## Arquivos

```
src/App.jsx                                           (EDITADO)

src/api/onboarding.js                                 (NOVO)
src/api/analyses.js                                   (NOVO)
src/api/template.js                                   (NOVO)

src/hooks/useAutoSave.js                              (NOVO)

src/utils/onboardingHelpers.js                        (NOVO)

src/components/clients/ClientDetailDrawer.jsx         (SUBSTITUI — refactor para 5 abas)
src/components/clients/ClientTabs.module.css          (NOVO)
src/components/clients/OverviewTab.jsx                (NOVO — extraído do drawer antigo)
src/components/clients/OnboardingTab.jsx              (NOVO)
src/components/clients/OnboardingTab.module.css       (NOVO)
src/components/clients/ContractTab.jsx                (NOVO)
src/components/clients/ContractTab.module.css         (NOVO)
src/components/clients/AnalysisTab.jsx                (NOVO)
src/components/clients/AnalysisTab.module.css         (NOVO)

src/pages/ModeloOficialPage.jsx                       (NOVO)
src/pages/ModeloOficialPage.module.css                (NOVO)
```

Depois:

```bash
npm run build
# subir dist/
```

Sem dependências novas.

## O que foi entregue

### Drawer de cliente — 5 abas estilo Asana

**Visão geral** — igual ao drawer anterior (dados principais, contrato,
metadados, zona perigosa de exclusão — admin).

**Onboarding** — painel completo equivalente ao do frontend real:

- Cabeçalho com progresso geral (track, percentual, X/Y tarefas).
- Cada section é expansível, tem título editável, barra e % de
  progresso, chip "✓ Concluído" quando todas as tarefas check.
- Tarefas: checkbox, nome editável, select de responsável, data limite,
  botão de nota (abre textarea).
- Sub-tarefas herdadas do template.
- Adicionar tarefa personalizada por seção (Enter ou botão).
- Remover tarefa customizada (ícone ×) — tarefas do template padrão
  não são removíveis aqui.
- **Auto-save com debounce de 600ms** via `PUT /clients/:id/onboarding`
  (o backend substitui o array inteiro — protocolo espelhado na UI).
- Indicador de status ("Salvando…" / "Salvo" / "Alterações pendentes")
  no canto da TabBar.

**Contrato** — 3 mini-cards de resumo (Status · Mensalidade ·
Vencimento com dias restantes) + formulário dos 8 campos contratuais.
Cada campo salva sozinho (text debounce 400ms, select/date imediato).

**ICP / GDV** — duas abas usando o mesmo componente `AnalysisTab`:

- Lista entradas ordenadas mais-recentes-primeiro.
- "+ Nova análise" cria com data=hoje e textarea vazia.
- Editar texto → `PUT` com debounce de 500ms.
- Editar data → `PUT` imediato.
- Remover → `DELETE` com `confirm` nativo e optimistic update.
- Indicador "Salvando…" / "Alterações pendentes" por entrada.

### Página `/modelo-oficial`

- Leitura via `GET /template` (qualquer autenticado).
- Editor completo da estrutura: renomear seções/tarefas, remover,
  adicionar nova seção (form no final), adicionar tarefa dentro da seção.
- **Auto-save com debounce de 700ms** via `PUT /template` (admin only).
- Botão "Restaurar padrão" → `POST /template/reset` com confirm nativo.
- Usuários não-admin veem o template em modo **somente leitura** (inputs
  desabilitados + botão de reset oculto).
- Banner amarelo informativo explicando o comportamento
  ("aplicado a novos clientes; não afeta existentes").

### Backend — endpoints usados

| Método | Rota                                                           |
|-------:|----------------------------------------------------------------|
| GET    | `/clients/:clientId/onboarding`                                |
| PUT    | `/clients/:clientId/onboarding`                                |
| GET    | `/clients/:clientId/analyses/:type`                            |
| POST   | `/clients/:clientId/analyses/:type`                            |
| PUT    | `/clients/:clientId/analyses/:type/:analysisId`                |
| DELETE | `/clients/:clientId/analyses/:type/:analysisId`                |
| GET    | `/template`                                                    |
| PUT    | `/template` (admin)                                            |
| POST   | `/template/reset` (admin)                                      |

Todos os 9 endpoints já existem no `edifica-api` entregue.

### Hook `useAutoSave`

Usado pelo OnboardingTab e pelo ModeloOficialPage. Características:

- Debounce configurável (default 600ms).
- Coalesce: se uma nova mudança chegar durante um save em voo, só
  uma requisição adicional é disparada ao final com o valor mais
  recente (não empilha).
- Estado exposto: `'idle' | 'pending' | 'saving' | 'saved' | 'error'`.
- `flush()` expõe commit imediato (útil em beforeunload futuro).
- `skip: true` pula auto-save (usado até o estado inicial ser
  hidratado do GET — evita PUT com sections vazio).

## Validação estática aplicada antes de entregar

- **99/99 imports relativos** resolvem (0 quebrados).
- **Todas as classes CSS** usadas no JSX existem em algum `.css`
  (globais `base.css` + CSS Modules).
- **Balanceamento de chaves/parênteses** OK em todos os novos `.jsx`.

## Limitações assumidas

- Sub-tarefas do onboarding não têm UI de "adicionar sub nova" (só
  mostramos as que vêm do template). Se precisar, é uma evolução simples
  no `OnboardingTab` usando `updateTask` + `subs: [...]`.
- Delete de tarefa do onboarding só aparece em tarefas cuja `id`
  contém `_custom_` — isto é, as que foram adicionadas pelo usuário.
  Tarefas do template oficial não podem ser removidas do onboarding
  de um cliente (devem ser retiradas do Modelo Oficial, ou marcadas
  como feitas se forem irrelevantes para esse cliente).
- Aba "Dashboard" do cliente (que existia no protótipo real com
  métricas semanais) **não está nessa rodada** — vai na próxima, já
  que depende de integração com `/metrics/:clientId/:periodKey`.
