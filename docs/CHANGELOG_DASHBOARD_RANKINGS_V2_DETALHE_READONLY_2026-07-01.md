# Changelog — Dashboard e Rankings V2 com detalhe readonly

Data: 2026-07-01
Base: edi-central(44)
Tipo: evolução segura em rotas paralelas V2

## Objetivo

Evoluir as rotas V2 operacionais sem substituir produção, mantendo apenas leituras GET e deixando mais claro o diagnóstico para futura promoção controlada.

## Arquivos alterados

- `src/pages/v2/DashboardV2Page.jsx`
- `src/pages/v2/RankingsV2Page.jsx`
- `src/pages/v2/V2Operations.module.css`

## Alterações

### Dashboard V2

- Adicionada seção de saúde dos dados com os endpoints usados pela tela.
- Adicionada prévia readonly de clientes de atenção retornados pelo summary.
- Mantida separação entre leitura executiva e regras de escrita.
- Nenhum cálculo oficial novo foi criado; a tela continua usando os endpoints existentes.

### Rankings V2

- Listas de Squads e GDVs agora permitem seleção de linha.
- Adicionado painel de detalhe readonly para o item selecionado.
- Adicionada verificação visual caso o endpoint de campeões retorne a competência em aberto.
- Mantida separação entre ranking ao vivo e campeão oficial gravado no banco.

## Segurança

- Não altera rotas oficiais.
- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não executa POST, PUT, PATCH ou DELETE.
- Não mexe em Preencher Semana.
- Continua em rotas paralelas V2.

## Validação

Comandos executados:

```bash
npm run build
npm run verify:v2
npm run verify:prod
npm run audit:css
```

Resultado:

- build aprovado;
- verify:v2 aprovado;
- verify:prod aprovado;
- audit:css sem aumento de raw colors, !important ou radius acima de 10px.
