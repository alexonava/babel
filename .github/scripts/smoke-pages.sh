#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || { [ "$#" -eq 2 ] && [ "$2" != "--rollback" ]; }; then
  echo "Usage: smoke-pages.sh <immutable-pages-deployment-url> [--rollback]" >&2
  exit 2
fi

deployment_url="${1%/}"
if [[ ! "$deployment_url" =~ ^https://[a-z0-9-]+\.alexnava-me\.pages\.dev$ ]]; then
  echo "::error::Unexpected Pages deployment URL: $deployment_url"
  exit 1
fi
deployment_host="${deployment_url#https://}"
allow_previous_branding=false
if [ "${2:-}" = "--rollback" ]; then
  allow_previous_branding=true
fi

temp_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
mkdir -p "$temp_root"
work_dir="$(mktemp -d "$temp_root/babel-pages-smoke.XXXXXX")"

extract_final_headers() {
  local raw_headers="$1"
  local final_headers="$2"

  tr -d '\r' < "$raw_headers" |
    awk '/^HTTP\// { block = "" } { block = block $0 ORS } END { printf "%s", block }' \
      > "$final_headers"
}

matches_page_marker() {
  local body="$1"

  grep -Fq "<title>Alex Nava</title>" "$body" ||
    {
      [ "$allow_previous_branding" = "true" ] &&
        grep -Fq "<title>Nava Designs — Alex Nava</title>" "$body"
    }
}

fetch_page_once() {
  local label="$1"
  local url="$2"
  local expected_host="$3"
  local require_security_headers="$4"
  local body="$work_dir/${label}-body.html"
  local raw_headers="$work_dir/${label}-headers.txt"
  local final_headers="$work_dir/${label}-final-headers.txt"
  local result
  local status
  local effective_url
  local effective_host

  : > "$body"
  : > "$raw_headers"
  result="$(
    curl \
      --silent \
      --show-error \
      --connect-timeout 10 \
      --max-time 20 \
      --dump-header "$raw_headers" \
      --output "$body" \
      --write-out '%{http_code}\t%{url_effective}' \
      "$url" ||
      true
  )"
  status="${result%%$'\t'*}"
  effective_url="${result#*$'\t'}"
  effective_host="${effective_url#*://}"
  effective_host="${effective_host%%/*}"
  effective_host="${effective_host%%:*}"
  extract_final_headers "$raw_headers" "$final_headers"

  [ "$status" = "200" ] &&
    [ "$effective_host" = "$expected_host" ] &&
    matches_page_marker "$body" &&
    {
      [ "$require_security_headers" != "true" ] ||
        {
          grep -Eiq '^content-security-policy:' "$final_headers" &&
            grep -Eiq '^strict-transport-security:' "$final_headers" &&
            grep -Eiq '^x-content-type-options:[[:space:]]*nosniff' "$final_headers"
        }
    }
}

retry_page() {
  local label="$1"
  local url="$2"
  local expected_host="$3"
  local require_security_headers="$4"

  for attempt in 1 2 3 4 5 6; do
    if fetch_page_once "$label" "$url" "$expected_host" "$require_security_headers"; then
      echo "Smoke check passed for $url"
      return 0
    fi
    if [ "$attempt" -lt 6 ]; then
      echo "Smoke check attempt $attempt failed for $url; retrying in 5 seconds."
      sleep 5
    fi
  done

  echo "::error::Smoke check failed for $url after 6 attempts."
  return 1
}

collect_assets() {
  local body="$1"
  local output="$2"

  grep -oE '(css/styles|scripts/(app|scene))\.[a-f0-9]{8}\.(css|js)' "$body" |
    sort -u > "$output" || true
  [ "$(grep -Ec '^css/styles\.[a-f0-9]{8}\.css$' "$output")" -eq 1 ] &&
    [ "$(grep -Ec '^scripts/app\.[a-f0-9]{8}\.js$' "$output")" -eq 1 ] || return 1
  local count
  count="$(wc -l < "$output" | tr -d ' ')"
  if [ "$allow_previous_branding" = "true" ]; then
    # Rollback can restore either the estate or the previous scene homepage.
    [ "$count" -eq 2 ] || [ "$count" -eq 3 ]
  else
    [ "$count" -eq 2 ] && grep -Fq 'estate-destinations' "$body"
  fi
}

retry_page "deployment" "$deployment_url" "$deployment_host" "false"

deployment_assets="$work_dir/deployment-assets.txt"
if ! collect_assets "$work_dir/deployment-body.html" "$deployment_assets"; then
  echo "::error::Immutable deployment must contain the estate navigation and exactly one hashed app and CSS asset; scene references are accepted only for rollback."
  exit 1
fi

# Custom-domain promotion can lag the immutable deployment URL. Allow ~3
# minutes before treating apex hash mismatch as a failed release.
apex_assets="$work_dir/apex-assets.txt"
apex_max_attempts=18
apex_sleep_seconds=10
attempt=1
while [ "$attempt" -le "$apex_max_attempts" ]; do
  if fetch_page_once "apex" "https://alexnava.me/" "alexnava.me" "true" &&
    collect_assets "$work_dir/apex-body.html" "$apex_assets" &&
    cmp -s "$deployment_assets" "$apex_assets"; then
    echo "Apex marker, security-header, and asset-hash parity checks passed."
    break
  fi
  if [ "$attempt" -eq "$apex_max_attempts" ]; then
    echo "::error::Apex does not match the expected immutable deployment."
    diff -u "$deployment_assets" "$apex_assets" || true
    exit 1
  fi
  echo "Apex parity attempt $attempt failed; retrying in ${apex_sleep_seconds} seconds."
  sleep "$apex_sleep_seconds"
  attempt=$((attempt + 1))
done

check_404_once() {
  local body="$work_dir/missing-body.html"
  local result
  local status
  local effective_url
  local effective_host

  : > "$body"
  result="$(
    curl \
      --silent \
      --show-error \
      --connect-timeout 10 \
      --max-time 20 \
      --output "$body" \
      --write-out '%{http_code}\t%{url_effective}' \
      "https://alexnava.me/__babel-smoke-missing__" ||
      true
  )"
  status="${result%%$'\t'*}"
  effective_url="${result#*$'\t'}"
  effective_host="${effective_url#*://}"
  effective_host="${effective_host%%/*}"
  effective_host="${effective_host%%:*}"

  [ "$status" = "404" ] &&
    [ "$effective_host" = "alexnava.me" ] &&
    grep -Fq "That page isn't here." "$body"
}

