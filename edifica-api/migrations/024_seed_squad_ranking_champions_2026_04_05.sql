-- Campeões oficiais informados pela operação.
-- A competição do ranking dos Squads começou oficialmente em Abril/2026.
-- Abril/2026: Casca Grossa
-- Maio/2026: TITANS
--
-- Observação:
-- Os percentuais ficam em 0 quando não houver snapshot operacional consolidado no momento do seed.
-- A partir dos próximos fechamentos, o backend continuará fixando o campeão mensal no banco.

INSERT INTO squad_ranking_champions
  (period_month, squad_id, squad_name, owner_name, realized_percent, predicted_percent, churn_percent, position, trophy_number, closed_at, snapshot_json)
SELECT
  '2026-04',
  s.id,
  s.name,
  COALESCE(u.name, ''),
  0,
  0,
  0,
  1,
  1,
  '2026-04-30',
  JSON_OBJECT(
    'source', 'manual_seed',
    'periodMonth', '2026-04',
    'squadName', s.name,
    'ownerName', COALESCE(u.name, ''),
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
  trophy_number = VALUES(trophy_number),
  closed_at = VALUES(closed_at),
  snapshot_json = VALUES(snapshot_json),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO squad_ranking_champions
  (period_month, squad_id, squad_name, owner_name, realized_percent, predicted_percent, churn_percent, position, trophy_number, closed_at, snapshot_json)
SELECT
  '2026-05',
  s.id,
  s.name,
  COALESCE(u.name, ''),
  0,
  0,
  0,
  1,
  1,
  '2026-05-31',
  JSON_OBJECT(
    'source', 'manual_seed',
    'periodMonth', '2026-05',
    'squadName', s.name,
    'ownerName', COALESCE(u.name, ''),
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
  trophy_number = VALUES(trophy_number),
  closed_at = VALUES(closed_at),
  snapshot_json = VALUES(snapshot_json),
  updated_at = CURRENT_TIMESTAMP;
