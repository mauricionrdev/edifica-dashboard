# Frontend `/new`

Esta pasta é a fronteira da reconstrução do frontend da Edifica Central.

## Regras

- O frontend atual de produção não é importado por esta camada.
- Componentes visuais e CSS antigos não entram em `/new`.
- É permitido reutilizar apenas autenticação, autorização, clientes de API e
  utilitários de domínio já validados.
- Cada nova tela entra com rota, permissão, estados de carregamento/erro/vazio,
  responsividade e validação de build.
- Rotas antigas só poderão ser removidas após promoção e rollback documentados.

## Rotas ativas

- `/new` — Dashboard executivo.
- `/new/clientes` — Carteira de clientes.

Novas rotas não devem ser criadas como placeholders.
