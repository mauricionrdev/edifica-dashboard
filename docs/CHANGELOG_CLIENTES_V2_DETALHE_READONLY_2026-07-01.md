# CHANGELOG — Clientes V2 com detalhe somente leitura

**Data:** 2026-07-01  
**Tipo:** evolução V2 em rota paralela  
**Rota afetada:** `/v2/clientes`

## Objetivo

Evoluir a tela `Clientes V2` sem substituir a rota produtiva `/clientes`, adicionando uma visão lateral de detalhes para facilitar validação operacional antes de qualquer promoção futura.

## Arquivos alterados

```txt
src/pages/v2/ClientsV2Page.jsx
src/pages/v2/ClientsV2Page.module.css
```

## O que mudou

- A tabela de clientes V2 agora permite selecionar um cliente.
- Ao selecionar, a tela exibe um painel lateral somente leitura.
- O painel mostra:
  - identificação do cliente;
  - status;
  - squad;
  - GDV;
  - gestor de tráfego;
  - MRR/mensalidade;
  - meta lucro;
  - se conta ou não como receita;
  - entrada;
  - saída/churn;
  - mês de churn;
  - campos de apoio como ICP, rota e observação quando existirem.

## Segurança

- Não altera `/clientes`.
- Não cria endpoint.
- Não altera backend.
- Não altera banco.
- Não cria variável de ambiente.
- Não executa POST, PUT, PATCH ou DELETE.
- Não adiciona item na sidebar.
- Continua usando dados já carregados pelo shell atual.

## Validação executada

```bash
npm run build
npm run verify:prod
npm run verify:v2
npm run audit:css
```

Resultado: aprovado.
