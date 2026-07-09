# Changelog — Reescrita visual dos Planos de Ação da Análise ICP

Data: 2026-07-08

## Contexto

A área de Planos de ação da Análise ICP estava visualmente inconsistente por acúmulo de CSS e mistura de estilos. O topo das abas de análise também repetia o nome da aba dentro do conteúdo, gerando redundância visual.

## Arquivos alterados

- `src/components/clients/AnalysisTab.jsx`
- `src/components/clients/AnalysisTab.module.css`

## Ajustes aplicados

- Reescrito o CSS do componente de análises para remover camadas antigas misturadas.
- Organizado o topo das três abas de análise sem repetir o nome da aba dentro do conteúdo.
- Mantidos os botões operacionais do topo: Planos de ação, Novo registro e indicadores.
- Reestruturado o modal de Planos de ação com layout mais estável: histórico, dados do plano, ações e evidências.
- Reduzido o excesso de espaços vazios e cards sobrepostos.
- Mantidas as funções existentes: criar plano, editar objetivo, editar prazo, marcar ações, adicionar/remover ações, anexar imagem/PDF, visualizar/remover evidências.
- Mantido padrão sem focus visual chamativo.

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não altera Análise GDV nem Resumo de Rotas em regra de negócio.
- Não altera estrutura dos anexos.
