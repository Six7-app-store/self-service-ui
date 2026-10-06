#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Check if all required environment variables are set, otherwise exit with an error.
required_vars="OIDC_CLIENT_ID OIDC_ISSUER_URL"

for var in $required_vars; do
  if [ -z "$(eval echo \$$var)" ]; then
    echo "Error: $var environment variable is not set."
    exit 1
  fi
done

# Booleans are written into config.js unquoted, i.e. as JavaScript. Anything
# but true/false ("yes", "1", a typo) would be a ReferenceError at load time —
# a blank page instead of a readable error — so refuse to start instead.
for var in APP_STORE_ENABLED DUMMY_AUTH; do
  value="$(eval echo \$$var)"
  case "$value" in
    ""|true|false) ;;
    *) echo "Error: $var must be 'true' or 'false', got '$value'."; exit 1 ;;
  esac
done
APP_STORE_ENABLED="${APP_STORE_ENABLED:-true}"

# The App Store backend belongs to another release, so its address has no
# sensible default here (see DYN_ZONES_UPSTREAM in the README for what a
# default did). Required while the section is on; with it off, Caddy still
# needs a syntactically valid upstream, and nothing routes to it.
if [ "$APP_STORE_ENABLED" = "true" ]; then
  if [ -z "$APP_STORE_UPSTREAM" ]; then
    echo "Error: APP_STORE_UPSTREAM must be set (host:port of the App Store backend), or APP_STORE_ENABLED=false."
    exit 1
  fi
else
  export APP_STORE_UPSTREAM="127.0.0.1:9"
fi

# Dynamically generate the config file
cat > /srv/www/config.js << EOF_CONFIG
window.appconfig = {
  appStoreBaseUrl: "${APP_STORE_BASE_URL:-/api/app-store}",
  appStoreFrontendUrl: "${APP_STORE_FRONTEND_URL}",
  appStoreEnabled: ${APP_STORE_ENABLED},
  dynamicZonesBaseUrl: "${DYN_ZONES_BASE_URL}",
  cloudResourcesBaseUrl: "${CLOUD_RESOURCES_BASE_URL}",
  cloudResourcesMcpUrl: "${CLOUD_RESOURCES_MCP_URL}",
  dynamicZonesMcpUrl: "${DYN_ZONES_MCP_URL}",
  acmeServer: "${ACME_SERVER:-https://certificates.dhbw.cloud}",
  dummyAuth: ${DUMMY_AUTH:-false},
  "oidc": {
    "client_id": "${OIDC_CLIENT_ID}",
    "issuer_url": "${OIDC_ISSUER_URL}",
    "end_session_url": "${OIDC_END_SESSION_URL}",
  }
};
EOF_CONFIG

# Execute the main container command passed via CMD (e.g., the Caddy command).
exec "$@"
