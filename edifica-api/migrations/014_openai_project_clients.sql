-- 014_openai_project_clients.sql
-- Mapeamento OpenAI Project ID -> cliente Edifica.
-- Fonte: Edifica-projects (1).csv exportado da organização Edifica na OpenAI.

CREATE TABLE IF NOT EXISTS openai_project_clients (
  id VARCHAR(80) NOT NULL,
  client_id CHAR(36) NULL,
  client_name VARCHAR(200) NOT NULL,
  openai_project_id VARCHAR(80) NOT NULL,
  openai_project_name VARCHAR(200) NOT NULL,
  is_legacy TINYINT(1) NOT NULL DEFAULT 0,
  last_monthly_spend_usd DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_openai_project_clients_project_id (openai_project_id),
  KEY idx_openai_project_clients_client_name (client_name),
  KEY idx_openai_project_clients_legacy (is_legacy),
  CONSTRAINT fk_openai_project_clients_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO openai_project_clients (
  id,
  client_name,
  openai_project_id,
  openai_project_name,
  is_legacy,
  last_monthly_spend_usd
) VALUES
('proj_EpbvENjE3KgNf7xQcZjtyWlu', 'Default project', 'proj_EpbvENjE3KgNf7xQcZjtyWlu', 'Default project', 1, 133.6400),
('proj_YvYjQgCQj2kIrdVg6rwzEwvx', 'Tomás Enrique', 'proj_YvYjQgCQj2kIrdVg6rwzEwvx', 'Projeto - Tomás Enrique', 0, 0.0000),
('proj_NDDn0g1zfocEhgw532YcyoLf', 'Fábio Elias Amarilla Costa', 'proj_NDDn0g1zfocEhgw532YcyoLf', 'Projeto - Fábio Elias Amarilla', 0, 0.2700),
('proj_4uWeKepv6xKNGEt06zat9ffE', 'Kálita Camargo', 'proj_4uWeKepv6xKNGEt06zat9ffE', 'Projeto - Kálita Camargo', 0, 2.9300),
('proj_EUaWUsLRSI0fBBu57ykyjSPo', 'Sousa e Lapa', 'proj_EUaWUsLRSI0fBBu57ykyjSPo', 'Projeto - Sousa e Lapa', 0, 3.2400),
('proj_cgMXxExNJU0eqrOOIC9RRfZx', 'Alice Machado', 'proj_cgMXxExNJU0eqrOOIC9RRfZx', 'Projeto - Alice Machado', 0, 0.0000),
('proj_2FTDp6QSzCtvWwmbKwRrKdXP', 'Marcos Fernandes', 'proj_2FTDp6QSzCtvWwmbKwRrKdXP', 'Projeto - Marcos Fernandes', 0, 0.0000),
('proj_SYDLLonrP6rZ8fdTCA0dw9WW', 'Gabriel Moldenhauer', 'proj_SYDLLonrP6rZ8fdTCA0dw9WW', 'Projeto - Gabriel Moldenhauer', 0, 1.9700),
('proj_tWKOgyIEzYQ3iQaiZamGNo8a', 'Santos e Morais', 'proj_tWKOgyIEzYQ3iQaiZamGNo8a', 'Projeto - Santos e Morais', 0, 1.4600),
('proj_0J0Ny3aOZLSb5OsZvTNytt6p', 'Bernardes França', 'proj_0J0Ny3aOZLSb5OsZvTNytt6p', 'Projeto - Bernardes França', 0, 7.5300),
('proj_Am4uDCkeu0JdG3HIT2IVYsRj', 'Pedro Nunes', 'proj_Am4uDCkeu0JdG3HIT2IVYsRj', 'Projeto - Pedro Nunes', 0, 0.0000),
('proj_6CirGi9iKbTnUJENjlyv2YKP', 'Fog Advocacia', 'proj_6CirGi9iKbTnUJENjlyv2YKP', 'Projeto - Fog Advocacia', 0, 0.0200),
('proj_scKoqaKceJucwSdzCVusiXHu', 'Genilson Ramos', 'proj_scKoqaKceJucwSdzCVusiXHu', 'Projeto - Genilson Ramos', 0, 2.3900),
('proj_AZIK2Ro9GWUIiQt7KBsJmot9', 'Carmen Cristina Braga', 'proj_AZIK2Ro9GWUIiQt7KBsJmot9', 'Projeto - Carmen Cristina Braga', 0, 1.2000),
('proj_CKWroUjnh5HNRiuwBU4eiLje', 'Oliveira e Damasceno', 'proj_CKWroUjnh5HNRiuwBU4eiLje', 'Projeto - Oliveira e Damasceno', 0, 0.8000),
('proj_sM5jIh2BzUTXZwWTnwvyU3dc', 'Reche e Sá', 'proj_sM5jIh2BzUTXZwWTnwvyU3dc', 'Projeto - Reche e Sá', 0, 2.5100),
('proj_TdqPHRMBF2ns2sHG73Pb2JGt', 'Caroline Braga', 'proj_TdqPHRMBF2ns2sHG73Pb2JGt', 'Projeto - Caroline Braga', 0, 7.2900),
('proj_S6YLdtRedQmFoMLp7CSxf7jc', 'Edy Advocacia', 'proj_S6YLdtRedQmFoMLp7CSxf7jc', 'Projeto - Edy', 0, 3.6500),
('proj_Ox8SQ8vTMsu3fnFEGMd1yNdA', 'Silva & Schmitz', 'proj_Ox8SQ8vTMsu3fnFEGMd1yNdA', 'Projeto - Silva & Schmitz', 0, 0.9300),
('proj_185VYijZUyR3iRvhiHEmOXYP', 'CMP Advogados', 'proj_185VYijZUyR3iRvhiHEmOXYP', 'Projeto - CMP', 0, 2.4200),
('proj_jYkfKS0S8J1EdxCY0rZTzkXZ', 'Flaudir Lima', 'proj_jYkfKS0S8J1EdxCY0rZTzkXZ', 'Projeto - Flaudir Lima', 0, 0.8100),
('proj_Qg9VpB3gdssroKeGbNJiud4I', 'Dutra Dacroce', 'proj_Qg9VpB3gdssroKeGbNJiud4I', 'Projeto - Dutra Dacroce', 0, 8.9000),
('proj_iZj4eFnNIZ13H7VmHHDyISPz', 'LRD Advocacia', 'proj_iZj4eFnNIZ13H7VmHHDyISPz', 'Projeto - LRD Advocacia', 0, 0.9700),
('proj_ZgjmB2OKLGwT0ctEujBU7MS0', 'Prev GS', 'proj_ZgjmB2OKLGwT0ctEujBU7MS0', 'Projeto - Prev GS', 0, 6.1200),
('proj_ZaQ6xU3EoO52lyRZniX8mvgB', 'Ribeiro Advogados Associados', 'proj_ZaQ6xU3EoO52lyRZniX8mvgB', 'Projeto - Ribeiro Advogados', 0, 0.6800),
('proj_65P7Qc6J0g21XwBarEvYiKHw', 'Lívia Monteiro', 'proj_65P7Qc6J0g21XwBarEvYiKHw', 'Projeto - Lívia Monteiro', 0, 0.1000),
('proj_HQx1qqhU4uMdso1fvUntKpmV', 'Valderes Baratieri', 'proj_HQx1qqhU4uMdso1fvUntKpmV', 'Projeto - Valderes Baratieri', 0, 0.5000),
('proj_zNhHqffsE3twY0t9RCoI9zzU', 'HD Advogados', 'proj_zNhHqffsE3twY0t9RCoI9zzU', 'Projeto - HD Advogados', 0, 1.6800),
('proj_8vNMwYHn0c0jUzxegzKughrm', 'Renata Cabral', 'proj_8vNMwYHn0c0jUzxegzKughrm', 'Projeto - Renata Cabral', 0, 1.2700),
('proj_erJjIGVzYgjOeavVbnGM5wu4', 'Steves Barbosa', 'proj_erJjIGVzYgjOeavVbnGM5wu4', 'Projeto - Steves Barbosa', 0, 2.0000),
('proj_KRXZsDCq1VhuVzq2ZTUlbbjS', 'Mendes e Guerra', 'proj_KRXZsDCq1VhuVzq2ZTUlbbjS', 'Projeto - Mendes e Guerra', 0, 0.0000),
('proj_E66X8pFWEhZvHy0bpacOgEWL', 'Laércio Gallassi', 'proj_E66X8pFWEhZvHy0bpacOgEWL', 'Projeto - Laércio Gallassi', 0, 0.0000),
('proj_nDVPF58IFzbeFh8SfS7uHFRJ', 'Geller Advocacia', 'proj_nDVPF58IFzbeFh8SfS7uHFRJ', 'Projeto - Geller Advocacia', 0, 0.0000),
('proj_cWwa23hDEuz0v10keMqNyZK1', 'Gonçalves & Barbosa', 'proj_cWwa23hDEuz0v10keMqNyZK1', 'Projeto - Gonçalves & Barbosa', 0, 3.6200),
('proj_ggHvmGUQUUxwJS4h8Iaej8Rq', 'Keila Zibordi', 'proj_ggHvmGUQUUxwJS4h8Iaej8Rq', 'Projeto - Keila Zibordi', 0, 0.0000),
('proj_UsAdWcGOplqXwWJhOoIPk5yB', 'Juliane Mondadori', 'proj_UsAdWcGOplqXwWJhOoIPk5yB', 'Projeto - Juliane Mondadori', 0, 0.0000)
ON DUPLICATE KEY UPDATE
  client_name = VALUES(client_name),
  openai_project_name = VALUES(openai_project_name),
  is_legacy = VALUES(is_legacy),
  last_monthly_spend_usd = VALUES(last_monthly_spend_usd),
  updated_at = CURRENT_TIMESTAMP;
