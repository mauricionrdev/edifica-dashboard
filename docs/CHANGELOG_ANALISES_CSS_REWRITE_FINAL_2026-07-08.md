# CHANGELOG — Correção real do CSS das análises

Data: 2026-07-08

## Escopo

Correção visual da área de análises do modal de detalhes do cliente.

## Arquivo alterado

- `src/components/clients/AnalysisTab.module.css`

## Motivo

Os patches anteriores acumularam blocos duplicados e conflitantes no CSS de `AnalysisTab`, fazendo com que correções pontuais não tivessem efeito previsível. O arquivo tinha múltiplas definições para as mesmas classes, o que mantinha:

- header de abas com background escuro/quadrado solto;
- preview de plano com aparência arredondada incorreta;
- botões do modal com estilos concorrentes;
- modal normal de análise com aparência transparente;
- campos e cards com excesso de raio/borda;
- estilos duplicados sobrescrevendo o ajuste esperado.

## Correção

O CSS do componente foi reescrito de forma limpa, mantendo os nomes de classe e a lógica do componente.

Ajustes principais:

- removidos blocos duplicados e conflitantes;
- header das abas sem background solto;
- métricas do topo sem bloco quadrado atrás;
- preview do plano de ação com borda reta e sem pílula arredondada;
- modal de planos de ação com superfície opaca e consistente;
- histórico sem borda branca forte;
- botões do modal unificados no padrão dark da plataforma;
- modal normal de Análise ICP/GDV/Rotas com superfície opaca;
- estados vazios preservados;
- foco visual removido dos inputs/botões internos;
- sem alteração de regra de negócio.

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não altera funções de criar, editar, anexar, visualizar ou remover.
- Não altera payloads.
