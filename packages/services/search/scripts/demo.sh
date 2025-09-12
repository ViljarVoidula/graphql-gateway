#!/usr/bin/env bash
set -euo pipefail

#!/usr/bin/env bash
set -euo pipefail

# Demo: deploy schema, upsert a doc, and query search
# You can override defaults via env vars:
#   BASE (GraphQL endpoint) default http://localhost:8088
#   APP_ID (application id) default demo-app
#   VESPA_ENDPOINT (query/doc API) default http://localhost:8100
#   VESPA_DEPLOY_ENDPOINT (deploy/config API) default http://localhost:19071
#   TENSOR_DIM (embedding size) default 8
#   GEO_ENABLED (true/false) default true

BASE=${BASE:-http://localhost:8088}
APP=${APP_ID:-demo-app}
VESPA_ENDPOINT=${VESPA_ENDPOINT:-http://localhost:8100}
VESPA_DEPLOY_ENDPOINT=${VESPA_DEPLOY_ENDPOINT:-http://localhost:19071}
TENSOR_DIM=${TENSOR_DIM:-8}
GEO_ENABLED=${GEO_ENABLED:-true}

echo "Using GraphQL: $BASE/graphql"
echo "Using Vespa query: $VESPA_ENDPOINT"
echo "Using Vespa deploy: $VESPA_DEPLOY_ENDPOINT"

wait_for() {
	local url=$1; local name=${2:-$1}
	echo -n "Waiting for $name";
	for i in {1..120}; do
		if curl -fsS "$url" >/dev/null 2>&1; then echo " ✔"; return 0; fi
		echo -n "."; sleep 1;
	done
	echo; echo "Timeout waiting for $name at $url" >&2; exit 1
}

# Wait for Vespa services to be available
wait_for "$VESPA_DEPLOY_ENDPOINT/state/v1/health" "Vespa configserver (19071)"

gql() {
	local q=$1
	local payload=$2
	local resp
	resp=$(curl -sS "$BASE/graphql" -H 'content-type: application/json' -d "{\"query\":$q,\"variables\":$payload}")
	echo "$resp"
	if echo "$resp" | grep -q '"errors"'; then
		echo "GraphQL error: $resp" >&2
		exit 1
	fi
}

# 1) Deploy app with default schema
echo "Deploying dynamic app package (tensor_dim=$TENSOR_DIM geo_enabled=$GEO_ENABLED)"
DEPLOY_QUERY='"mutation($app:String!,$schema:JSON!){ deployApp(appId:$app, schemaJson:$schema) }"'
DEPLOY_VARS='{"app":"'"$APP"'","schema":{"tensor_dim":'$TENSOR_DIM',"geo_enabled":'$GEO_ENABLED'}}'
gql "$DEPLOY_QUERY" "$DEPLOY_VARS" >/dev/null || {
	echo "Deploy failed" >&2; exit 1;
}

# Wait for query endpoint readiness after deploy (container must load new app)
echo -n "Waiting for Vespa query readiness"
for i in {1..120}; do
	resp=$(curl -sS -H 'content-type: application/json' \
		-d '{"yql":"select * from sources * where true","hits":1}' \
		"$VESPA_ENDPOINT/search/") || resp=""
	# must look like Vespa JSON, not HTML; simple heuristic: contains a top-level 'root'
	if echo "$resp" | grep -q '"root"'; then echo " ✔"; break; fi
	echo -n "."; sleep 1;
	if [ "$i" -eq 120 ]; then echo; echo "Timeout waiting for Vespa query readiness (got: ${#resp} bytes)" >&2; exit 1; fi
done

# 2) Upsert document (vector provided externally)
UPSERT_QUERY='"mutation($app:String!,$doc:JSON!){ upsertProduct(appId:$app, doc:$doc) }"'
UPSERT_VARS='{"app":"'"$APP"'","doc":{"id":"sku-1","type":"product","name":"Rolex Submariner","brand":"Rolex","price":9999.0,"payload":{"material":"steel"},"embedding":[0.1,0.2,0.3,0.4,0.1,0.2,0.3,0.4]}}'
gql "$UPSERT_QUERY" "$UPSERT_VARS" >/dev/null

# 3) Search
SEARCH_QUERY='"query($i:SearchInput!){ search(input:$i){ meta{ totalResults executionTime } results{ id name brand price score } } }"'
SEARCH_VARS='{"i":{"appId":"'"$APP"'","query":"rolex","pagination":{"limit":5}}}'
gql "$SEARCH_QUERY" "$SEARCH_VARS"
