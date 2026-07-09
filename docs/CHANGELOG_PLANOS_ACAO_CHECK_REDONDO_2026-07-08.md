# Changelog — Planos de ação: check redondo e estado vazio

## Arquivos alterados

- `src/components/clients/AnalysisTab.jsx`
- `src/components/clients/AnalysisTab.module.css`

## Ajustes

- O marcador de conclusão das ações agora segue o padrão redondo da plataforma.
- O estado pendente deixa de parecer uma caixa vazia e passa a mostrar um check sutil dentro do círculo.
- O estado concluído mantém o check verde.
- A contagem de ações ignora linhas vazias, evitando confusão como `1/2` quando uma ação ainda está sem texto.
- O estado vazio de ações agora orienta melhor o usuário antes da criação da primeira ação.

## Segurança

- Sem alteração de backend.
- Sem alteração de banco.
- Sem endpoint novo.
- Sem alteração na lógica de anexos.
