# Changelog — Preencher Semana: controle de erros em lote

**Data:** 2026-07-01  
**Tipo:** correção segura de produção  
**Escopo:** frontend

## Contexto

Na tela produtiva `/preencher-semana`, uma falha de API por cliente gerava um toast individual para cada card carregado. Em cenários de instabilidade do backend, virada de mês ou schema divergente, isso criava uma cascata de alertas visuais e dificultava a leitura da operação.

## Alteração

- A tela continua tentando carregar os dados cliente por cliente.
- Erros 401 continuam sem toast operacional.
- Para demais falhas de carregamento, a tela exibe apenas um aviso consolidado por período selecionado.
- O card que falhar permanece com dados vazios, sem travar a tela inteira.
- O comportamento foi aplicado tanto na tela produtiva quanto na variação `design-lab` ainda existente.

## Arquivos alterados

```txt
src/pages/PreencherSemanaPage.jsx
src/pages/design-lab/DesignLabPreencherSemanaPage.jsx
```

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não mexe em migration.
- Não altera regras de cálculo.
- Não adiciona variável de ambiente.
- Compatível com frontend e backend separados em produção.

## Validação

```bash
npm run build
npm run verify:prod
npm run verify:v2
```
