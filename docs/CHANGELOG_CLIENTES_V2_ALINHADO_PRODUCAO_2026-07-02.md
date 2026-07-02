# Changelog — Clientes V2 alinhado à tela validada de produção

## Objetivo

Ajustar a direção da reconstrução V2 para não criar uma tela genérica de clientes.

A rota `/v2/clientes` passa a usar a mesma implementação validada da tela produtiva de clientes, preservando:

- paleta semântica existente de tags e status;
- avatares reais carregados pela camada atual de avatar;
- fallback de iniciais apenas quando o cliente realmente não possui avatar salvo;
- modal de criação existente;
- modal de detalhe existente;
- permissões reais de criação, edição, visualização de cronograma financeiro, projetos, tarefas e exclusão;
- filtros e escopos já validados;
- busca, paginação e mês de churn;
- análises ICP, GDV e rotas;
- botão de Modelo padrão quando a permissão permite.

## Arquivos alterados

- `src/pages/v2/ClientsV2Page.jsx`

## Decisão técnica

A tela V2 de Clientes deixa de ser uma reconstrução visual genérica e passa a reaproveitar a tela produtiva validada como fonte de verdade.

A partir daqui, a reconstrução V2 deve seguir a regra:

```txt
Não criar tela genérica trocando apenas dados.
Cada tela V2 precisa preservar as informações, ações, permissões e estados da tela validada em produção.
```

## Segurança

- Não altera `/clientes`.
- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não altera migration.
- Não altera permissões.
- Não altera Preencher Semana.

## Validação esperada

Comparar `/clientes` e `/v2/clientes`:

- tags e status devem ter a mesma referência visual;
- avatares devem carregar da mesma origem;
- ações disponíveis devem respeitar as mesmas permissões;
- criação e detalhe devem abrir os mesmos modais;
- filtros e paginação devem funcionar como na tela oficial.
