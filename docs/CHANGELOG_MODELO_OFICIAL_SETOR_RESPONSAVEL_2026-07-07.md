# Changelog — Modelo Oficial com setor responsável

## Objetivo

Ajustar o Modelo Oficial de tarefas para que cada tarefa guarde o **setor responsável**, e não uma pessoa fixa.

## Alterações

- Campo da tela `Modelo Oficial` alterado de `Responsável` para `Setor responsável`.
- Opções disponíveis:
  - CAP
  - Gestor de Tráfego
  - Comercial
  - Técnico
  - Designer
  - CS
  - Financeiro
- O modelo continua salvo no JSON atual da tabela `onboarding_template`, sem migration nova.
- Ao criar projeto a partir do modelo, o backend tenta resolver automaticamente a pessoa correta conforme o setor:
  - `CAP`: proprietário do Squad do cliente;
  - `Gestor de Tráfego`: usuário com o nome salvo em `clients.gestor`;
  - `Comercial`: comercial interno do cliente; se não houver, tenta o GDV do cliente;
  - `Técnico`, `Designer`, `CS` e `Financeiro`: busca usuário ativo por role/secondary_roles compatível.
- Se o setor não resolver um usuário, a tarefa fica sem responsável em vez de quebrar a criação do projeto.
- O fallback legado por `assigneeId`/`assignee` foi mantido para não quebrar modelos antigos.

## Segurança

- Não cria migration.
- Não altera schema.
- Não altera rota produtiva.
- Não remove dados existentes do modelo.
- Não altera projetos já criados.
- A nova regra só afeta novos projetos criados a partir do Modelo Oficial após salvar setores nas tarefas.
