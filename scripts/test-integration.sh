#!/usr/bin/env bash
# Runs integration tests against the local Supabase stack (`npx supabase start` first).
set -euo pipefail
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_TEST_URL="$API_URL" SUPABASE_TEST_ANON_KEY="$ANON_KEY" SUPABASE_TEST_SERVICE_KEY="$SERVICE_ROLE_KEY" \
  npx jest --config jest.integration.config.js "$@"
