-- Campeões oficiais informados pela operação.
-- A competição do ranking dos Squads começou oficialmente em Abril/2026.
-- Abril/2026: Casca Grossa
-- Maio/2026: TITANS

INSERT INTO squad_ranking_champions
  (period_month, squad_id, squad_name, owner_name, realized_percent, predicted_percent, churn_percent, mrr, position, trophy_number, closed_at, snapshot_json)
SELECT
  '2026-04',
  s.id,
  s.name,
  COALESCE(u.name, ''),
  70.59,
  82.35,
  0.00,
  30006.00,
  1,
  1,
  '2026-04-30',
  JSON_OBJECT(
    'source', 'manual_seed',
    'periodMonth', '2026-04',
    'squadName', s.name,
    'ownerName', COALESCE(u.name, ''),
    'realizedPercent', 70.59,
    'predictedPercent', 82.35,
    'churnPercent', 0.00,
    'mrr', 30006.00,
    'reason', 'Campeao oficial informado pela operacao'
  )
FROM squads s
LEFT JOIN users u ON u.id = s.owner_user_id
WHERE LOWER(s.name) = LOWER('Casca Grossa')
LIMIT 1
ON DUPLICATE KEY UPDATE
  squad_id = VALUES(squad_id),
  squad_name = VALUES(squad_name),
  owner_name = VALUES(owner_name),
  realized_percent = VALUES(realized_percent),
  predicted_percent = VALUES(predicted_percent),
  churn_percent = VALUES(churn_percent),
  mrr = VALUES(mrr),
  position = VALUES(position),
  trophy_number = VALUES(trophy_number),
  closed_at = VALUES(closed_at),
  snapshot_json = VALUES(snapshot_json),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO squad_ranking_champions
  (period_month, squad_id, squad_name, owner_name, realized_percent, predicted_percent, churn_percent, mrr, position, trophy_number, closed_at, snapshot_json)
SELECT
  '2026-05',
  s.id,
  s.name,
  COALESCE(u.name, ''),
  56.25,
  81.25,
  0.00,
  38927.00,
  1,
  1,
  '2026-05-31',
  JSON_OBJECT(
    'source', 'manual_seed',
    'periodMonth', '2026-05',
    'squadName', s.name,
    'ownerName', COALESCE(u.name, ''),
    'realizedPercent', 56.25,
    'predictedPercent', 81.25,
    'churnPercent', 0.00,
    'mrr', 38927.00,
    'reason', 'Campeao oficial informado pela operacao'
  )
FROM squads s
LEFT JOIN users u ON u.id = s.owner_user_id
WHERE LOWER(s.name) = LOWER('TITANS')
LIMIT 1
ON DUPLICATE KEY UPDATE
  squad_id = VALUES(squad_id),
  squad_name = VALUES(squad_name),
  owner_name = VALUES(owner_name),
  realized_percent = VALUES(realized_percent),
  predicted_percent = VALUES(predicted_percent),
  churn_percent = VALUES(churn_percent),
  mrr = VALUES(mrr),
  position = VALUES(position),
  trophy_number = VALUES(trophy_number),
  closed_at = VALUES(closed_at),
  snapshot_json = VALUES(snapshot_json),
  updated_at = CURRENT_TIMESTAMP;
