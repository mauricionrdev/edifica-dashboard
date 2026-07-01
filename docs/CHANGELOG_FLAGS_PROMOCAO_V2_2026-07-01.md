# Changelog — Flags de Promoção V2

**Data:** 2026-07-01  
**Tipo:** infraestrutura segura de rollout frontend  
**Escopo:** rotas V2 já existentes, sem substituir produção por padrão

## Objetivo

Preparar a troca controlada de algumas rotas oficiais para suas versões V2 sem big bang e com fallback legado disponível.

## Comportamento padrão

Todas as flags nascem desligadas. Sem variável `true`, a produção continua usando as telas atuais.

## Flags disponíveis

```env
VITE_PROMOTE_CLIENTES_V2=false
VITE_PROMOTE_GESTAO_TRAFEGO_V2=false
VITE_PROMOTE_MODELO_OFICIAL_V2=false
VITE_PROMOTE_PERFIL_V2=false
VITE_PROMOTE_EQUIPE_V2=false
VITE_PROMOTE_PROJETOS_V2=false
```

Para ativar uma promoção, a variável precisa estar exatamente como `true` no momento do build.

## Fallbacks criados

```txt
/legacy/clientes
/legacy/projetos
/legacy/perfil
/legacy/gestao-trafego
/legacy/equipe
/legacy/modelo-oficial
```

Essas rotas ficam protegidas pelas mesmas permissões das rotas oficiais e servem para rollback operacional caso uma flag seja ativada.

## Rotas críticas ainda bloqueadas

Não foram criadas flags para:

```txt
Dashboard
Retenção
Rankings
GDVs
Preencher Semana
Squads
Workspace
Suporte TI
```

Essas rotas continuam apenas em `/v2/*` até existir comparação numérica/operacional suficiente.

## Segurança

- Nenhuma flag é ativada neste patch.
- Nenhuma tela oficial muda de comportamento sem alteração explícita de variável e rebuild.
- Nenhum endpoint foi alterado.
- Nenhuma migration foi criada ou executada.
- Nenhuma rota produtiva foi removida.
- Rotas legacy foram adicionadas para fallback.

## Checklist antes de ativar qualquer flag

1. Validar rota V2 manualmente.
2. Conferir permissão da rota.
3. Conferir dados reais.
4. Conferir que a V2 não remove ação operacional necessária.
5. Fazer backup do build atual.
6. Ativar apenas uma flag por deploy.
7. Fazer rebuild do frontend.
8. Testar rota oficial e fallback `/legacy/*`.
9. Monitorar produção.
10. Desligar flag e rebuildar se houver regressão.
