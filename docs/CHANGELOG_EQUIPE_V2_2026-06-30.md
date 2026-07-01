# Changelog — Equipe V2 em rota paralela

**Data:** 2026-06-30  
**Tipo:** evolução segura sem substituição de rota produtiva.

## Arquivos alterados

- `src/App.jsx`
- `src/utils/routeMeta.js`
- `src/pages/v2/TeamV2Page.jsx`
- `src/pages/v2/TeamV2Page.module.css`

## Nova rota

```txt
/v2/equipe
```

## Permissão

```txt
team.view
```

## Comportamento

A nova tela é uma visão interna, paralela e somente leitura da estrutura de equipe.

Ela permite validar:

- usuários carregados;
- usuários ativos e inativos;
- distribuição por funções;
- vínculos com squads;
- total de squads e GDVs disponíveis no shell;
- separação visual sem alterar a tela oficial `/equipe`.

## Garantias de segurança

- Não substitui `/equipe`.
- Não aparece na sidebar.
- Não cria endpoint.
- Não altera banco.
- Não cria usuário.
- Não edita permissões.
- Não remove legado.
- Usa `React.lazy` para manter carregamento separado.

## Observação

Esta etapa mantém a estratégia de produção segura: criar V2 em paralelo, validar com dados reais e só trocar a rota oficial após aprovação manual.
