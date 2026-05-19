-- ==============================================================
--  v110 — Mensalidades mensais independentes
--  Mantém as datas do contrato em clients.start_date/end_date.
--  As mensalidades passam a ser armazenadas em clients.fee_steps_json
--  como registros independentes por competência: [{ month: 'YYYY-MM', fee }]
-- ==============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS fee_steps_json JSON NULL AFTER meta_lucro;
