# CSS audit e pre-commit anti-regressão

Este projeto usa um audit local para evitar regressão visual estrutural no CSS.

## Comandos

```bash
npm run audit:css
npm run audit:css:strict
npm run hooks:install
npm run precommit:check
```

## Como funciona

O arquivo `scripts/css-audit-baseline.json` guarda o limite atual validado para:

- cores cruas;
- `!important`;
- tokens locais;
- `border-radius` acima de `10px`.

O modo strict falha quando algum número ultrapassa o baseline. Isso impede que uma tela já refinada volte a receber CSS fora do padrão.

## Instalação do hook

Execute uma vez no repositório:

```bash
npm run hooks:install
```

Depois disso, todo commit roda:

```bash
npm run audit:css:strict
```

## Atualização consciente do baseline

Só atualize `scripts/css-audit-baseline.json` depois de validação visual. A ideia é reduzir os números aos poucos, nunca aumentar sem motivo.
