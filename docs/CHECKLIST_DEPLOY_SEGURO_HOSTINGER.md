# Checklist de Deploy Seguro — Hostinger / Edifica Central

Use este checklist antes de qualquer envio para produção.

---

## 1. Backup

- [ ] Zip atual da produção salvo.
- [ ] `.env` atual salvo fora da pasta pública.
- [ ] Banco MySQL exportado.
- [ ] Data/hora do backup registrada.
- [ ] Responsável pelo deploy definido.

---

## 2. Validação local

Frontend:

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
node --check src/routes/projects.js
```

- [ ] Build aprovado.
- [ ] Verificação de produção aprovada.
- [ ] Nenhum erro de sintaxe no backend.

---

## 3. Banco de dados

- [ ] O deploy não exige migration.
- [ ] Se exigir migration, foi testada em clone.
- [ ] Migration foi testada duas vezes seguidas no clone.
- [ ] SQL reversível preparado.
- [ ] Backup feito imediatamente antes da alteração.

Regra: não rodar migration em produção esperando `--dry-run` se o script não suportar isso explicitamente.

---

## 4. Rotas críticas após deploy

- [ ] Login.
- [ ] Dashboard.
- [ ] Clientes.
- [ ] Modal de cliente.
- [ ] Preencher Semana.
- [ ] Carteira do Squad.
- [ ] Ranking de Squads.
- [ ] Ranking de GDVs.
- [ ] Gestão de Tráfego.
- [ ] Equipe.
- [ ] Perfil.
- [ ] Modelo Oficial.

---

## 5. Regras críticas

- [ ] Cliente Finalizado não conta como Churn.
- [ ] Cliente Finalizado sai da carteira ativa.
- [ ] Mês de Churn preservado.
- [ ] Ranking em tela acompanha mês atual.
- [ ] Campeão oficial só consolida após virada do mês.
- [ ] Gestão de Tráfego usa dados semanais existentes.
- [ ] Preencher Semana salva e recarrega sem localStorage operacional.

---

## 6. Rollback

- [ ] Build anterior disponível.
- [ ] Processo de retorno testado/conhecido.
- [ ] Banco não foi alterado de forma irreversível.
- [ ] Responsável sabe qual pasta substituir.

---

## 7. Pós-deploy

- [ ] Testar com usuário administrador.
- [ ] Testar com usuário operacional.
- [ ] Conferir permissões.
- [ ] Conferir console do navegador.
- [ ] Conferir logs do backend.
- [ ] Registrar resultado do deploy.
