#!/usr/bin/env bash
# One-shot deployment of the Kaucjomat backend to a Supabase project.
# Usage: scripts/deploy-supabase.sh <project-ref>
# Needs: `npx supabase login` done once, and the project's database password (asked by `link`).
# No Docker required. Secrets are generated here and never written to the repository.
set -euo pipefail

REF="${1:?usage: scripts/deploy-supabase.sh <project-ref>}"
FUNCTIONS_URL="https://${REF}.supabase.co/functions/v1"
SECRET="$(openssl rand -hex 24)"

echo "==> Linking ${REF}"
npx supabase link --project-ref "$REF"

echo "==> Applying migrations"
npx supabase db push --linked

echo "==> Deploying the import-osm Edge Function"
npx supabase secrets set --project-ref "$REF" OSM_IMPORT_SECRET="$SECRET"
npx supabase functions deploy import-osm --project-ref "$REF" --no-verify-jwt --use-api

cat <<SQL

==> Last step: run this once in Dashboard -> SQL Editor (it stores the secrets in Vault
    and starts the first import; pg_cron then imports one voivodeship every 5 minutes
    between 01:00 and 03:55 UTC until all 16 are fresh):

select vault.create_secret('${FUNCTIONS_URL}', 'kaucjomat_functions_url');
select vault.create_secret('${SECRET}', 'kaucjomat_osm_import_secret');
select public.osm_import_next_region();

-- progress: select code, last_success_at, stores_count, machines_count, last_error from osm_import_regions order by code;

Then: Authentication -> URL Configuration -> add redirect URL kaucjomat://auth/callback
App env (.env / EAS): EXPO_PUBLIC_SUPABASE_URL=https://${REF}.supabase.co
                      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Project Settings -> API Keys -> publishable>
SQL
