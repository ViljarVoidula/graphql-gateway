#!/usr/bin/env bash
set -euo pipefail

# Force C locale to ensure numeric decimal separator is '.' (avoid '1,01' causing jq failures)
export LC_ALL=C LANG=C

# Bulk generator: creates synthetic product documents using GraphQL upsertProducts (bulk mutation).
# Updated to:
#   - Use hierarchical category paths in `categories` array (first entry drives breadcrumbs)
#   - Drop deprecated singular `category` field
#   - Provide unified `media` array (server transforms -> media_images / media_videos)
#   - Still includes ranking signals (views, popularity, priority)
#   - Uses new bulk mutation to reduce HTTP overhead & leverage server-side batch ingestion
#
# Adjustable via env vars:
#   COUNT      (default 10000)
#   BASE       (GraphQL endpoint base, default http://localhost:8088)
#   APP_ID     (deployment app id, default demo-app)
#   TENANT_ID  (logical tenant id, defaults to APP_ID or 'saas')
#   BULK_SIZE  (documents per bulk GraphQL mutation, default 10; legacy BATCH env kept as alias if BULK_SIZE unset)
#   BATCH      (legacy; if set and BULK_SIZE not provided, used as BULK_SIZE)
#   BULK_FALLBACK_SINGLE (1 to retry failed batch as individual single-doc mutations via old upsertProduct for debugging, default 0)
#   EMB_DIM    (embedding length; MUST match deployed tensor_dim, default 8; typical prod value 768)
#   EXPECTED_DIM (if set, script will warn & auto-fix EMB_DIM to this value)
#   NO_VECTOR  (if set to 1, skip embedding field for speed)
#   HIER_DEPTH (1 or 2: category depth to generate, default 2)
#   SEED       (seed base for pseudo-random floats)
#   LOG        (1 to log GraphQL responses, default 0)
#   LOG_FILE   (path for log output, default bulk_upserts.log)
#
# Usage examples:
#   ./scripts/generate_bulk.sh
#   COUNT=2000 EMB_DIM=128 APP_ID=myshop ./scripts/generate_bulk.sh
#   COUNT=5000 NO_VECTOR=1 HIER_DEPTH=1 ./scripts/generate_bulk.sh
#zz
# Notes:
# - Categories: we produce paths like "Apparel>Jackets". When HIER_DEPTH=1 only top-level is used.
# - You can safely re-run; ids are deterministic (sku-<n>) and will overwrite.
# - Embeddings are pseudo-random floats in [-0.5,0.5]. For deterministic overall ordering tweak SEED.
# - Increase BATCH cautiously; watch service & Vespa saturation.

## Support passing VAR=VALUE pairs as positional args (e.g. ./script COUNT=10 NO_VECTOR=1)
for arg in "$@"; do
  case "$arg" in
    *=*)
      key="${arg%%=*}"; val="${arg#*=}";
      export "$key"="$val"
      ;;
  esac
done

