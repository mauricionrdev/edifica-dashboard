# Changelog — Ajuste UX do modal de Squads

## Escopo

Ajuste visual e estrutural do modal de criação/edição de Squad na tela de Equipe.

## Arquivos alterados

- `src/pages/TeamAccessPage.jsx`
- `src/pages/TeamAccessPage.module.css`

## Alterações

- Removido o bloco de resumo interno que competia com o formulário no modo edição.
- Movido o link de dashboard para o rodapé do modal no modo edição.
- Reorganizada a distribuição interna do modal para reduzir compressão entre nome, líder e link.
- Aumentado o espaço útil do campo de link personalizado.
- Refinado o bloco de logotipo para manter ação de troca sem parecer card.
- Suavizado o estado selecionado de Status e Ranking.
- Reduzidos pesos e tamanhos dos textos auxiliares dos controles segmentados.
- Mantida a lógica de criação/edição, status e exibição no ranking.

## Validação

- `npm run build`
- `npm run verify:prod`

## Observação

Sem alteração de backend, schema, endpoints ou regra de negócio.
