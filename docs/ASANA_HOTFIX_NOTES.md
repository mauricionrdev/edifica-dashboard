# Hotfix Asana / Clientes

## Corrigido nesta etapa

1. `src/api/projects.js`
   - Troca `api.delete(...)` por `api.del(...)`.
   - Isso corrige o erro `ve.delete is not a function`.
   - Impacta exclusão de tarefas, seções, membros e colaboradores.

2. `src/components/clients/ClientDetailDrawer.module.css`
   - Volta Detalhes do Cliente para drawer lateral aprovado.
   - Remove aparência de modal central.
   - Mantém modal interno apenas para escolha de criação de projeto.

## Pontos que ainda exigem próxima passada

1. Substituir confirmações nativas `window.confirm` na tela Projetos por modal interno.
2. Revisar a fixação do responsável/proprietário do projeto.
3. Revisar fluxo de prazo/data dentro do drawer de tarefa.
4. Refinar visual da tela Projetos inteira.

A primeira quebra crítica era o `api.delete`, que bloqueava exclusões.