COUNT=${COUNT:-200}
BASE=${BASE:-http://localhost:8088}
APP_ID=${APP_ID:-default-app}
TENANT_ID=${TENANT_ID:-'saas'}
if [ -z "${TENANT_ID}" ]; then TENANT_ID=saas; fi
BULK_SIZE=${BULK_SIZE:-}
if [ -z "${BULK_SIZE}" ]; then
  # Backward compatibility: use BATCH if provided, else default 10
  BULK_SIZE=${BATCH:-10}
fi
BULK_FALLBACK_SINGLE=${BULK_FALLBACK_SINGLE:-0}
EMB_DIM=${EMB_DIM:-768}
NO_VECTOR=${NO_VECTOR:-0}
EXPECTED_DIM=${EXPECTED_DIM:-}
SHOW_ERRORS=${SHOW_ERRORS:-1}   # always show concise errors
FULL_ERROR_BODY=${FULL_ERROR_BODY:-0} # set 1 to show raw GraphQL error JSON
SEED=${SEED:-0}
RANDOM_SEED=$SEED
LOG=${LOG:-0}
LOG_FILE=${LOG_FILE:-bulk_upserts.log}

graphql() {
  local q=$1; shift
  local vars=$1; shift || true
  curl -sS "$BASE/graphql" -H 'content-type: application/json' -d '{"query":'"$q"',"variables":'"$vars"'}'
}

progress() { printf "\rInserting: %d/%d" "$1" "$2"; }

UPSERT_BULK_QUERY='"mutation($app:String!,$docs:[JSON!]!){ upsertProducts(appId:$app, docs:$docs) }"'
UPSERT_SINGLE_QUERY='"mutation($app:String!,$doc:JSON!){ upsertProduct(appId:$app, doc:$doc) }"' # for fallback

# Pre-generate name components for some variety
BRANDS=("FastFeet" "TrailMax" "UrbanRun" "PeakPro" "AeroGear" "NordicEdge" "CloudStep" "SunHike")
CATEGORIES=("shoes" "apparel" "accessories" "electronics" "home" "outdoors" "fitness" "bags")
ADJ=("Ultra" "Pro" "Lite" "Elite" "Extreme" "Eco" "Fusion" "Hyper" "Quantum" "Prime")
ITEM=("Runner" "Jacket" "Bottle" "Headset" "Backpack" "Lamp" "Tracker" "Sneaker" "Boot" "Watch" "Shoe")

# Capitalization helper
cap() { local s=$1; printf '%s' "${s^}"; }

# Build hierarchical categories array JSON (first element is deepest path, second optional is top-level)
HIER_DEPTH=${HIER_DEPTH:-2}
build_categories() {
  local cat=$1; local idx=$2
  local top=$(cap "$cat")
  local subArr=()
  case "$cat" in
    shoes) subArr=(Running Trail Casual Hiking Performance);;
    apparel) subArr=(Jackets Shirts Pants Outerwear Baselayer);;
    accessories) subArr=(Belts Hats Gloves Socks Jewelry);;
    electronics) subArr=(Audio Wearables Lighting Power Sensors);;
    home) subArr=(Kitchen Decor Storage Lighting Utility);;
    outdoors) subArr=(Camping Hiking Climbing Navigation Survival);;
    fitness) subArr=(Wearables Equipment Yoga Recovery Training);;
    bags) subArr=(Backpacks Travel Gym Laptop Utility);;
    *) subArr=(General);;
  esac
  local sub=${subArr[$((idx % ${#subArr[@]}))]}
  if [ "$HIER_DEPTH" = "1" ]; then
    printf '["%s"]' "$top"
  else
    printf '["%s>%s","%s"]' "$top" "$sub" "$top"
  fi
}

# Unified media array (always at least one image; occasionally a video)
build_media() {
  local idx=$1
  local imgUrl="https://cdn.example.com/img/${idx}.jpg"
  if (( idx % 17 == 0 )); then
    local vidUrl="https://cdn.example.com/video/${idx}.mp4"
    printf '[{"id":"img-%d","url":"%s","type":"IMAGE"},{"id":"vid-%d","url":"%s","type":"VIDEO"}]' "$idx" "$imgUrl" "$idx" "$vidUrl"
  else
    printf '[{"id":"img-%d","url":"%s","type":"IMAGE"}]' "$idx" "$imgUrl"
  fi
}

# Simple deterministic PRNG (LCG) returning float in [-0.5,0.5]
# Avoids python dependency.
LCG_A=1103515245
LCG_C=12345
LCG_M=2147483648 # 2^31
_lcg_seed=$(( (RANDOM_SEED + $$) % LCG_M ))
random_float() {
  _lcg_seed=$(( (LCG_A * _lcg_seed + LCG_C) % LCG_M ))
  awk -v s="$_lcg_seed" -v m="$LCG_M" 'BEGIN{printf("%.4f", (s/m)-0.5)}'
}

make_embedding() {
  if [ "$NO_VECTOR" = "1" ]; then echo '[]'; return; fi
  local vals=()
  for ((i=0;i<EMB_DIM;i++)); do vals+=("$(random_float)"); done
  printf '[%s]' "$(IFS=,; echo "${vals[*]}")"
}

create_doc_json() {
  command -v jq >/dev/null 2>&1 || { echo "jq is required (please install jq)" >&2; exit 1; }
  local idx=$1
  local brand=${BRANDS[$((idx % ${#BRANDS[@]}))]}
  local cat=${CATEGORIES[$((idx % ${#CATEGORIES[@]}))]}
  local name_part1=${ADJ[$((idx % ${#ADJ[@]}))]}
  local name_part2=${ITEM[$((idx % ${#ITEM[@]}))]}
  local name="$name_part1 $name_part2 $idx"
  local raw_cents=$(( (idx % 5000) + 100 ))
  # Convert to decimal with two places using bc to ensure dot decimal
  local price=$(printf '%d' "$raw_cents" | awk 'BEGIN{c=0} {c=$1} END{printf "%.2f", c/100}')
  local popularity=$(( (idx * 37) % 100 ))
  local views=$(( (idx * 91) % 10000 ))
  local priority=$(( idx % 5 ))
  local embedding_json=$(make_embedding)
  local categories_json=$(build_categories "$cat" "$idx")
  local media_json=$(build_media "$idx")
  local variations_json
  variations_json=$(printf '[{"id":"var-%d-a","sku":"SKU-%d-A","name":"%s Variant A","price":%s},{"id":"var-%d-b","sku":"SKU-%d-B","name":"%s Variant B","price":%s}]' "$idx" "$idx" "$name" "$price" "$idx" "$idx" "$name" "$price")
  # Build final document using jq to ensure valid JSON and proper escaping
  jq -nc \
    --arg tenant "$TENANT_ID" \
    --arg id "sku-$idx" \
    --arg name "$name" \
    --arg brand "$brand" \
    --arg price "$price" \
    --arg popularity "$popularity" \
    --arg views "$views" \
    --arg priority "$priority" \
    --arg cat "$cat" \
    --arg idx "$idx" \
  --argjson variations "$variations_json" \
    --argjson categories "$categories_json" \
    --argjson media "$media_json" \
    --argjson embedding "$embedding_json" \
  '{tenant_id:$tenant,id:$id,name:$name,brand:$brand,price:($price|tonumber),popularity:($popularity|tonumber),views:($views|tonumber),priority:($priority|tonumber),categories:$categories,media:$media,variations:($variations|tojson),embedding:$embedding,payload:{color:"red",idx:($idx|tonumber),top_category:$cat}}'
}

if [[ -n "$EXPECTED_DIM" && "${NO_VECTOR}" != "1" ]]; then
  if [[ "$EMB_DIM" != "$EXPECTED_DIM" ]]; then
    echo "[warn] EMB_DIM ($EMB_DIM) != EXPECTED_DIM ($EXPECTED_DIM) -> using $EXPECTED_DIM" >&2
    EMB_DIM=$EXPECTED_DIM
  fi
fi

if [[ "$NO_VECTOR" != "1" && "$EMB_DIM" -lt 32 ]]; then
  echo "[hint] EMB_DIM=$EMB_DIM looks very small; deployed default is often 768. Set EXPECTED_DIM=768 if feeds fail." >&2
fi

echo "Generating $COUNT product upserts (tenant=$TENANT_ID app=$APP_ID emb_dim=$EMB_DIM vectors=$((NO_VECTOR==0)) bulk_size=$BULK_SIZE)"
# Initialize log file if logging enabled
if [ "$LOG" = "1" ]; then
  : > "$LOG_FILE"
  echo "# Bulk upsert log $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$LOG_FILE"
  echo "# COUNT=$COUNT BULK_SIZE=$BULK_SIZE TENANT_ID=$TENANT_ID APP_ID=$APP_ID" >> "$LOG_FILE"
fi
inserted=0
batch_docs=()

flush_batch() {
  local size=${#batch_docs[@]}
  if (( size == 0 )); then return; fi
  # Write JSON array to temp file to avoid huge shell arg expansion
  local tmp
  tmp=$(mktemp)
  printf '[' > "$tmp"
  local first=1
  for d in "${batch_docs[@]}"; do
    if (( first )); then first=0; else printf ',' >> "$tmp"; fi
    printf '%s' "$d" >> "$tmp"
  done
  printf ']\n' >> "$tmp"
  local vars
  vars=$(jq -nc --arg app "$APP_ID" --slurpfile docs "$tmp" '{app:$app, docs:$docs[0]}')
  resp=$(graphql "$UPSERT_BULK_QUERY" "$vars") || { echo "[fatal] curl failed for batch" >&2; exit 1; }
  if grep -q '"errors"' <<<"$resp"; then
    echo "[batch-error] size=$size" >&2
    if [[ $SHOW_ERRORS == 1 ]]; then
      if command -v jq >/dev/null 2>&1; then
        jq -r '.errors[]?.message' <<<"$resp" | sed 's/^/[error] /' >&2 || true
      else
        echo "$resp" | sed -n 's/.*"message":"\([^"]*\)".*/[error] \1/p' >&2 || true
      fi
    fi
    if [[ $FULL_ERROR_BODY == 1 ]]; then echo "[error-body] $resp" >&2; fi
    if [[ $BULK_FALLBACK_SINGLE == 1 ]]; then
      echo "[info] retrying batch as single upserts" >&2
      for d in "${batch_docs[@]}"; do
        local single_vars
        single_vars=$(jq -nc --arg app "$APP_ID" --argjson doc "$d" '{app:$app, doc:$doc}')
        sresp=$(graphql "$UPSERT_SINGLE_QUERY" "$single_vars") || true
        if grep -q '"errors"' <<<"$sresp"; then
          echo "[single-error] doc failed in fallback" >&2
          if [[ $FULL_ERROR_BODY == 1 ]]; then echo "$sresp" >&2; fi
        fi
      done
    else
      echo "[fatal] batch failed; set BULK_FALLBACK_SINGLE=1 to auto-split" >&2
      exit 1
    fi
  fi
  if [ "$LOG" = "1" ]; then echo "$resp" >> "$LOG_FILE"; fi
  batch_docs=()
  rm -f "$tmp"
}

for ((i=1;i<=COUNT;i++)); do
  doc=$(create_doc_json "$i")
  batch_docs+=("$doc")
  if (( ${#batch_docs[@]} >= BULK_SIZE )); then
    flush_batch
    inserted=$i
    progress "$inserted" "$COUNT"
  fi
done
flush_batch
progress "$COUNT" "$COUNT"; echo

echo "Done. Example searches:" >&2
echo "# Basic lexical search" >&2
echo "curl -s -X POST $BASE/graphql -H 'Content-Type: application/json' -d '{\"query\":\"query($i:SearchInput!){ search(input:$i){ meta{ totalResults } results{ id name price score } } }\",\"variables\":{\"i\":{\"tenantId\":\"$TENANT_ID\",\"query\":\"Runner\",\"mode\":\"LEXICAL\",\"pagination\":{\"limit\":5}}}}'" >&2
echo "# Facet on payload.color (stored inside payload JSON). The service treats the whole payload as a string; \n# to facet by a nested property, materialize it as its own indexed field via schema_fields OR denormalize into a top-level field (recommended).\n# If you keep it only inside payload, you cannot group on it directly. Example below assumes you added an explicit 'color' field to schema_fields at deploy time." >&2
echo "# Example deploy extra field: schema_fields: [ { \"name\": \"color\", \"type\": \"string\", \"indexing\": \"summary | attribute | index\" } ]" >&2
echo "# Then feed docs with 'color' in root AND in payload for redundancy (bulk script currently only sets payload.color=red)." >&2
echo "# Categorical facet on color field (after adding real field):" >&2
echo "curl -s -X POST $BASE/graphql -H 'Content-Type: application/json' -d '{\"query\":\"query($i:SearchInput!){ search(input:$i){ facets{ ... on CategoricalFacetResult { field values{ value count } } } results{ id name } } }\",\"variables\":{\"i\":{\"tenantId\":\"$TENANT_ID\",\"query\":\"Runner\",\"facets\":[{\"field\":\"color\",\"type\":\"CATEGORICAL\",\"categorical\":{\"limit\":10}}]}}}'" >&2
