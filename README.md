# Edifica Dashboard

Painel interno da Edifica para operação comercial, carteira de clientes, onboarding, métricas semanais, gestão de GDVs, squads, perfis e controle de acessos.

O repositório reúne:
- frontend em `React + Vite`
- backend em `Express + MySQL`
- regras de permissão, autenticação, ownership operacional e persistência real em banco

## Estrutura

```text
src/                 frontend
public/              arquivos públicos do frontend
edifica-api/         backend Express + MySQL
docs/                documentação auxiliar
```

## Stack

- Frontend: React 18, React Router, Vite, CSS Modules
- Backend: Node.js, Express, MySQL, JWT
- Autenticação: sessão via backend
- Deploy atual: frontend versionado no GitHub, backend publicado separadamente na hospedagem

## Funcionalidades principais

- Dashboard central com indicadores operacionais
- Gestão de clientes com contrato, onboarding e análises
- Área de GDV com carteira e responsáveis reais
- Área de squads com ownership e visão de performance
- Perfil próprio e perfil de outros usuários
- Equipe & Acessos com usuários, permissões, auditoria e solicitações
- Modelo oficial de onboarding

## Regras importantes do projeto

- Nenhum dado operacional deve depender de `localStorage`
- Responsáveis e proprietários devem existir na base real de usuários
- O frontend não é fonte de verdade de permissões, ownership ou autenticação
- Toda persistência crítica deve passar pelo backend e pelo banco

## Backend e frontend

O projeto deve evoluir com backend e frontend alinhados.

Hoje, os pontos sensíveis que dependem de deploy coordenado são:

- autenticação
- permissões
- ownership de GDV e squad
- avatares e logos persistidos no banco

Sempre que houver alteração estrutural em autenticação ou contrato de API:
- publicar backend primeiro
- validar ambiente e sessão
- publicar frontend depois

## Autenticação

Fluxo atual esperado:

- login no backend
- backend define sessão/autenticação
- frontend valida sessão com `/api/auth/me`
- rotas protegidas dependem do backend, não de storage local

Se houver mudança de autenticação em produção, ela deve ser publicada junto com o backend.

## Rodando localmente

### Frontend

```bash
npm install
npm run dev
```

Configure `VITE_API_URL` apontando para a API.

### Backend

```bash
cd edifica-api
npm install
npm run dev
```

## Variáveis importantes

### Frontend

- `VITE_API_URL`

### Backend

- `PORT`
- `FRONTEND_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`

Se a autenticação estiver configurada com cookie seguro, também revisar:

- `AUTH_COOKIE_NAME`
- `AUTH_COOKIE_DOMAIN`
- `AUTH_COOKIE_SAME_SITE`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_MAX_AGE_MS`

## Banco de dados

As evoluções de schema ficam em:

```text
edifica-api/migrations/
```

Antes de qualquer publicação que altere estrutura:
- revisar migrations pendentes
- validar compatibilidade com produção
- só depois publicar backend

## Fluxo de publicação recomendado

1. Validar mudanças localmente
2. Subir backend primeiro quando houver mudança de autenticação, API ou banco
3. Validar backend em produção
4. Subir frontend
5. Fazer smoke test final

## Estado atual da base

O projeto já está preparado para trabalhar com:

- usuários reais
- permissões reais
- GDVs com proprietário real
- squads com proprietário real
- avatares e logos persistidos pela API

## Observação

Este repositório é a base ativa da ferramenta. Evite soluções provisórias no frontend para dados que pertencem ao backend.
