#!/usr/bin/env bash
#
# End-to-end test for the delete-account edge function.
#
# Sets up a real user with kids/boards/pictograms/storage objects, invokes
# the function, then asserts everything is gone. Catches FK-cascade gaps,
# storage RLS blocks, and auth.admin.deleteUser surprises that pure-unit
# tests cannot.
#
# Prerequisites:
#   - `supabase start` is running.
#   - `supabase functions serve delete-account --env-file supabase/functions/.env.local`
#     is running in another shell. The .env.local file (gitignored) must contain:
#         SUPABASE_URL=http://127.0.0.1:54321
#         SUPABASE_SERVICE_ROLE_KEY=<value from `supabase status -o json`>
#   - `jq`, `curl`, `psql` available on PATH.
#
# Note on seeding: the `private.handle_new_user` trigger seeds 1 kid + 17
# pictograms (one per row in public.template_pictograms) on every signup.
# This test then inserts ONE more kid and ONE more pictogram, so the
# pre-deletion sanity counts are 2 kids and 18 pictograms.

set -euo pipefail

# `supabase status` writes warnings (e.g. "Stopped services: ...") to stderr
# alongside the JSON on stdout. Drop stderr so jq sees clean JSON.
STATUS_JSON="$(supabase status -o json 2>/dev/null)"
API_URL="$(echo "$STATUS_JSON" | jq -r '.API_URL')"
ANON_KEY="$(echo "$STATUS_JSON" | jq -r '.ANON_KEY')"
DB_URL="$(echo "$STATUS_JSON" | jq -r '.DB_URL')"
FUNC_URL="${API_URL}/functions/v1/delete-account"

EMAIL="del-test-$(date +%s)-$$@example.com"
PASSWORD="correct-horse-battery-staple-$(date +%s)"

echo "==> 1/8 sign up fresh user (${EMAIL})"
SIGNUP=$(curl -fsS -X POST "${API_URL}/auth/v1/signup" \
  -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
USER_JWT=$(echo "$SIGNUP" | jq -r '.access_token')
USER_ID=$(echo "$SIGNUP" | jq -r '.user.id')
if [[ -z "$USER_JWT" || "$USER_JWT" == "null" ]]; then
  echo "FAIL signup did not return access_token (email confirmations may be on)"
  echo "    response: $SIGNUP"
  exit 1
fi
echo "    user_id: $USER_ID"

echo "==> 2/8 insert app rows via user JWT"
curl -fsS -X POST "${API_URL}/rest/v1/kids" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"owner_id\":\"${USER_ID}\",\"name\":\"e2e-kid\"}" > /dev/null

curl -fsS -X POST "${API_URL}/rest/v1/pictograms" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"owner_id\":\"${USER_ID}\",\"label\":\"apple\",\"style\":\"illus\",\"glyph\":\"A\",\"tint\":\"red\"}" > /dev/null

echo "==> 3/8 upload storage objects"
echo "fake-audio" > /tmp/del-audio.mp3
echo "fake-image" > /tmp/del-image.png
# Buckets have allowed_mime_types — must set Content-Type to a permitted value.
# pictogram-audio: audio/mpeg; pictogram-images: image/png.
curl -fsS -X POST "${API_URL}/storage/v1/object/pictogram-audio/${USER_ID}/test.mp3" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: audio/mpeg" \
  --data-binary "@/tmp/del-audio.mp3" > /dev/null
curl -fsS -X POST "${API_URL}/storage/v1/object/pictogram-images/${USER_ID}/test.png" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: image/png" \
  --data-binary "@/tmp/del-image.png" > /dev/null

echo "==> 4/8 pre-deletion sanity (counts via service-role)"
# 2 kids = 1 from handle_new_user trigger + 1 from this test.
# 18 pictograms = 17 from handle_new_user trigger + 1 from this test.
PRE_KIDS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.kids WHERE owner_id='$USER_ID'")
PRE_PICTS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.pictograms WHERE owner_id='$USER_ID'")
[[ "$PRE_KIDS" == "2" ]]   || { echo "FAIL pre-kids=$PRE_KIDS (expected 2)";   exit 1; }
[[ "$PRE_PICTS" == "18" ]] || { echo "FAIL pre-picts=$PRE_PICTS (expected 18)"; exit 1; }

PRE_AUDIO=$(psql "$DB_URL" -tAc "SELECT count(*) FROM storage.objects WHERE bucket_id='pictogram-audio' AND split_part(name, '/', 1)='$USER_ID'")
PRE_IMG=$(psql "$DB_URL" -tAc "SELECT count(*) FROM storage.objects WHERE bucket_id='pictogram-images' AND split_part(name, '/', 1)='$USER_ID'")
[[ "$PRE_AUDIO" == "1" ]] || { echo "FAIL pre-audio=$PRE_AUDIO (expected 1)"; exit 1; }
[[ "$PRE_IMG"   == "1" ]] || { echo "FAIL pre-img=$PRE_IMG (expected 1)";     exit 1; }

echo "==> 5/8 invoke delete-account function"
RESPONSE=$(curl -fsS -X POST "$FUNC_URL" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "    response: $RESPONSE"
[[ "$(echo "$RESPONSE" | jq -r '.ok')" == "true" ]] || { echo "FAIL response not ok"; exit 1; }

echo "==> 6/8 post-deletion: app rows gone (cascade)"
POST_AUTH=$(psql "$DB_URL" -tAc "SELECT count(*) FROM auth.users WHERE id='$USER_ID'")
POST_KIDS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.kids WHERE owner_id='$USER_ID'")
POST_PICTS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM public.pictograms WHERE owner_id='$USER_ID'")
[[ "$POST_AUTH"  == "0" ]] || { echo "FAIL post-auth=$POST_AUTH";   exit 1; }
[[ "$POST_KIDS"  == "0" ]] || { echo "FAIL post-kids=$POST_KIDS";   exit 1; }
[[ "$POST_PICTS" == "0" ]] || { echo "FAIL post-picts=$POST_PICTS"; exit 1; }

echo "==> 7/8 post-deletion: storage objects gone"
POST_AUDIO=$(psql "$DB_URL" -tAc "SELECT count(*) FROM storage.objects WHERE bucket_id='pictogram-audio' AND split_part(name, '/', 1)='$USER_ID'")
POST_IMG=$(psql "$DB_URL" -tAc "SELECT count(*) FROM storage.objects WHERE bucket_id='pictogram-images' AND split_part(name, '/', 1)='$USER_ID'")
[[ "$POST_AUDIO" == "0" ]] || { echo "FAIL post-audio=$POST_AUDIO"; exit 1; }
[[ "$POST_IMG"   == "0" ]] || { echo "FAIL post-img=$POST_IMG";     exit 1; }

echo "==> 8/8 sign-in attempt now fails"
# Don't use -f here: we EXPECT a 4xx. Use --write-out to capture status.
SIGNIN_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${API_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
[[ "$SIGNIN_STATUS" == "400" ]] || { echo "FAIL signin status=$SIGNIN_STATUS (expected 400)"; exit 1; }

rm -f /tmp/del-audio.mp3 /tmp/del-image.png
echo "==> ALL CHECKS PASSED"
