# Decisão oficial — limpeza do Onboarding legado

## Regra nova

- Onboarding antigo não faz mais parte da operação.
- Cliente não cria projeto automaticamente.
- Cliente não cria onboarding automaticamente.
- Projetos antigos criados automaticamente a partir do onboarding não devem ser usados como base.
- Projeto novo deve nascer por ação manual do usuário, dentro dos detalhes do cliente ou na tela Projetos.
- Modelo Oficial passa a ser template editável para criação manual de projetos, não onboarding automático.

## Fluxo atual deste pacote

### Detalhes do cliente

Botão: Criar projeto

Opções temporárias:

- OK: criar a partir do Modelo Oficial.
- Cancelar: criar projeto do zero.

A próxima passada visual deve trocar esse confirm nativo por um modal/drawer próprio dentro do design system.

## Importante

A tabela `onboarding_template` ainda é mantida nesta etapa porque atualmente armazena o Modelo Oficial. A limpeza definitiva dela deve acontecer somente depois de migrarmos o Modelo Oficial para uma tabela própria de template de projeto.
