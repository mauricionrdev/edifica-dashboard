# Changelog — Planos de ação na Análise ICP

Data: 2026-07-07

## Objetivo

Adicionar um fluxo visual para Planos de ação dentro da Análise ICP, com objetivo, ações marcáveis, prazo, histórico e anexos de imagem/PDF.

## Arquivos alterados

- `src/components/clients/AnalysisTab.jsx`
- `src/components/clients/AnalysisTab.module.css`

## Comportamento entregue

- Novo botão `Planos de ação` exibido somente na Análise ICP.
- Modal próprio com:
  - objetivo;
  - data do plano;
  - prazo;
  - ações com checkbox;
  - histórico de planos;
  - anexos de imagem;
  - anexos de PDF;
  - visualização e remoção de evidências.
- Os planos são persistidos como registros da própria Análise ICP, usando os endpoints já existentes de análises e anexos.
- Não houve criação de endpoint, migration, variável de ambiente ou alteração de schema.

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria migration.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não altera as outras análises.
- Usa permissões existentes de `clients.edit` via endpoints atuais.
