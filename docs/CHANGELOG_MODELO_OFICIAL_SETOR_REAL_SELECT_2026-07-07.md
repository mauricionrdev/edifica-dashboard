# Changelog — Modelo Oficial · Setor responsável real + seletor alinhado

Data: 2026-07-07

## Contexto

O campo "Setor responsável" criado no Modelo Oficial estava exibindo setores genéricos que não representavam com precisão os papéis reais cadastrados na Edifica. Além disso, o campo usava `<select>` nativo do navegador, gerando foco visual e dropdown cru, fora do padrão visual da plataforma.

## Ajustes aplicados

- A lista de setores foi alinhada aos papéis reais da Edifica usados pelo sistema:
  - CAP
  - Gestor de Tráfego
  - Comercial Interno
  - GDV
  - SDR
  - Closer
  - Suporte de Tecnologia
- Foram removidas da lista opções genéricas que não são papéis reais do cadastro atual:
  - Técnico
  - Designer
  - CS
  - Financeiro
- O seletor nativo foi substituído por um seletor customizado no padrão visual dark da plataforma.
- O seletor não adiciona focus ring visual.
- O backend foi ajustado para resolver os setores reais ao criar projetos a partir do Modelo Oficial.

## Compatibilidade

- Templates antigos salvos como `commercial` continuam sendo interpretados como `internal_commercial`.
- Valores antigos de `technical`/`tecnico` continuam sendo interpretados como `suporte_tecnologia` para evitar quebra operacional.
- A alteração não cria migration e não altera schema.

## Arquivos alterados

- `src/pages/ModeloOficialPage.jsx`
- `src/pages/ModeloOficialPage.module.css`
- `edifica-api/src/routes/projects.js`
