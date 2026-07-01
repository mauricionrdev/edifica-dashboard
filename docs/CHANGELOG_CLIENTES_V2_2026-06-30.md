# Changelog — Clientes V2 em rota paralela

**Data:** 2026-06-30  
**Tipo:** evolução segura em produção  
**Rota criada:** `/v2/clientes`

## Objetivo

Criar a primeira tela V2 real em paralelo, sem substituir `/clientes`, sem mexer em banco, sem criar endpoints e sem remover legado.

## Arquivos alterados

```txt
src/App.jsx
src/utils/routeMeta.js
src/pages/v2/ClientsV2Page.jsx
src/pages/v2/ClientsV2Page.module.css
docs/CHANGELOG_CLIENTES_V2_2026-06-30.md
```

## Comportamento

- `/v2/clientes` nasce oculta da sidebar.
- A rota usa permissão `clients.view`.
- A tela é somente leitura.
- A tela usa os dados reais já carregados pelo `AppShell`.
- Nenhuma rota produtiva foi substituída.
- Nenhuma migration foi criada ou executada.
- Nenhum endpoint foi alterado.

## Validação esperada

1. Acessar `/v2/clientes` com usuário autorizado.
2. Conferir se a lista carrega com dados reais.
3. Comparar totais com `/clientes`.
4. Conferir status `Finalizado` separado de `Churn`.
5. Conferir se `/clientes` atual permanece funcionando igual.

## Observação

Esta tela ainda não é a substituta oficial de `/clientes`. Ela serve como base de validação da V2 antes de qualquer troca produtiva.
