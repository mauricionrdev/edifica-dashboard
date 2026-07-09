# Changelog — limpeza de planos de ação antigos na Análise ICP

## Contexto

A funcionalidade Planos de ação foi movida para a aba Análise GDV. Alguns registros criados antes da correção ficaram salvos como Análise ICP, causando contagem indevida na aba.

## Ajuste

- A aba Análise ICP detecta planos de ação antigos salvos com o marcador interno de plano.
- Esses planos antigos não entram na lista normal de registros da ICP.
- Quando existirem, a aba exibe um bloco de limpeza com a data, resumo e botão para remover cada plano antigo desta aba.
- A remoção usa o endpoint atual de exclusão de análise e respeita a confirmação própria do componente.
- A aba Análise GDV permanece como local correto dos Planos de ação.

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria migration.
- Não muda a regra atual dos Planos de ação na Análise GDV.
