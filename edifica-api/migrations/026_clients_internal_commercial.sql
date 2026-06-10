SET @internal_commercial_exists := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'clients'
     AND COLUMN_NAME = 'internal_commercial_enabled'
);

SET @internal_commercial_sql := IF(
  @internal_commercial_exists = 0,
  'ALTER TABLE clients ADD COLUMN internal_commercial_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER gestor',
  'SELECT 1'
);

PREPARE internal_commercial_stmt FROM @internal_commercial_sql;
EXECUTE internal_commercial_stmt;
DEALLOCATE PREPARE internal_commercial_stmt;

SET @internal_seller_exists := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'clients'
     AND COLUMN_NAME = 'internal_seller'
);

SET @internal_seller_sql := IF(
  @internal_seller_exists = 0,
  'ALTER TABLE clients ADD COLUMN internal_seller VARCHAR(120) NULL AFTER internal_commercial_enabled',
  'SELECT 1'
);

PREPARE internal_seller_stmt FROM @internal_seller_sql;
EXECUTE internal_seller_stmt;
DEALLOCATE PREPARE internal_seller_stmt;

UPDATE clients
   SET internal_commercial_enabled = 1
 WHERE COALESCE(TRIM(internal_seller), '') <> '';
