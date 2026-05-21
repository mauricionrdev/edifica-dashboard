# Pacote consolidado — Edifica Central (v135 → v144)

Estado completo de **todos** os arquivos modificados desde o início, num único pacote.
Aplique este ZIP por cima do projeto original e ele substitui tudo de uma vez —
elimina o risco de aplicar patches fora de ordem.

## Como aplicar

1. Extraia este ZIP na **raiz do projeto** (a pasta que contém `package.json`,
   `index.html` e `vite.config.js`). Os caminhos `src/...` vão sobrescrever os
   arquivos corretos.

2. **Rebuild limpo** (essencial — sem isso o bundle antigo persiste):
   ```bash
   rm -rf dist node_modules/.vite
   npm run build
   ```

3. No navegador: **hard refresh** (Ctrl+Shift+R) ou aba anônima. O Vite gera
   bundles com hash; o navegador/CDN pode estar servindo o antigo.

## Conferência rápida (rode na raiz, após extrair)

```bash
grep -c "menu button.option" src/components/ui/Select.module.css   # = 7
grep -c 'type="user"' src/pages/ProfilePage.jsx                    # = 3
grep -c "createObjectURL" src/components/clients/AnalysisTab.jsx    # = 1
git status                                                          # 28 arquivos
```

Se o `git status` não listar os 28 arquivos, o ZIP foi extraído na pasta errada.

## O que está incluído (28 arquivos)

**Bugs de runtime (v135)**
- `AnalysisTab.jsx` — `handleEntryPaste` (colar imagem em análise)
- `ClientDetailDrawer.jsx` — hooks após early return (risco de tela branca)
- `ProjectsPage.jsx` — remoção de membro via modal (sem `window.confirm`)

**Design system**
- `tokens.css` / `theme.css` — fonte única de tokens (v136)
- Radius dentro do teto de 10px em 11 arquivos `.module.css` (v137)
- `SquadRankingPage` — adoção do primitivo Button (v138)
- `ProfilePage.module.css` — tokenização de cores (v139)

**Select (v140–v144)**
- `Select.jsx` / `Select.module.css` — reescrito, minimalista, blindado por
  especificidade (`.menu button.option` 0,2,1) para vencer overrides de página
  em todas as telas, sem `!important`. Props `type="user"` (Avatar à esquerda)
  e `type="client"` (texto puro).
- z-index/overflow do dropdown de paginação (Clientes) e do header (Dashboard)
- `type="user"` aplicado em: ProfilePage (Responsável: tarefa, demanda, handoff),
  ProjectWorkspace (membro, responsável, colaborador), OverviewTab (gestor, GDV)
- `type="client"` em: Dashboard e PreencherSemana

**PDF (v141)**
- `AnalysisTab.jsx` / `ProfilePage.jsx` — PDFs com imagens/scans (data URL grande
  → Blob URL) deixam de renderizar em branco.

## Observação — componentes ainda separados
`UserPicker` (usado em ModeloOficial, GdvPage, SquadPage, TeamAccess, Projects,
ClientFormModal) já renderiza avatar nativamente. O ProfilePage usa o `<Select>`
global (não tem select próprio). Não há mais select de usuário sem avatar.

## Validação
`npm run release:check` — aprovado (audit CSS strict + verify:prod + build).
rawColors 1250 (baseline 1376), radiusAbove10 0 (baseline 8), important 5.
