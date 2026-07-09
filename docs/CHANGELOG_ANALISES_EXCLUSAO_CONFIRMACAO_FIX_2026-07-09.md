# Changelog — Análises: exclusão e confirmação

Data: 2026-07-09

## Correção

- Corrigida a interceptação do confirmador genérico do modal de cliente nas abas de análise.
- Exclusões de registros em Análise ICP, Análise GDV e Resumo de Rotas passam a usar apenas a confirmação própria do componente de análise.
- Exclusões dentro do modal de Planos de ação não abrem mais a confirmação antiga do modal de cliente.
- Exclusão de plano pelo histórico lateral permanece disponível e executa a remoção real do registro.
- Exclusão de ação dentro do plano volta a funcionar sem ficar presa atrás do modal.
- Confirmações internas de anexo e registro ficam acima do modal de Planos de ação.
- Histórico lateral de planos concluídos mantém indicação verde quando todas as ações válidas estão concluídas.

## Segurança

- Sem alteração de backend.
- Sem alteração de banco.
- Sem novo endpoint.
- Sem migration.
- Sem alteração na regra de salvamento das análises.
