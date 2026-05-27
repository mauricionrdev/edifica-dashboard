ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_status_message VARCHAR(180) NULL AFTER custom_slug,
  ADD COLUMN IF NOT EXISTS profile_cover_preset VARCHAR(32) NOT NULL DEFAULT 'default' AFTER profile_status_message,
  ADD COLUMN IF NOT EXISTS profile_cover_data_url MEDIUMTEXT NULL AFTER profile_cover_preset,
  ADD COLUMN IF NOT EXISTS profile_cover_position_x TINYINT UNSIGNED NOT NULL DEFAULT 50 AFTER profile_cover_data_url,
  ADD COLUMN IF NOT EXISTS profile_cover_position_y TINYINT UNSIGNED NOT NULL DEFAULT 50 AFTER profile_cover_position_x,
  ADD COLUMN IF NOT EXISTS profile_cover_zoom SMALLINT UNSIGNED NOT NULL DEFAULT 100 AFTER profile_cover_position_y;
