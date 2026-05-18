# Fase A · Consolidação de tokens + primeiro primitivo

Esta entrega contém:

```
tokens.css          → src/styles/tokens.css  (substitui o existente)
base.css            → src/styles/base.css    (substitui o existente)
index.html          → index.html             (substitui o existente, raiz)
Badge.jsx           → src/components/ui/Badge.jsx        (novo)
Badge.module.css    → src/components/ui/Badge.module.css (novo)
```

## O que muda visualmente

**Quase nada.** Esta fase é de fundação. Tokens consolidados produzem
o mesmo visual atual com algumas correções:

- Fundo da aplicação fica `#08090A` (antes `#010102` — preto absoluto demais).
- Fonte carrega só 3 pesos (400/500/600). Pesos 700 e 900 não eram usados.
- Texto primário recebe `tabular-nums` desligado por padrão (estava assim,
  apenas explicitado em `--font-features-base`).
- Pequenas inconsistências de tracking entre superfícies somem.

## O que ganha

- **1 fonte da verdade.** Tokens locais (`--edf-*`, `--sidebar-*`) que
  duplicavam estes globais ficam órfãos — vão ser eliminados nas próximas
  fases de refatoração página a página.
- **Vocabulário pronto pra Fase B.** Os primitivos novos (Button refatorado,
  Badge, Avatar, Table, KpiStrip, Tabs, Dialog, Drawer, Dropdown) já têm
  todos os tokens que precisam.
- **60 KB economizados** no bundle de fonte (Inter 700+900 removidos).

## Checklist de aplicação

Na raiz do projeto Edifica:

1. **Backup das versões atuais** (segurança):
   ```bash
   cp src/styles/tokens.css src/styles/tokens.css.bak
   cp src/styles/base.css src/styles/base.css.bak
   cp index.html index.html.bak
   ```

2. **Substituir os 3 arquivos** com os desta entrega:
   ```bash
   cp /caminho/fase-a/tokens.css src/styles/tokens.css
   cp /caminho/fase-a/base.css src/styles/base.css
   cp /caminho/fase-a/index.html index.html
   ```

3. **Adicionar o Badge** (primitivo novo):
   ```bash
   cp /caminho/fase-a/Badge.jsx src/components/ui/Badge.jsx
   cp /caminho/fase-a/Badge.module.css src/components/ui/Badge.module.css
   ```

4. **Exportar do index** de UI. Em `src/components/ui/index.js`,
   adicionar:
   ```js
   export { default as Badge } from './Badge.jsx';
   ```

5. **Rodar a aplicação** localmente e validar visualmente que nada
   quebrou. As páginas que usam tokens locais (`--edf-*`) seguem
   funcionando porque definem seus próprios. As que já usam globais
   pegam as correções automaticamente.
   ```bash
   npm run dev
   ```

6. **Rodar a auditoria** pra confirmar que não pioramos:
   ```bash
   node scripts/audit-css.mjs
   ```
   Os números devem ser **idênticos** aos de antes (esta fase não
   refatora páginas — só consolida fundação).

7. **Commit:**
   ```bash
   git status
   git add src/styles/tokens.css src/styles/base.css index.html \
           src/components/ui/Badge.jsx src/components/ui/Badge.module.css \
           src/components/ui/index.js
   git commit -m "feat(ds): fase A · consolida tokens canônicos + primitivo Badge

   - tokens.css achatado em :root único (antes: 4 blocos versionados)
   - paleta: --bg-app de #010102 para #08090A (mata preto absoluto)
   - tipografia: 3 pesos (400/500/600) — corta Inter 700/900 (~60kb)
   - escala: 10 tamanhos (tiny..2xl..kpi) — remove sizes 32px+ não usados
   - tokens semânticos completos para Badge/status (success/info/warning/danger/brand/neutral)
   - base.css: defaults tipográficos consumindo tokens
   - novo primitivo: Badge com 6 variantes mapeadas ao briefing operacional"
   git push
   ```

## Validação após aplicar

Rode mentalmente em cada página:

- [ ] Aplicação abre, dark, sem flash branco
- [ ] Sidebar continua funcionando
- [ ] Topbar continua funcionando
- [ ] Todas as rotas carregam
- [ ] Cores parecem **iguais ou ligeiramente melhores** (fundo menos preto)
- [ ] Texto continua legível, no mesmo lugar, com o mesmo peso
- [ ] Modais e dropdowns abrem normalmente

Se algo quebrou: 99% das vezes é página com token local `--edf-foo`
referenciando um valor que mudou de nome no global. Próximas fases
eliminam esses tokens locais. Por ora, restaure o backup do arquivo
afetado e me avisa qual quebrou.

## Próximas fases (não nesta entrega)

- **Fase B**: refatorar primitivos UI (Button com variantes, Select,
  novo Avatar, Table, KpiStrip, Tabs, Dialog, Drawer, Dropdown). 8
  primitivos. Estimativa: 1–2 dias.

- **Fase C**: refatorar chassis (Sidebar e Topbar consumindo tokens
  globais, sem tokens locais paralelos). Meio dia.

- **Fase D**: refatorar páginas, uma por commit, do top da auditoria
  pra baixo:
  - `ProfilePage` (3.489 vícios → meta: <50)
  - `ProjectsPage` (615 vícios → meta: <30)
  - `ProjectWorkspace`, `TeamAccessPage`, `OpenAIUsagePage`, ...
  Estimativa: 1 semana com IA + revisão humana.

- **Final**: ativar `stylelint` pré-commit e bloquear regressão.

## Onde está o Badge sendo usado nesta fase

Em lugar nenhum ainda. O componente está disponível mas as páginas
continuam usando suas implementações próprias.

A migração das páginas pra usar `<Badge>` acontece na Fase D, página
por página. Quando refatorarmos a `ClientsPage`, por exemplo, todo o
CSS das badges de status some, substituído por:

```jsx
<Badge variant="success">Ativo</Badge>
<Badge variant="info">Onboard</Badge>
<Badge variant="warning">Vencendo</Badge>
<Badge variant="danger">Vencido</Badge>
<Badge variant="danger">Churn</Badge>
<Badge variant="neutral">Pausado</Badge>
```

Por isso a Fase A entrega o Badge "no banco" — pronto pra ser sacado
quando começarmos a refatorar as páginas.
