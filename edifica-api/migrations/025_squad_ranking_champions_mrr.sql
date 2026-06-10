SET @column_exists := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'squad_ranking_champions'
     AND COLUMN_NAME = 'mrr'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE squad_ranking_champions ADD COLUMN mrr DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER churn_percent',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE squad_ranking_champions
   SET realized_percent = 70.59,
       predicted_percent = 82.35,
       churn_percent = 0.00,
       mrr = 30006.00,
       trophy_number = 1,
       snapshot_json = JSON_OBJECT(
         'source', 'manual_seed_update',
         'periodMonth', '2026-04',
         'squadName', squad_name,
         'ownerName', owner_name,
         'realizedPercent', 70.59,
         'predictedPercent', 82.35,
         'churnPercent', 0.00,
         'mrr', 30006.00,
         'reason', 'Dados oficiais de Abril/2026 informados pela operacao'
       )
 WHERE period_month = '2026-04'
   AND LOWER(squad_name) = LOWER('Casca Grossa');

UPDATE squad_ranking_champions
   SET realized_percent = 56.25,
       predicted_percent = 81.25,
       churn_percent = 0.00,
       mrr = 38927.00,
       trophy_number = 1,
       snapshot_json = JSON_OBJECT(
         'source', 'manual_seed_update',
         'periodMonth', '2026-05',
         'squadName', squad_name,
         'ownerName', owner_name,
         'realizedPercent', 56.25,
         'predictedPercent', 81.25,
         'churnPercent', 0.00,
         'mrr', 38927.00,
         'reason', 'Dados oficiais de Maio/2026 informados pela operacao'
       )
 WHERE period_month = '2026-05'
   AND LOWER(squad_name) = LOWER('TITANS');
