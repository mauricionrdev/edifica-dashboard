# Plano de Migração Segura em Produção — Edifica Central

**Base:** `edi-central(44).zip`  
**Objetivo:** evoluir a plataforma sem interromper a operação em hospedagem.

---

## 1. Estratégia

A evolução deve ser paralela, gradual e reversível.

```txt
produção atual ativa
+
rotas V2 internas
+
validação com dados reais
+
troca por rota
+
fallback legado
```

Não fazer reescrita substitutiva direta.

---

## 2. Regras obrigatórias

- Não remover arquivos no início.
- Não rodar migrations em produção sem clone e backup.
- Não alterar contrato público de endpoints.
- Não trocar rota produtiva sem checklist.
- Não criar dados fake.
- Não usar localStorage para regra operacional.
- Não ampliar CSS legado.
- Não corrigir tela crítica por patch visual pequeno sem entender a regra.

---

## 3. Fases

### Fase 1 — Proteção

- salvar zip atual;
- salvar `.env` e `.env.production` quando existirem no ambiente;
- exportar banco MySQL;
- registrar data/hora do backup;
- manter pacote anterior pronto para rollback.

### Fase 2 — Congelamento de regras

- manter `docs/REGRA_DE_NEGOCIO_VALIDADA.md` atualizado;
- revisar qualquer mudança contra esse documento.

### Fase 3 — Rotas V2 internas

- criar rotas `/v2/*` ocultas da sidebar;
- proteger com permissão;
- não substituir rotas produtivas;
- usar somente leitura até validação.

### Fase 4 — Migração por tela

Ordem inicial recomendada:

1. Clientes;
2. Modelo Oficial;
3. Equipe;
4. Gestão de Tráfego;
5. Dashboard;
6. Ranking;
7. Preencher Semana;
8. Carteira do Squad.

### Fase 5 — Troca controlada

Para cada tela:

1. criar `/v2/nome-da-tela`;
2. validar com usuários internos;
3. comparar números com a tela atual;
4. trocar rota produtiva;
5. manter rota legacy temporária;
6. monitorar;
7. remover legado só depois da estabilização.

---

## 4. Deploy seguro na Hostinger

Antes do deploy:

```bash
npm install
npm run build
npm run verify:prod
```

Backend:

```bash
cd edifica-api
npm install
node --check server.js
node --check src/routes/metrics.js
node --check src/routes/clients.js
```

Não executar `npm run migrate` em produção sem validação em banco clone.

---

## 5. Rollback

Rollback precisa ser simples:

1. voltar build anterior;
2. preservar banco;
3. restaurar `.env` se necessário;
4. limpar cache quando aplicável;
5. registrar causa da falha.

Não fazer deploy que dependa de migration irreversível.

---

## 6. Critério de sucesso

- produção permanece operacional;
- nenhuma rota produtiva quebrada;
- V2 acessível internamente;
- regras documentadas;
- build aprovado;
- rollback possível.
