SET @column_exists := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'clients'
     AND COLUMN_NAME = 'contract_type'
);

SET @ddl := IF(
  @column_exists = 0,
  "ALTER TABLE clients ADD COLUMN contract_type ENUM('recurring','tcv') NOT NULL DEFAULT 'recurring' AFTER end_date",
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
