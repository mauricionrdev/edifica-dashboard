# Patch — Planos de ação: cards de anexos e estado vazio

## Arquivos alterados

- `src/components/clients/AnalysisTab.jsx`
- `src/components/clients/AnalysisTab.module.css`

## Ajustes

- Reorganiza os cards de anexo no modal de Planos de ação.
- Mantém thumbnail/ícone, nome, tipo/tamanho e ações em áreas separadas.
- Corrige botões `Visualizar`, `Baixar` e `Remover` para não ficarem empilhados ou gigantes.
- Ajusta também os cards de anexos normais das análises para manter tipografia e ações compactas.
- Adiciona estado vazio em `Ações` quando o plano ainda não possui ações cadastradas.
- Novos planos começam sem ação placeholder, evitando exibir `Descrever ação` como se fosse uma ação real.

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria migration.
- Não altera as regras de anexos.
- Não altera Preencher Semana.
