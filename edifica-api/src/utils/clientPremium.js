import { query } from '../db/pool.js';

let clientPremiumSchemaPromise = null;

export async function ensureClientPremiumSchema() {
  if (!clientPremiumSchemaPromise) {
    clientPremiumSchemaPromise = (async () => {
      const columns = await query('SHOW COLUMNS FROM clients');
      const names = new Set(columns.map((column) => column.Field));
      if (!names.has('is_premium')) {
        await query('ALTER TABLE clients ADD COLUMN is_premium TINYINT(1) NOT NULL DEFAULT 0');
      }
    })().catch((error) => {
      clientPremiumSchemaPromise = null;
      throw error;
    });
  }

  return clientPremiumSchemaPromise;
}