for attempt in 1 2 3 4 5 6; do
  if check_404_once; then
    echo "404 smoke check passed."
    break
  fi
  if [ "$attempt" -eq 6 ]; then
    echo "::error::Missing paths must return the expected 404 from alexnava.me."
    exit 1
  fi
  echo "404 smoke attempt $attempt failed; retrying in 5 seconds."
  sleep 5
done

check_www_once() {
  local raw_headers="$work_dir/www-headers.txt"
  local final_headers="$work_dir/www-final-headers.txt"
  local result
  local status
  local effective_url
  local effective_host

  : > "$raw_headers"
  result="$(
    curl \
      --silent \
      --show-error \
      --connect-timeout 10 \
      --max-time 20 \
      --dump-header "$raw_headers" \
      --output /dev/null \
      --write-out '%{http_code}\t%{url_effective}' \
      "https://www.alexnava.me/" ||
      true
  )"
  status="${result%%$'\t'*}"
  effective_url="${result#*$'\t'}"
  effective_host="${effective_url#*://}"
  effective_host="${effective_host%%/*}"
  effective_host="${effective_host%%:*}"
  extract_final_headers "$raw_headers" "$final_headers"

  [ "$status" = "301" ] &&
    [ "$effective_host" = "www.alexnava.me" ] &&
    grep -Eiq '^location:[[:space:]]*https://alexnava\.me/[[:space:]]*$' "$final_headers"
}

for attempt in 1 2 3 4 5 6; do
  if check_www_once; then
    echo "www redirect check passed."
    break
  fi
  if [ "$attempt" -eq 6 ]; then
    echo "::error::www must return 301 with Location: https://alexnava.me/"
    exit 1
  fi
  echo "www redirect attempt $attempt failed; retrying in 5 seconds."
  sleep 5
done

echo "Cloudflare Pages production smoke contract passed."
