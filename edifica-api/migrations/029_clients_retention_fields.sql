-- Indicadores de retenção: status finalizado, data/mês/ano do churn e data da alteração de status.
ALTER TABLE clients
  MODIFY COLUMN status ENUM('active','onboarding','rampagem_comercial','paused','churn','finished') NOT NULL DEFAULT 'active';

ALTER TABLE clients
  ADD COLUMN churn_month TINYINT NULL AFTER churn_date,
  ADD COLUMN churn_year SMALLINT NULL AFTER churn_month,
  ADD COLUMN status_changed_at DATETIME NULL AFTER churn_year;

UPDATE clients
   SET churn_month = MONTH(churn_date),
       churn_year = YEAR(churn_date)
 WHERE churn_date IS NOT NULL
   AND (churn_month IS NULL OR churn_year IS NULL);
