# Changelog — Rotas administrativas e workspace V2

Data: 2026-06-30

## Objetivo

Avançar a reconstrução paralela da Edifica Central sem substituir rotas produtivas e sem criar escrita no banco.

## Rotas criadas

- `/v2/visao-geral`
- `/v2/projetos`
- `/v2/perfil`
- `/v2/workspace`
- `/v2/suporte-tecnologia`

## Segurança operacional

- Rotas ocultas da sidebar.
- Rotas protegidas por permissões existentes.
- Carregamento via `React.lazy`.
- Sem migration.
- Sem novo endpoint.
- Sem alteração de rotas oficiais.
- Telas V2 em modo leitura, usando apenas endpoints GET.

## Observação

A rota `/v2` agora direciona para `/v2/visao-geral`, um hub interno para facilitar validação das telas paralelas. A rota antiga `/v2/plano-migracao` permanece disponível.
