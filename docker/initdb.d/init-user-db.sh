
#!/usr/bin/env bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
  CREATE USER forum ENCRYPTED PASSWORD 'forum_local_dev_only';
  CREATE DATABASE forum OWNER forum;
  GRANT ALL ON DATABASE forum TO forum;
SQL