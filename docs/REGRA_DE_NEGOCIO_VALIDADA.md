# REGRA DE NEGÓCIO VALIDADA — Edifica Central

**Base:** `edi-central(44).zip`  
**Objetivo:** congelar regras já validadas antes de qualquer reconstrução paralela, limpeza ou refatoração.  
**Princípio:** regra de negócio validada não é igual à implementação atual. A implementação pode ser refeita, mas a regra não pode ser perdida.

---

## 1. Diretriz de produção

A plataforma está em produção. Toda evolução deve seguir o modelo seguro:

1. produção atual permanece ativa;
2. nova versão nasce em rota/estrutura paralela;
3. validação ocorre com dados reais e sem alteração destrutiva;
4. troca acontece por rota, uma tela por vez;
5. legado permanece como fallback até estabilização;
6. remoção só ocorre no final.

Não executar migration em produção sem backup, teste em clone e plano de rollback.

---

## 2. Preencher Semana

**Regra validada:** Preencher Semana é a entrada operacional das métricas semanais dos clientes.

**Não pode mudar:**

- não usar `localStorage` para dados operacionais;
- não criar dados fake;
- salvar e ler dados do backend;
- preservar vínculo entre cliente, período, campanhas e métricas;
- manter compatibilidade com Carteira do Squad, Ranking, Gestão de Tráfego e Dashboard;
- qualquer tela V2 precisa bater os valores com a tela atual antes de substituir a rota produtiva.

**Risco:** alto. Não migrar no início da reconstrução.

---

## 3. Carteira do Squad

**Regra validada:** Carteira do Squad é extensão operacional dos dados semanais e da base de clientes.

**Não pode mudar:**

- Ranking não deve alterar as métricas da carteira;
- carteira deve refletir dados já preenchidos;
- MRR do squad precisa considerar receita recorrente e TCV mensalizado conforme regra atual;
- clientes Finalizados não ficam na carteira ativa;
- clientes em Churn/Cancelado não são tratados como Finalizados;
- Onboarding e Rampagem precisam manter leitura operacional separada.

**Risco:** alto. Migrar apenas depois de Clientes, Dashboard e Ranking estarem comparados.

---

## 4. Ranking de Squads

**Regra validada:** Ranking em tela acompanha o mês corrente com dados vivos.

**Não pode mudar:**

- ranking em tela pode acompanhar o mês atual;
- campeão mensal oficial só consolida após a virada do mês;
- snapshot de campeão não pode contaminar o ranking em tela;
- junho não pode aparecer como campeão oficial antes de julho;
- ranking deve refletir a base da Carteira do Squad sem recalcular por regra divergente no frontend.

**Risco:** alto. Antes de substituir, comparar ranking atual e V2 por mês, squad e período.

---

## 5. Ranking de GDVs

**Regra validada:** Ranking de GDVs é painel gerencial, não área de lançamento manual.

**Não pode mudar:**

- respeitar período selecionado;
- respeitar dados reais de clientes e métricas;
- não criar números artificiais;
- não duplicar cálculo divergente entre frontend e backend.

---

## 6. Dashboard Central

**Regra validada:** Dashboard é painel executivo, não ferramenta de preenchimento.

**Não pode mudar:**

- indicadores devem vir de fonte única confiável;
- churn e receita perdida precisam respeitar status Churn e Finalizado;
- Dashboard não deve recalcular regra crítica no frontend quando backend já entrega a regra;
- retenção mensal deve preservar a leitura gerencial;
- visual deve seguir dark premium, minimalista e operacional.

**Risco:** médio/alto. Migrar depois de congelar contratos de API.

---

## 7. Clientes

**Regra validada:** Clientes é domínio central e deve usar o padrão visual novo.

**Não pode mudar:**

- `/clientes` deve permanecer como rota produtiva principal;
- status `Finalizado` é diferente de `Churn / Cancelado`;
- Finalizado não conta como churn;
- Finalizado sai da carteira ativa;
- mês de churn precisa ser preservado para histórico;
- modal de cliente deve manter abas e dados atuais;
- Modelo Oficial deve seguir acessível;
- seletores e modais devem preservar identidade visual da plataforma.

**Risco:** médio. É boa candidata para primeira tela V2 porque já existe divergência entre tela nova e legada.

---

## 8. Status Finalizado

**Regra validada:** Finalizado representa encerramento correto, separado de churn.

**Não pode mudar:**

- não contar como churn;
- não contar como cliente ativo da carteira;
- preservar histórico do cliente;
- não confundir com inadimplência, cancelamento ou perda.

---

## 9. Status Churn / Cancelado

**Regra validada:** Churn representa perda/cancelamento e precisa ter histórico mensal.

**Não pode mudar:**

- manter mês/ano de churn;
- não misturar com Finalizado;
- refletir corretamente em Retenção, Dashboard e Indicadores por Squad.

---

## 10. Gestão de Tráfego

**Regra validada:** Gestão de Tráfego usa dados semanais existentes e serve para análise operacional.

**Não pode mudar:**

- não criar lançamento novo;
- mostrar claramente o gestor selecionado;
- priorizar clientes críticos por CPL alto, projeção ruim e ICP fora da meta;
- ranking de gestores deve respeitar período e meta configurada;
- dados devem vir dos preenchimentos semanais.

---

## 11. Retenção / Indicadores por Squad

**Regra validada:** Indicadores por Squad medem saúde da carteira e retenção.

**Não pode mudar:**

- Churn da Carteira;
- Churn Precoce;
- LTV Médio;
- Distribuição do Churn;
- filtros por mês e squad;
- leitura objetiva, sem cards dentro de cards e sem textos redundantes.

---

## 12. Modelo Oficial

**Regra validada:** Modelo Oficial precisa continuar acessível como referência operacional.

**Não pode mudar:**

- rota protegida por permissão;
- acesso por clientes/projetos quando aplicável;
- conteúdo real, sem fallback fake.

---

## 13. Permissões

**Regra validada:** Acesso por rota e escopo é obrigatório.

**Não pode mudar:**

- rotas protegidas por autenticação;
- rotas protegidas por permissão;
- usuário sem permissão não deve ver conteúdo;
- rotas V2 internas também precisam ser protegidas;
- workspace vazio deve preservar leitura zerada quando aplicável.

---

## 14. UX/UI validada

**Direção obrigatória:** dark premium, minimalista, operacional, inspirado em VSCode/Linear.

**Não usar:**

- visual genérico;
- card dentro de card sem necessidade;
- bordas excessivas;
- shadow pesado;
- paleta amarelada exagerada;
- gradientes chamativos;
- uppercase excessivo;
- textos didáticos/redundantes;
- focus ring visual chamativo;
- dados fake.

---

## 15. Critério de substituição de rota

Uma rota atual só pode apontar para a V2 quando:

1. build aprovado;
2. tela V2 protegida por permissão;
3. dados reais carregando corretamente;
4. números batendo com a versão atual;
5. checklist manual concluído;
6. fallback legado mantido temporariamente;
7. rollback documentado.

---

## 16. Ordem segura de migração

1. Shell V2 interno;
2. Clientes;
3. Modelo Oficial;
4. Equipe/Permissões;
5. Gestão de Tráfego;
6. Dashboard;
7. Ranking;
8. Preencher Semana;
9. Carteira do Squad;
10. limpeza de legado.

---

## 17. Status desta entrega

Esta documentação é a primeira trava de segurança. Ela não altera comportamento do sistema e deve acompanhar qualquer pacote futuro.
