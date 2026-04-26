/*
Limpeza segura do Onboarding legado.

IMPORTANTE:
Este arquivo é SQL. Não execute no Git Bash, CMD ou PowerShell.
Execute no phpMyAdmin da Hostinger pela aba SQL, ou via cliente MySQL.

Este script NÃO remove o Modelo Oficial. A tabela onboarding_template permanece.
*/

START TRANSACTION;

CREATE TABLE IF NOT EXISTS onboardings_legacy_archive LIKE onboardings;

INSERT INTO onboardings_legacy_archive
SELECT o.*
  FROM onboardings o
  LEFT JOIN onboardings_legacy_archive a ON a.client_id = o.client_id
 WHERE a.client_id IS NULL;

DELETE FROM onboardings;

COMMIT;

/* Conferência após execução:
SELECT COUNT(*) AS onboardings_ativos FROM onboardings;
SELECT COUNT(*) AS onboardings_arquivados FROM onboardings_legacy_archive;
*/
