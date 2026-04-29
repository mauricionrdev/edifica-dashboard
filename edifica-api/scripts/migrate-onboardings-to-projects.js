import 'dotenv/config';
import { query, pool } from '../src/db/pool.js';
import { syncClientProjectFromOnboarding } from '../src/utils/projectTasks.js';

async function main() {
  const clients = await query(
    `SELECT c.id, c.name
       FROM clients c
       LEFT JOIN projects p ON p.client_id = c.id
      WHERE p.id IS NULL
      ORDER BY c.name ASC`
  );

  let created = 0;
  for (const client of clients) {
    await syncClientProjectFromOnboarding(client.id, {
      actorUser: null,
      force: false,
    });
    created += 1;
    console.log(`[projects] ${client.name} -> projeto sincronizado`);
  }

  console.log(`[projects] concluído: ${created} projeto(s) criado(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
