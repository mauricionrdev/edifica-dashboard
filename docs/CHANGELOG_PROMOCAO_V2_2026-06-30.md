# Changelog — Promoção V2 segura

## Objetivo

Criar uma camada interna para organizar a promoção gradual das rotas V2 sem substituir produção e sem remover legado no mesmo ciclo.

## Alterações

- Criada a rota paralela `/v2/promocao`.
- Criado o registry único das rotas V2 em `src/pages/v2/v2RouteRegistry.js`.
- Atualizado o hub `/v2/visao-geral` para usar o registry único.
- Atualizada a tela `/v2/validacao` para usar a mesma matriz de rotas do registry.
- Adicionados estilos compartilhados de cards de promoção, timeline e checklist.

## Segurança

- Sem alteração de rota produtiva.
- Sem alteração de endpoint.
- Sem escrita no banco.
- Sem migration.
- Sem remoção de legado.
- Rota protegida por `team.view`.

## Uso recomendado

1. Abrir `/v2/validacao`.
2. Confirmar endpoints GET.
3. Abrir `/v2/promocao`.
4. Seguir a ordem de menor risco.
5. Promover uma rota por vez, mantendo fallback legado.
