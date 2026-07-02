# Changelog — Clientes V2 completo

**Data:** 2026-07-01  
**Tipo:** evolução segura em rota paralela  
**Rota impactada:** `/v2/clientes`

## Objetivo

Transformar a tela `Clientes V2` em uma tela operacional completa para validação visual e funcional antes de qualquer promoção para `/clientes`.

## Arquivos alterados

```txt
src/pages/v2/ClientsV2Page.jsx
src/pages/v2/ClientsV2Page.module.css
docs/CHANGELOG_CLIENTES_V2_COMPLETO_2026-07-01.md
```

## O que foi entregue

- Header final dentro do workspace V2.
- Cards de resumo da carteira.
- Escopos rápidos:
  - Carteira completa;
  - Conta receita;
  - Atenção;
  - TCV;
  - Comercial interno;
  - Encerrados.
- Busca por cliente, squad, GDV, gestor, ICP e rota.
- Filtros por:
  - status;
  - squad;
  - GDV;
  - gestor;
  - ordenação.
- Paginação de clientes.
- Tabela operacional refinada.
- Separação explícita entre `Churn` e `Finalizado`.
- Detalhe lateral do cliente com abas:
  - Resumo;
  - Operação;
  - Financeiro;
  - Retenção;
  - Validação.
- Link para comparar com `/clientes` atual.
- Link para `/v2/modelo-oficial` dentro do detalhe.
- Checklist de validação antes de promoção.

## Segurança

- Não substitui `/clientes`.
- Não altera `/legacy/clientes`.
- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não executa `POST`, `PUT`, `PATCH` ou `DELETE`.
- Não altera `Preencher Semana`.
- Continua fora da sidebar.

## Validações executadas

```bash
npm run build
npm run verify:v2
npm run verify:prod
npm run audit:css
```

Resultado:

```txt
build aprovado
verify:v2 aprovado
verify:prod aprovado
audit:css sem aumento de rawColors, !important ou radiusAbove10
```
