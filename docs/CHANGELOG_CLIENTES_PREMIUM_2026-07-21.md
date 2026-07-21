# Changelog — identificação de clientes Premium

## Escopo

Adiciona classificação Premium ao cadastro do cliente e etiqueta dourada nas principais visualizações operacionais.

## Persistência

- Nova coluna segura `clients.is_premium` com padrão `0`.
- A coluna é criada automaticamente uma única vez quando ainda não existir.
- API utiliza `isPremium: boolean` nos payloads de criação, edição e consulta.
- Clientes existentes permanecem como não Premium.

## Formulários

- Novo campo opcional `Cliente Premium?`.
- Valor padrão: `Não`.
- Disponível na criação e na edição do cliente.

## Visualização

A etiqueta `Premium` é exibida ao lado do nome nas principais áreas:

- lista de clientes atual e V2;
- modal e drawer de detalhes;
- clientes dos Squads e seleção de rotas;
- Preencher Semana atual e design-lab;
- Gestão de Tráfego atual e V2;
- carteira dos GDVs;
- Dashboard atual, design-lab e V2;
- resultados de busca de clientes no Perfil;
- seletores de cliente que suportam texto.

## Regra

A classificação é somente visual. Não altera metas, ranking, indicadores, permissões, contratos ou regras operacionais.
