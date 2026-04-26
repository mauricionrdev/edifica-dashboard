# Como executar o SQL na Hostinger

Não execute arquivos `.sql` no terminal Git Bash. O erro `command not found` acontece porque o terminal tenta interpretar SQL como comandos do sistema.

## Caminho correto

1. Abra o hPanel da Hostinger.
2. Entre em **Bancos de dados**.
3. Abra o **phpMyAdmin** do banco usado pela Edifica Dashboard.
4. Selecione o banco correto no menu esquerdo.
5. Clique na aba **SQL**.
6. Copie o conteúdo de `docs/onboarding_legacy_db_cleanup.sql`.
7. Cole no campo SQL.
8. Clique em **Executar**.

## Não executar ainda

Não execute `docs/onboarding_legacy_drop_optional_later.sql` nesta etapa. Ele é apenas para uma limpeza definitiva futura.
