# Changelog — Navegação Interna V2

Data: 2026-07-01

## Objetivo

Facilitar a validação das rotas V2 sem expor itens na sidebar e sem promover telas oficiais.

## Alterações

- Adicionado componente `src/pages/v2/V2RouteNav.jsx`.
- Adicionada navegação horizontal interna entre rotas V2.
- Adicionados links rápidos para validação e promoção.
- Adicionado link para a rota oficial de produção quando existir.
- Registradas as rotas `/v2/visao-geral`, `/v2/plano-migracao` e `/v2/promocao` no registry V2.
- Aplicada a navegação nas páginas V2 existentes.

## Segurança

- Não altera rotas oficiais.
- Não altera sidebar.
- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não executa POST, PUT, PATCH ou DELETE.
- Não mexe no Preencher Semana produtivo.

## Validação executada

```bash
npm run build
npm run verify:v2
npm run verify:prod
npm run audit:css
```

Resultado: aprovado.
