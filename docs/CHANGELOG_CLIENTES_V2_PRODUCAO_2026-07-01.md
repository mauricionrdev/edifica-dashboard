# CHANGELOG — Clientes V2 com linguagem de produção

Data: 2026-07-01

## Objetivo

Ajustar `/v2/clientes` para deixar de parecer uma tela técnica de validação e passar a se comportar visualmente como uma tela operacional pronta para produção.

## Arquivos alterados

- `src/pages/v2/ClientsV2Page.jsx`
- `src/pages/v2/ClientsV2Page.module.css`

## Alterações

- Removeu navegação técnica V2 do topo da tela de Clientes.
- Removeu linguagem visível de validação, promoção, rota paralela e comparação com produção.
- Removeu checklist técnico do final da página.
- Ajustou o header para linguagem operacional: `Clientes` e `Carteira de clientes`.
- Substituiu a aba `Validação` por `Observações`.
- Manteve dados operacionais do detalhe do cliente: resumo, operação, financeiro, retenção e observações.
- Removeu badge visual de somente leitura da área principal.
- Preservou o comportamento seguro: sem alterar backend, banco, endpoints ou rota oficial.

## Segurança

- Não substitui `/clientes`.
- Não altera `/legacy/clientes`.
- Não cria variável de ambiente.
- Não adiciona escrita no banco.
- Não executa POST, PUT, PATCH ou DELETE.
- Não altera Preencher Semana.

## Validação executada

```bash
npm run build
npm run verify:v2
npm run verify:prod
npm run audit:css
```

Resultado: aprovado, sem aumento de dívida CSS.
