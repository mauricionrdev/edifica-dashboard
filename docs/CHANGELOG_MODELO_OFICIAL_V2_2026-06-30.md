# Changelog — Modelo Oficial V2

Data: 2026-06-30  
Tipo: rota paralela segura  
Impacto produtivo: baixo

## Arquivos alterados

- `src/App.jsx`
- `src/utils/routeMeta.js`
- `src/pages/v2/OfficialModelV2Page.jsx`
- `src/pages/v2/OfficialModelV2Page.module.css`

## O que foi criado

Nova rota interna:

```txt
/v2/modelo-oficial
```

## Regras de segurança

- Não substitui `/modelo-oficial`.
- Não aparece na sidebar.
- Usa a permissão já existente `project_template.view`.
- Não salva modelo.
- Não restaura modelo.
- Não altera banco.
- Não cria endpoint.
- Consulta somente `GET /api/template`.
- Carrega via `React.lazy`.

## Objetivo

Validar uma leitura limpa e segura do Modelo Oficial antes de qualquer decisão de substituição da tela atual.

## Validação esperada

1. Abrir `/v2/modelo-oficial` com usuário autorizado.
2. Confirmar que as seções e tarefas carregam do modelo atual.
3. Confirmar que a tela não tem ações de edição.
4. Confirmar que `/modelo-oficial` continua inalterada.
5. Confirmar build e `verify:prod` aprovados.
