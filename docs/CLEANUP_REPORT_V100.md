# Limpeza estrutural — edi-central(4)

## Arquivos removidos

- `src/components/clients/AvatarTab.jsx`
- `src/components/clients/AvatarTab.module.css`
- `src/components/clients/ContractTab.jsx`
- `src/components/clients/ContractTab.module.css`
- `src/hooks/useContractsHistory.js`
- `src/styles/base.css`

## Critério usado

Removidos apenas arquivos sem rota de importação a partir de `src/main.jsx` e sem uso ativo no build atual.

## Arquivos mantidos por segurança

- `docs/**`: documentação e checklists.
- `scripts/**`: scripts de auditoria/verificação.
- `.githooks/**`: hook de pre-commit.
- `edifica-api/scripts/**`: scripts operacionais de backend.
- `public/**`: assets públicos usados em runtime.
- migrations antigas: histórico necessário para ambientes que ainda não rodaram tudo.

## Validações executadas

```bash
npm run release:check
node --check edifica-api/src/routes/metrics.js
```

Status: aprovado.
