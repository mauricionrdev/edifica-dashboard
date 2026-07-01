# Hotfix — Preencher Semana 500 na virada do mês

Data: 2026-07-01

## Problema

Ao abrir `/preencher-semana` em produção, a tela disparava várias requisições para `/api/metrics/:clientId/:periodKey`. Na virada para um novo mês, a tela tentava herdar campos fixos da semana 4 do mês anterior e persistir automaticamente esses dados nas semanas do mês atual.

Quando alguma dessas gravações automáticas falhava no backend, o fluxo de carregamento tratava a falha como erro de leitura e exibia múltiplos toasts `Erro ao carregar ...`.

## Correção

- A tela continua herdando campos fixos do mês anterior apenas na interface.
- A gravação automática durante o carregamento foi removida.
- A persistência passa a acontecer somente por ação explícita do usuário.
- O backend passou a não derrubar o salvamento semanal caso um schema antigo não aceite `goal_status = ''`.

## Arquivos alterados

- `src/pages/PreencherSemanaPage.jsx`
- `src/pages/design-lab/DesignLabPreencherSemanaPage.jsx`
- `edifica-api/src/routes/metrics.js`

## Segurança

- Nenhuma migration foi criada.
- Nenhum endpoint foi removido.
- Nenhuma rota produtiva foi substituída.
- Nenhuma regra de cálculo foi alterada.
- A correção reduz escrita automática em produção.
