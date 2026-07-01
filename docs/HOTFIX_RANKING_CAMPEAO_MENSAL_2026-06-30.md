# Hotfix — Ranking: campeão mensal somente após fechamento do mês

**Data:** 2026-06-30  
**Área:** Ranking de Squads / histórico de campeões  
**Risco:** Produção — baixo, alteração restrita ao endpoint de campeões oficiais.

## Problema

O campeão do mês ainda em aberto podia aparecer no histórico oficial antes da meia-noite local do fechamento mensal.

Causa técnica: a trava de fechamento usava o mês corrente em UTC. Em hospedagem, quando o servidor já estava em UTC no dia 1º, mas o Brasil ainda estava no último dia do mês, o backend considerava o mês encerrado antes da hora.

## Correção aplicada

O cálculo do último mês fechado do ranking agora usa o fuso operacional da empresa:

```txt
America/Sao_Paulo
```

Comportamento após o hotfix:

```txt
Antes de 00:00 em America/Sao_Paulo no dia 1º:
  o mês atual ainda é considerado aberto;
  qualquer snapshot prematuro do mês atual é removido;
  o campeão do mês atual não aparece no histórico oficial.

Depois de 00:00 em America/Sao_Paulo no dia 1º:
  o mês anterior passa a ser considerado fechado;
  o snapshot oficial pode ser gravado no banco;
  o campeão aparece na Lista de Campeões.
```

## Arquivo alterado

```txt
edifica-api/src/routes/metrics.js
```

## Observação operacional

O endpoint `/api/metrics/ranking/champions` já executa uma limpeza defensiva:

```sql
DELETE FROM squad_ranking_champions WHERE period_month > ?
```

Após o hotfix, o parâmetro `?` passa a respeitar `America/Sao_Paulo`. Portanto, se um campeão do mês aberto já tiver sido gravado antes da hora, ele será removido automaticamente quando a tela de Ranking consultar o histórico de campeões.

## Validação recomendada

1. Acessar Ranking de Squads antes da meia-noite local do dia 1º.
2. Confirmar que a Lista de Campeões não mostra o mês ainda em aberto.
3. Após a meia-noite local do dia 1º, confirmar que o mês anterior aparece como campeão oficial.
4. Confirmar que o ranking em tela continua funcionando normalmente para acompanhamento do mês corrente.
