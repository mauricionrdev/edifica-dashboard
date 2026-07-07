# Hotfix — Projeto dentro do modal de detalhes do cliente

Data: 2026-07-07

## Problema

A aba Projeto dentro do modal de detalhes do cliente estava com quebras visuais:

- conteúdo não ocupava corretamente a largura disponível do workspace interno;
- blocos ficavam apertados e desalinhados;
- o cabeçalho do projeto não distribuía corretamente título, métricas e ação destrutiva;
- formulários de membros/seções/tarefas ficavam presos em grids rígidos;
- dropdowns de responsável e membros eram cortados dentro da seção por causa de `overflow` dos containers;
- campos ainda podiam exibir focus visual fora do padrão da plataforma.

## Correção

- A aba Projeto passou a ter um host próprio dentro do modal (`projectHost`), removendo o limite genérico de largura aplicado aos outros painéis embutidos.
- O `ProjectWorkspace` ganhou override final de layout para ocupar 100% do espaço disponível do modal.
- O cabeçalho do projeto foi ajustado para três áreas reais: título, métricas e ação de exclusão.
- Painéis de membros, ferramentas e lista de tarefas foram liberados de `overflow` onde o dropdown precisa sair do container.
- A lista de tarefas mantém clipping apenas onde é necessário para preservar bordas arredondadas.
- O Select global ganhou suporte opcional a portal/fixed position, usado apenas no ProjectWorkspace, para que menus de seleção não fiquem presos dentro das seções.
- Focus ring visual foi neutralizado dentro da aba Projeto, mantendo a regra visual da plataforma.

## Segurança

- Não altera backend.
- Não altera banco.
- Não cria endpoint.
- Não cria variável de ambiente.
- Não altera regra de negócio.
- Não altera projetos, tarefas ou responsáveis existentes.
- Correção limitada à apresentação e comportamento visual dos selects no frontend.

## Arquivos alterados

- `src/pages/design-lab/DesignLabClientDetailModal.jsx`
- `src/pages/design-lab/DesignLabClientDetailModal.module.css`
- `src/components/clients/ProjectWorkspace.jsx`
- `src/components/clients/ProjectWorkspace.module.css`
- `src/components/ui/Select.jsx`
- `src/components/ui/Select.module.css`
