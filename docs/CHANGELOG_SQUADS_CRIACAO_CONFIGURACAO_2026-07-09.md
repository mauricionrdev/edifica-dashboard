# Changelog — Criação e configuração de Squads

## Objetivo
Adicionar fluxo completo para criar e configurar novos Squads na aba **Equipe > Squads**, mantendo produção segura e preservando histórico operacional.

## Arquivos alterados

- `src/pages/TeamAccessPage.jsx`
- `src/pages/TeamAccessPage.module.css`
- `edifica-api/src/routes/squads.js`
- `edifica-api/src/routes/metrics.js`

## Funcionalidades adicionadas

- Botão **+ Criar Squad** na aba Squads.
- Modal de criação/edição com:
  - nome do Squad;
  - responsável/líder;
  - logotipo;
  - status da equipe: Ativa/Inativa;
  - configuração **Exibir no ranking**: Sim/Não;
  - link personalizado.
- A edição do Squad permite alterar os mesmos campos posteriormente.
- Squads inativos preservam histórico e clientes vinculados.
- O fluxo de criação atualiza a lista de Squads e a lista de clientes após salvar.

## Regras aplicadas

- Squad criado fica disponível no cadastro/detalhe do cliente porque passa a entrar em `GET /api/squads`.
- Transferência de cliente continua usando o campo de Squad já existente no cadastro/detalhe do cliente.
- Indicadores de equipes são recalculados automaticamente a partir dos clientes vinculados ao Squad.
- Ranking de Squads passa a considerar somente Squads com `show_in_ranking = 1`.
- Squads com **Exibir no ranking = Não** continuam disponíveis para receber clientes, mas não aparecem nem interferem no ranking.
- Desativar Squad não remove histórico nem dados de clientes.

## Banco de dados

O backend adiciona a coluna abaixo de forma segura caso ela ainda não exista:

```sql
show_in_ranking TINYINT(1) NOT NULL DEFAULT 1
```

Não foi criada migration separada para evitar execução manual em produção. A criação é feita pelos endpoints protegidos de Squads/Ranking, no mesmo padrão já usado pelo projeto para evolução do schema de Squads.

## Validação

- `npm run build`
- `npm run verify:prod`
- `npm run audit:css`
- `node --check edifica-api/src/routes/squads.js`
- `node --check edifica-api/src/routes/metrics.js`
- `node --check edifica-api/server.js`
