// ==============================================================
//  migrate-metaLucro-to-metaSemanal.js
//
//  Migra registros antigos de weekly_metrics.data que têm `metaLucro`
//  preenchido mas NÃO têm `metaSemanal`, copiando o valor para o novo
//  campo. Não apaga o legado — só adiciona o novo.
//
//  Por que rodar: a lógica nova de /summary prioriza `metaSemanal`.
//  Mantendo só `metaLucro`, os cálculos continuam funcionando pelo
//  fallback, mas o campo não aparece explicitamente no form da tela
//  Preencher Semana (ele lê metaSemanal). Com esta migração, a UI
//  pré-preenche o campo "Meta de contratos" com o valor legado e o
//  usuário só precisa confirmar/ajustar — em vez de achar que não
//  tem meta.
//
//  Uso (na Hostinger, dentro de edifica-api/):
//     node migrate-metaLucro-to-metaSemanal.js --dry-run  # só mostra
//     node migrate-metaLucro-to-metaSemanal.js            # aplica
//
//  IDEMPOTENTE: rodar duas vezes não faz nada na segunda.
// ==============================================================
import 'dotenv/config';
import { pool, query } from './src/db/pool.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? '→ DRY-RUN (nenhum UPDATE será executado)' : '→ MIGRANDO');

  // Pega só os registros que precisam
  const rows = await query(`
    SELECT id, client_id, period_key, data
      FROM weekly_metrics
     WHERE JSON_EXTRACT(data, '$.metaLucro') > 0
       AND (JSON_EXTRACT(data, '$.metaSemanal') IS NULL
         OR JSON_EXTRACT(data, '$.metaSemanal') = 0)
  `);

  console.log(`Candidatos: ${rows.length} linhas`);

  let changed = 0;
  for (const row of rows) {
    const data = typeof row.data === 'object' ? row.data : JSON.parse(row.data || '{}');
    const mLuc = Number(data.metaLucro) || 0;
    if (mLuc <= 0) continue;

    const updated = { ...data, metaSemanal: mLuc };

    if (DRY_RUN) {
      console.log(`  [dry] ${row.period_key} client=${row.client_id}  metaSemanal := ${mLuc}`);
    } else {
      await query(
        `UPDATE weekly_metrics SET data = ? WHERE id = ?`,
        [JSON.stringify(updated), row.id]
      );
    }
    changed++;
  }

  console.log(`\n${DRY_RUN ? 'Seriam migrados' : 'Migrados'}: ${changed} registros.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
