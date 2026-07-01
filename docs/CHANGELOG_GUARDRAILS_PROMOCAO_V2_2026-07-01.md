# Changelog — Guard rails de promoção V2

Data: 2026-07-01
Base: edi-central(44).zip
Tipo: frontend seguro / validação local

## Objetivo

Adicionar travas de segurança para a promoção controlada das telas V2 sem substituir rotas críticas, sem alterar backend e sem mexer em banco.

## Arquivos alterados

- `package.json`
- `scripts/verify-v2-promotion.mjs`
- `src/pages/v2/PromotionV2Page.jsx`
- `src/pages/v2/V2OverviewPage.jsx`
- `src/pages/v2/V2Operations.module.css`

## O que mudou

### 1. Novo comando de verificação

Criado o script:

```bash
npm run verify:v2
```

Ele valida:

- flags permitidas de promoção V2;
- ausência de flags para rotas críticas;
- `.env.example` e `.env.production.example` com flags desligadas por padrão;
- existência de fallback `/legacy/*` para rotas promovíveis;
- uso de `isV2RoutePromoted()` nas rotas oficiais permitidas;
- presença das rotas internas `/v2/promocao` e `/v2/validacao`.

### 2. Tela `/v2/promocao` reforçada

A tela agora mostra:

- quantidade de flags ativas no build atual;
- lista das variáveis ativas;
- bloco de rollback;
- sequência mínima de deploy seguro;
- aviso visual quando alguma rota V2 estiver promovida.

### 3. Hub `/v2/visao-geral` reforçado

O hub agora mostra:

- quantidade de flags ativas;
- atalhos diretos para `/v2/validacao` e `/v2/promocao`.

## Segurança

- Nenhuma flag foi ativada.
- Nenhuma rota oficial foi substituída.
- Nenhum endpoint foi alterado.
- Nenhuma migration foi criada.
- Nenhuma escrita em banco foi adicionada.
- Rotas críticas continuam sem flag de promoção.

## Fluxo recomendado antes de subir frontend

```bash
git status
npm run verify:v2
npm run build
npm run verify:prod
```

Depois subir somente `dist/` no frontend da Hostinger.

## Rollback

Se alguma V2 promovida apresentar problema:

1. voltar a flag correspondente para `false`;
2. rodar novo build;
3. subir `dist/` novamente;
4. validar a rota oficial e a rota `/legacy/*` correspondente.
