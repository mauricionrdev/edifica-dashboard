# Changelog — Detalhes operacionais V2 readonly

Data: 2026-07-01

## Objetivo

Evoluir rotas V2 paralelas com detalhes operacionais somente leitura, mantendo a produção oficial intacta.

## Rotas impactadas

- `/v2/gestao-trafego`
- `/v2/retencao`
- `/v2/projetos`
- `/v2/equipe`

## Alterações

### Gestão de Tráfego V2

- Seleção de cliente na tabela de priorização.
- Painel lateral readonly com gestor, squad, investimento, CPL, leads, ICP e origem dos dados.
- Nenhum POST, PUT, PATCH ou DELETE.

### Retenção V2

- Seleção de squad na distribuição operacional.
- Painel readonly com carteira inicial, churn da carteira, churn precoce e LTV.
- Mantém a separação entre regra validada e implementação visual.

### Projetos V2

- Seleção de projeto na listagem.
- Painel readonly com cliente, status, tarefas, membros e prévia de tarefas quando o payload trouxer esses dados.
- Sem edição de quadro, tarefa ou membro.

### Equipe V2

- Seleção de usuário na listagem.
- Painel readonly com e-mail, status, funções, squads, perfil e flag master.
- Sem edição de usuário ou permissões.

## Segurança

- Não altera rotas oficiais.
- Não altera backend.
- Não altera banco de dados.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não mexe em Preencher Semana.
- Não depende de frontend e backend no mesmo deploy.
- Mantém todas as alterações dentro das rotas V2 paralelas.

## Validação recomendada

```bash
npm run verify:v2
npm run build
npm run verify:prod
npm run audit:css
```
