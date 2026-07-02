# Changelog — Clientes V2 reconstruída sem espelhar a tela produtiva

## Objetivo

Refazer `/v2/clientes` como tela operacional preparada para produção, sem importar a página produtiva inteira.

A tela produtiva validada continua sendo a referência de comportamento, mas a implementação V2 passa a ser própria, limpa e incremental.

## Arquivos alterados

- `src/pages/v2/ClientsV2Page.jsx`
- `src/pages/v2/ClientsV2Page.module.css`

## O que mudou

- Removido o atalho que importava `DesignLabClientsPage` diretamente.
- Mantidas as chamadas, permissões e modais validados onde faz sentido.
- Recriado layout próprio para `/v2/clientes`.
- Preservados avatares reais via `getClientAvatar`.
- Preservado fallback de iniciais apenas quando não houver avatar salvo.
- Preservadas cores semânticas de status e tags via `BareBadge` e tons existentes.
- Preservada criação de cliente pelo modal validado.
- Preservado detalhe completo pelo modal validado.
- Preservadas permissões de criar, editar, excluir, ver cronograma financeiro, projetos e tarefas.
- Preservados filtros por escopo, busca, churn por mês, TCV, comercial interno, status e vencimento.
- Adicionados filtros operacionais por Squad, GDV e Gestor sem escrita em banco.
- Separado visualmente Churn de Finalizado.
- Mantida navegação para Modelo padrão quando a permissão permitir.

## Decisão técnica

A V2 não deve ser uma tela genérica nem um espelho da tela atual.

Regra adotada:

```txt
Produção validada = referência funcional
V2 = implementação limpa própria, preservando dados, funções e permissões existentes
```

## Segurança

- Não altera `/clientes`.
- Não altera `/legacy/clientes`.
- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não cria migration.
- Não altera Preencher Semana.
- Não executa POST, PUT, PATCH ou DELETE fora dos modais já validados.

## Validação esperada

Comparar `/clientes` e `/v2/clientes`:

- clientes exibidos;
- status e tags;
- avatares reais;
- criação de cliente;
- abertura do detalhe;
- permissões;
- filtros principais;
- mês de churn;
- separação entre Churn e Finalizado;
- modelo padrão.
