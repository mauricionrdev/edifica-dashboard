# Release checklist v99 — Edifica Central

## Antes de publicar

```bash
npm run release:check
```

Esse comando executa:

```bash
npm run audit:css:strict
npm run verify:prod
npm run build
```

## Pontos críticos validados

- Preencher Semana sem `localStorage`.
- Preencher Semana sem polling/presença.
- Campanhas extras usam API e backend.
- Campos apagados enviam `null` e limpam o JSON salvo.
- Migration `015_metric_campaigns.sql` existe.
- Modais e drawers usam blur global.
- Sidebar não fica acima de modais.
- `focus-ring` visual não volta.
- Backend principal de métricas passa em `node --check`.

## Teste manual rápido

1. Abrir Preencher Semana.
2. Criar campanha extra.
3. Preencher campos.
4. Apagar um campo e salvar vazio.
5. Recarregar a tela.
6. Confirmar que o campo apagado não volta.
7. Abrir modal/drawer em Perfil, Clientes, Projetos e Preencher Semana.
8. Confirmar que o fundo fica desfocado e a sidebar não fica acima.
