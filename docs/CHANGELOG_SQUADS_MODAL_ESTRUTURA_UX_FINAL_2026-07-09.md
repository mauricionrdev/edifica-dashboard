# Changelog — Modal de Squads: estrutura e UX final

Data: 2026-07-09

## Objetivo

Refinar o modal de criação/edição de Squad com foco em organização, hierarquia visual e aderência ao design system real da plataforma.

## Ajustes

- Reorganização da estrutura interna do modal.
- Logotipo do Squad posicionado como elemento real de identidade visual, maior e sem aparência de card.
- Campo Nome do Squad reduzido e posicionado junto ao bloco de identidade.
- Responsável/líder e link agrupados de forma compacta.
- Status e ranking transformados em controles segmentados compactos.
- Remoção de textos longos dentro das opções.
- Estado selecionado ficou mais sutil, sem bloco amarelo pesado.
- Redução da largura e das sobras internas do modal.
- Tipografia ajustada em título, labels, campos e opções.

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria migration.
- Não altera regra de criação/edição de Squads.
- Não altera ranking ou clientes.

## Validação

- npm run build
- npm run verify:prod
