// ==============================================================
//  diagnose.js — Script de auditoria para rodar em produção
//  (na Hostinger, dentro do diretório edifica-api/)
//
//  Uso:
//    cd edifica-api
//    node diagnose.js
//
//  Este script NÃO altera nada no banco. Só LÊ e mostra:
//    - Quantos clientes ativos existem
//    - Quantos têm metaLucro cadastrado no cliente
//    - Quantas linhas de weekly_metrics existem no total
//    - Quantas têm metaLucro preenchido no JSON
//    - Quantas têm fechados > 0
//    - Qual período tem mais dados (últimos 3 meses)
//    - Os últimos 10 registros de weekly_metrics (quem preencheu, quando)
//    - Se updated_at é muito diferente do created_at (indica edição)
//
//  Isso vai revelar se:
//    (A) Banco está vazio → time preenche em planilha
//    (B) Banco tem dados recentes → alguém tá preenchendo por API direta
//    (C) Banco tem dados antigos sem updates → migração one-shot e abandono
// ==============================================================
import 'dotenv/config';
import { pool, query } from './src/db/pool.js';

async function section(title, fn) {
  console.log('\n' + '='.repeat(64));
  console.log('  ' + title);
  console.log('='.repeat(64));
  try { await fn(); }
  catch (e) { console.error('ERRO:', e.message); }
}

async function main() {
  console.log('Diagnóstico Edifica — ' + new Date().toISOString());

  await section('1. Clientes', async () => {
    const all = await query(
      `SELECT status, COUNT(*) AS n FROM clients GROUP BY status`
    );
    console.table(all);
    const withGoal = await query(
      `SELECT COUNT(*) AS n FROM clients
        WHERE status='active' AND meta_lucro > 0`
    );
    console.log(`Clientes ativos com meta_lucro > 0: ${withGoal[0].n}`);
  });

  await section('2. Weekly metrics — panorama', async () => {
    const total = await query(`SELECT COUNT(*) AS n FROM weekly_metrics`);
    console.log(`Total de linhas: ${total[0].n}`);
    if (total[0].n === 0) {
      console.log('>>> BANCO VAZIO DE MÉTRICAS SEMANAIS <<<');
      console.log('    Conclusão: time NÃO preenche pela aplicação.');
      return;
    }

    const byPrefix = await query(`
      SELECT LEFT(period_key, 7) AS prefix, COUNT(*) AS rows,
             SUM(JSON_EXTRACT(data, '$.fechados') > 0) AS com_fechados,
             SUM(JSON_EXTRACT(data, '$.metaLucro') > 0) AS com_meta,
             SUM(JSON_EXTRACT(data, '$.investimento') > 0) AS com_invest
        FROM weekly_metrics
       GROUP BY prefix
       ORDER BY prefix DESC
       LIMIT 12`);
    console.table(byPrefix);
  });

  await section('3. Últimas 10 edições', async () => {
    const recent = await query(`
      SELECT wm.period_key, c.name AS cliente,
             wm.created_at, wm.updated_at,
             (wm.updated_at > DATE_ADD(wm.created_at, INTERVAL 10 SECOND)) AS foi_editado,
             JSON_EXTRACT(wm.data, '$.fechados')  AS fechados,
             JSON_EXTRACT(wm.data, '$.metaLucro') AS meta
        FROM weekly_metrics wm
        JOIN clients c ON c.id = wm.client_id
       ORDER BY wm.updated_at DESC
       LIMIT 10`);
    if (recent.length === 0) {
      console.log('Nenhuma linha.');
    } else {
      console.table(recent);
    }
  });

  await section('4. Há algum update recente (últimos 30 dias)?', async () => {
    const n = await query(`
      SELECT COUNT(*) AS n FROM weekly_metrics
       WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
    console.log(`Linhas editadas/criadas nos últimos 30 dias: ${n[0].n}`);
    if (n[0].n === 0) {
      console.log('>>> Ninguém está tocando nos dados pela API.');
    } else {
      console.log('>>> Alguém/algo está alimentando o banco. Investigue o origin.');
    }
  });

  await pool.end();
}

main().catch((e) => {
  console.error('Falha geral:', e);
  process.exit(1);
});
