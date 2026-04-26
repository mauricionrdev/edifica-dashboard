# Passo a passo — atualização do banco de dados

Este guia serve para atualizar um banco que ainda esteja no estado do **primeiro ZIP** para a estrutura usada no pacote atual da plataforma.

## O que muda no banco

A atualização adiciona:

- novos campos em `users`:
  - `phone`
  - `avatar_color`
  - `permissions_override`
- ampliação do `role` para suportar:
  - `ceo`
  - `suporte_tecnologia`
- nova tabela `access_requests`
- nova tabela `audit_logs`
- normalização do JSON de `onboardings.sections` para suportar melhor tarefas atribuídas, prioridade, status e conclusão.

## Antes de começar

### 1. Faça backup do banco atual

Exemplo:

```bash
mysqldump -u SEU_USUARIO -p SEU_BANCO > backup_edifica_antes_upgrade.sql
```

### 2. Teste primeiro em homologação

Fluxo recomendado:

1. restaurar o backup em um banco de teste;
2. apontar o backend novo para esse banco;
3. aplicar a migration;
4. rodar a normalização do onboarding;
5. validar login, usuários, equipes, solicitações, auditoria, onboarding e minhas tarefas.

## Execução recomendada

### Etapa 1 — configurar o `.env`

Dentro de `edifica-api`, confirme estas variáveis:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASS` ou `DB_PASSWORD`

### Etapa 2 — aplicar migrations

Entre na pasta do backend e rode:

```bash
npm install
npm run migrate
```

Isso vai executar:

- `001_init.sql`
- `002_upgrade_from_primeiro_zip.sql`

## Etapa 3 — normalizar os onboardings antigos

Depois da migration, rode:

```bash
npm run normalize:onboarding
```

Esse script percorre `onboardings.sections` e adiciona defaults compatíveis com a versão atual, principalmente:

- `assignee`
- `assigneeId`
- `priority`
- `status`
- `completedAt`
- `completedBy`

## Etapa 4 — validar usuários críticos

Depois da atualização, revise:

- se existe pelo menos um usuário ativo com acesso administrativo;
- quais usuários devem virar `ceo`;
- quais usuários devem virar `suporte_tecnologia`;
- se `permissions_override` está vazio ou configurado corretamente;
- se os `squads` continuam corretos.

## Etapa 5 — subir backend e validar a operação

Faça um smoke test mínimo:

- login
- perfil
- equipe & acessos
- cargos & permissões
- solicitações
- auditoria
- clientes
- onboarding
- minhas tarefas

## Ordem ideal em produção

1. backup completo;
2. homologação;
3. migration SQL;
4. normalização dos onboardings;
5. revisão de usuários/cargos;
6. subir backend novo;
7. validar frontend;
8. liberar operação.

## Rollback

Se algo sair errado:

1. parar o backend novo;
2. restaurar o backup do banco;
3. voltar a versão anterior do backend.

## Observação sobre o cargo “Gestor de Tráfego”

No banco, o valor persistido continua `gestor` para manter compatibilidade.
Na interface, esse cargo pode ser exibido como **Gestor de Tráfego**.


## Importação rápida de base nova completa

Se a ideia for subir uma base nova do zero já no estado atual do projeto, use o arquivo:

- `edifica-api/migrations/003_full_schema_fase21.sql`

Ele cria toda a estrutura atual da plataforma em um único import.
Depois disso, rode o seed para criar o admin master, squads padrão e template inicial.
