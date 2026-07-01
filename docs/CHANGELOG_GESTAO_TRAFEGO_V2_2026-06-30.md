# Changelog — Gestão de Tráfego V2 em rota paralela

**Data:** 2026-06-30  
**Tipo:** evolução segura sem substituição de rota produtiva.

## Arquivos alterados

- `src/App.jsx`
- `src/utils/routeMeta.js`
- `src/pages/v2/TrafficV2Page.jsx`
- `src/pages/v2/TrafficV2Page.module.css`

## Nova rota

```txt
/v2/gestao-trafego
```

## Permissão

```txt
metrics.view
```

## Comportamento

A nova tela é somente leitura e usa apenas:

```txt
GET /api/metrics/traffic-management
```

Ela não salva meta de ranking, não cria lançamento, não altera banco, não cria endpoint e não substitui a rota atual:

```txt
/gestao-trafego
```

## Objetivo

Validar uma leitura mais limpa da operação de tráfego antes de qualquer migração da tela produtiva. A tela mantém o princípio de segurança para produção:

```txt
produção atual continua funcionando
+
rota V2 oculta para validação
+
sem escrita no banco
+
sem troca de rota oficial
```

## Validação obrigatória antes de qualquer troca futura

- Comparar gestor selecionado na V2 e na tela atual.
- Comparar carteira por período.
- Comparar clientes críticos.
- Comparar ranking dos gestores.
- Confirmar que os dados vêm dos preenchimentos semanais existentes.
- Confirmar que nenhuma ação de escrita foi adicionada.
