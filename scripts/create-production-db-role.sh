#!/usr/bin/env bash
# Generates a restricted, non-superuser Postgres role for production use and
# prints the DATABASE_URL to put in a production .env (or secret manager).
#
# This is purely additive -- it does NOT touch docker-compose.yml or the
# dev postgres/postgres credentials, which must keep working unchanged for
# `npm run start:all` / local development. It creates a second role inside
# the SAME database the dev container already runs (or any Postgres server
# you point it at via env vars), scoped to only the grants the app's own
# migrations (src/lib/db.ts) actually need:
#   - CONNECT on the database
#   - USAGE + CREATE on the public schema (initDb() runs CREATE TABLE IF NOT
#     EXISTS / ALTER TABLE / CREATE INDEX IF NOT EXISTS on every process
#     start, so the role needs schema-level CREATE, not just table DML)
#   - SELECT/INSERT/UPDATE/DELETE on all tables in public, including future
#     ones (via ALTER DEFAULT PRIVILEGES), since the app is expected to keep
#     adding columns/tables through the same idempotent-migration pattern
#   - USAGE on sequences (UUID PKs use gen_random_uuid(), not serial, but
#     this is harmless/future-proofing and costs nothing)
# It explicitly does NOT grant: SUPERUSER, CREATEDB, CREATEROLE, or
# replication -- confirmed at the bottom of this script's output.
#
# Usage (against the existing dev container, generating a *separate*
# production role/database inside it -- fine for local testing of the role
# mechanism itself; a real deployment should point PGHOST/PGPORT at its own
# production Postgres instance instead):
#   ./scripts/create-production-db-role.sh
#
# Env vars (defaults target the existing docker-compose Postgres):
#   PGHOST=127.0.0.1
#   PGPORT=5432
#   PGSUPERUSER=postgres        # admin user used to CREATE ROLE (dev default)
#   PGSUPERPASSWORD=postgres
#   PROD_DB_NAME=rsvp_prod      # database the restricted role will own data in
#   PROD_ROLE_NAME=rsvp_app
#   CONTAINER_NAME=rsvp-postgres-1   # if set, runs psql inside this docker
#                                      container instead of a local psql client

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGSUPERUSER="${PGSUPERUSER:-postgres}"
PGSUPERPASSWORD="${PGSUPERPASSWORD:-postgres}"
PROD_DB_NAME="${PROD_DB_NAME:-rsvp_prod}"
PROD_ROLE_NAME="${PROD_ROLE_NAME:-rsvp_app}"
CONTAINER_NAME="${CONTAINER_NAME:-rsvp-postgres-1}"

step "Checking for openssl (credential generation)..."
if ! command -v openssl >/dev/null 2>&1; then
    err "openssl is not on PATH."
    exit 1
fi
ok "openssl found."

ROLE_PASSWORD="$(openssl rand -base64 32 | tr -d '=+/\n' | cut -c1-32)"
if [ -z "$ROLE_PASSWORD" ]; then
    err "Failed to generate a role password."
    exit 1
fi

run_psql() {
    # $1 = database to connect to, $2 = SQL
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"; then
        docker exec -e PGPASSWORD="$PGSUPERPASSWORD" "$CONTAINER_NAME" \
            psql -v ON_ERROR_STOP=1 -U "$PGSUPERUSER" -h "$PGHOST" -p 5432 -d "$1" -c "$2"
    else
        PGPASSWORD="$PGSUPERPASSWORD" psql -v ON_ERROR_STOP=1 -U "$PGSUPERUSER" -h "$PGHOST" -p "$PGPORT" -d "$1" -c "$2"
    fi
}

step "Checking Postgres is reachable ($CONTAINER_NAME or $PGHOST:$PGPORT)..."
if ! run_psql "postgres" "SELECT 1;" >/dev/null 2>&1; then
    err "Could not connect to Postgres as $PGSUPERUSER."
    info "Make sure the Postgres container is running (npm run db:up) or point PGHOST/PGPORT/PGSUPERUSER/PGSUPERPASSWORD at your production server."
    exit 1
fi
ok "Connected."

step "Creating database '$PROD_DB_NAME' if it doesn't exist..."
DB_EXISTS="$(run_psql "postgres" "SELECT 1 FROM pg_database WHERE datname='$PROD_DB_NAME';" 2>/dev/null | grep -c '1 row' || true)"
if [ "$DB_EXISTS" = "0" ]; then
    run_psql "postgres" "CREATE DATABASE $PROD_DB_NAME;"
    ok "Database created."
else
    warn "Database '$PROD_DB_NAME' already exists -- leaving it as-is."
fi

step "Creating/updating restricted role '$PROD_ROLE_NAME'..."
# CREATE ROLE ... IF NOT EXISTS isn't valid syntax in Postgres, so check first.
ROLE_EXISTS="$(run_psql "postgres" "SELECT 1 FROM pg_roles WHERE rolname='$PROD_ROLE_NAME';" 2>/dev/null | grep -c '1 row' || true)"
if [ "$ROLE_EXISTS" = "0" ]; then
    run_psql "postgres" "CREATE ROLE $PROD_ROLE_NAME WITH LOGIN PASSWORD '$ROLE_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 50;"
    ok "Role created (NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION)."
else
    warn "Role '$PROD_ROLE_NAME' already exists -- rotating its password only."
    run_psql "postgres" "ALTER ROLE $PROD_ROLE_NAME WITH PASSWORD '$ROLE_PASSWORD';"
fi

step "Granting least-privilege access on '$PROD_DB_NAME'..."
run_psql "$PROD_DB_NAME" "GRANT CONNECT ON DATABASE $PROD_DB_NAME TO $PROD_ROLE_NAME;"
run_psql "$PROD_DB_NAME" "GRANT USAGE, CREATE ON SCHEMA public TO $PROD_ROLE_NAME;"
run_psql "$PROD_DB_NAME" "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $PROD_ROLE_NAME;"
run_psql "$PROD_DB_NAME" "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO $PROD_ROLE_NAME;"
run_psql "$PROD_DB_NAME" "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $PROD_ROLE_NAME;"
run_psql "$PROD_DB_NAME" "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO $PROD_ROLE_NAME;"
ok "Grants applied."

step "Verifying the role is NOT superuser..."
IS_SUPER="$(run_psql "postgres" "SELECT rolsuper FROM pg_roles WHERE rolname='$PROD_ROLE_NAME';" 2>/dev/null | grep -o '[tf]' | head -1 || true)"
if [ "$IS_SUPER" = "t" ]; then
    err "Role unexpectedly has SUPERUSER -- something is wrong, do not use it."
    exit 1
fi
ok "Confirmed: $PROD_ROLE_NAME is NOT a superuser (rolsuper=f)."

CONN_HOST="$PGHOST"
CONN_PORT="$PGPORT"
printf "\033[35m=========================================\033[0m\n"
printf "\033[35m Production DB role ready\033[0m\n"
printf "\033[35m=========================================\033[0m\n"
echo "Role:     $PROD_ROLE_NAME"
echo "Database: $PROD_DB_NAME"
echo
echo "Add this to your production .env (do not commit it):"
echo
echo "DATABASE_URL=postgres://$PROD_ROLE_NAME:$ROLE_PASSWORD@$CONN_HOST:$CONN_PORT/$PROD_DB_NAME"
echo
info "The app's own initDb() will run its CREATE TABLE IF NOT EXISTS migrations"
info "the first time it connects with this role -- no separate migration step needed."
info "Re-run this script any time to rotate the password (existing grants are re-applied, not duplicated)."
