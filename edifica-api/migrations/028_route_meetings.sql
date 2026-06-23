CREATE TABLE IF NOT EXISTS route_meetings (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  meeting_date DATE NOT NULL,
  cap_user_id VARCHAR(36) NULL,
  cap_name VARCHAR(160) NULL,
  status ENUM('scheduled','completed') NOT NULL DEFAULT 'scheduled',
  notes TEXT NULL,
  created_by_user_id VARCHAR(36) NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_route_meetings_client_date (client_id, meeting_date),
  INDEX idx_route_meetings_status_date (status, meeting_date),
  INDEX idx_route_meetings_cap_date (cap_name, meeting_date),
  CONSTRAINT fk_route_meetings_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_meetings_cap_user FOREIGN KEY (cap_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_route_meetings_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
