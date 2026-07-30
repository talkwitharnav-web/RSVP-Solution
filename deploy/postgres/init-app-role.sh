#!/usr/bin/env bash
# Runs automatically on a fresh Postgres volume and can be re-run safely by
# the installer to repair grants or rotate the generated application password.
set -Eeuo pipefail

: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_DB:=rsvp_prod}"
: "${RSVP_APP_PASSWORD:?RSVP_APP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname postgres \
  --set=app_password="$RSVP_APP_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE rsvp_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 50',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rsvp_app') \gexec

SELECT format(
  'ALTER ROLE rsvp_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 50',
  :'app_password'
) \gexec

ALTER DATABASE rsvp_prod OWNER TO rsvp_app;
SQL

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
ALTER SCHEMA public OWNER TO rsvp_app;
GRANT CONNECT ON DATABASE rsvp_prod TO rsvp_app;
GRANT USAGE, CREATE ON SCHEMA public TO rsvp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rsvp_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rsvp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rsvp_app IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rsvp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rsvp_app IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO rsvp_app;
SQL

echo "Restricted Postgres role rsvp_app is ready."