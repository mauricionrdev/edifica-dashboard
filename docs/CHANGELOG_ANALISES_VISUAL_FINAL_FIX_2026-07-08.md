# Changelog — Análises: correção visual final do topo, modais e planos de ação

## Arquivos alterados

- `src/components/clients/AnalysisTab.jsx`
- `src/components/clients/AnalysisTab.module.css`

## Ajustes

- Remove fundo escuro solto no header das abas de análise.
- Mantém o topo das abas sem card quadrado ou container técnico.
- Corrige o preview de Plano de ação para não parecer pílula/campo arredondado indevido.
- Reestabiliza o modal de Planos de ação com superfície opaca, borda e layout consistentes.
- Corrige botões do modal de Planos de ação para o padrão de controle da plataforma.
- Corrige borda do item ativo do histórico para não ficar branca/forte.
- Corrige modal de visualização de Análise ICP/GDV/Rotas para não ficar transparente.
- Adiciona `key` por `clientId:type` na raiz da aba para evitar piscada de conteúdo antigo ao trocar de aba.

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não altera regra de salvamento.
- Não altera anexos.
- Não altera exclusão.
