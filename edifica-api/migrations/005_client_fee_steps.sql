CREATE TABLE IF NOT EXISTS client_fee_steps (
  id CHAR(36) NOT NULL,
  client_id CHAR(36) NOT NULL,
  label VARCHAR(120) NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_client_fee_steps_client (client_id),
  KEY idx_client_fee_steps_range (client_id, start_date, end_date),
  CONSTRAINT fk_client_fee_steps_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
