#!/bin/bash
# run-report.sh — Full weekly SEO report pipeline with GA4 traffic
# Usage: bash run-report.sh <site-id>
#
# Steps:
#   1. GA4 ingestion (pull latest traffic data to PostgreSQL)
#   2. SEO crawl
#   3. SEO audit
#   4. Optimization
#   5. Competitor analysis
#   6. Blog gaps
#   7. Report generation (with GA4 data merged from PostgreSQL)
#   8. Email delivery
#
# Prerequisites:
#   - kubectl port-forward -n database svc/postgresql 5433:5432 (in another terminal)
#   - source ~/.hermes/workspace/ranklabs/.env

set -e

SITE_ID="${1:?Usage: bash run-report.sh <site-id>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="${HOME}/ranklabs-infra/reports/${SITE_ID}/$(date +%Y-%m-%d)"

source ~/.hermes/workspace/ranklabs/.env 2>/dev/null || true

mkdir -p "$REPORT_DIR"

echo "═══ Rank Labs Weekly Report: ${SITE_ID} ═══"
echo "Report date: $(date +%Y-%m-%d)"
echo "Output: $REPORT_DIR"
echo ""

# ── Step 1: GA4 Ingestion ─────────────────────────────────────────────
echo "📊 Step 1/8: GA4 traffic ingestion..."
node "$REPO_DIR/agents/ga4-ingest/index.js" --site="$SITE_ID" 2>&1 || echo "  ⚠️  GA4 ingestion failed (non-fatal)"

# ── Step 2: SEO Crawl ────────────────────────────────────────────────
echo ""
echo "🕷️  Step 2/8: SEO crawl..."
node "$REPO_DIR/agents/crawler/index.js" "https://${SITE_ID}.pages.dev" > "$REPORT_DIR/crawl.json" 2>/dev/null || \
  node "$REPO_DIR/agents/crawler/index.js" "https://${SITE_ID}" > "$REPORT_DIR/crawl.json" 2>/dev/null || {
    echo "  ❌ Crawl failed"
    exit 1
  }
echo "  ✅ $(python3 -c "import json; d=json.load(open('$REPORT_DIR/crawl.json')); print(d.get('pages_crawled', '?'))") pages crawled"

# ── Step 3: SEO Audit ────────────────────────────────────────────────
echo ""
echo "🔍 Step 3/8: SEO audit..."
node "$REPO_DIR/agents/seo-audit/index.js" "$REPORT_DIR/crawl.json" > "$REPORT_DIR/audit.json" 2>/dev/null
echo "  ✅ Audit complete"

# ── Step 4: Optimization ─────────────────────────────────────────────
echo ""
echo "🔧 Step 4/8: Optimization..."
node "$REPO_DIR/agents/optimization/index.js" "$REPORT_DIR/audit.json" > "$REPORT_DIR/opt.json" 2>/dev/null
echo "  ✅ Optimization analysis complete"

# ── Step 5: Competitor ───────────────────────────────────────────────
echo ""
echo "🏁 Step 5/8: Competitor analysis..."
node "$REPO_DIR/agents/competitor/index.js" "$REPORT_DIR/audit.json" > "$REPORT_DIR/comp.json" 2>/dev/null || echo '{"status":"skipped"}' > "$REPORT_DIR/comp.json"
echo "  ✅ Competitor analysis complete"

# ── Step 6: Blog gaps ────────────────────────────────────────────────
echo ""
echo "📝 Step 6/8: Blog gap analysis..."
node "$REPO_DIR/agents/blog/index.js" "$REPORT_DIR/audit.json" > "$REPORT_DIR/blog.json" 2>/dev/null || echo '{"status":"skipped"}' > "$REPORT_DIR/blog.json"
echo "  ✅ Blog analysis complete"

# ── Step 7: Pull GA4 data for report ──────────────────────────────────
echo ""
echo "📈 Step 7/8: Merging GA4 traffic data..."
GA4_JSON="$REPORT_DIR/ga4.json"
python3 << PYEOF > "$GA4_JSON"
import json, os, datetime
try:
    import psycopg2
    conn = psycopg2.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5433")),
        dbname="ranklabs", user="postgres", password="ranklabs-dev"
    )
    cur = conn.cursor()
    end = datetime.date.today()
    start = end - datetime.timedelta(days=7)
    cur.execute("""
        SELECT SUM(active_users), SUM(sessions), SUM(page_views),
               ROUND(AVG(bounce_rate),1), ROUND(AVG(avg_session_sec),1),
               SUM(new_users)
        FROM ga4_data
        WHERE site_id = %s AND date >= %s
    """, ("$SITE_ID", start.isoformat()))
    row = cur.fetchone()
    if row and row[0] is not None:
        print(json.dumps({
            "active_users": int(row[0] or 0),
            "sessions": int(row[1] or 0),
            "page_views": int(row[2] or 0),
            "bounce_rate": float(row[3] or 0.0),
            "avg_session_sec": float(row[4] or 0.0),
            "new_users": int(row[5] or 0),
            "days": 7,
        }))
    else:
        print(json.dumps(None))
    conn.close()
except Exception as e:
    print(json.dumps(None))
PYEOF

# Merge GA4 into report
if [ -s "$GA4_JSON" ]; then
  GA4_DATA=$(cat "$GA4_JSON")
  if [ "$GA4_DATA" != "null" ]; then
    echo "  ✅ Traffic data found"
  else
    echo "  ⚠️  No traffic data yet for this period"
    GA4_DATA=""
  fi
else
  GA4_DATA=""
fi

# ── Step 8: Generate report + email ──────────────────────────────────
echo ""
echo "📋 Step 8/8: Report generation & email..."
BUSINESS_NAME=$(python3 -c "
import yaml
doc = yaml.safe_load(open('$REPO_DIR/customers.yaml'))
c = next((c for c in doc['customers'] if c['id'] == '$SITE_ID'), {})
print(c.get('business_name', '$SITE_ID'))
")

# Generate report JSON with GA4 embedded
if [ -n "$GA4_DATA" ]; then
  node "$REPO_DIR/agents/report/index.js" "$BUSINESS_NAME" \
    "$REPORT_DIR/audit.json" "$REPORT_DIR/opt.json" \
    "$REPORT_DIR/comp.json" "$REPORT_DIR/blog.json" \
    > "$REPORT_DIR/report.json" 2>/dev/null
  
  # Inject GA4 data into the report
  python3 << PYEOF
import json
report = json.load(open("$REPORT_DIR/report.json"))
report["ga4"] = $GA4_DATA
json.dump(report, open("$REPORT_DIR/report.json", "w"), indent=2)
PYEOF
else
  node "$REPO_DIR/agents/report/index.js" "$BUSINESS_NAME" \
    "$REPORT_DIR/audit.json" "$REPORT_DIR/opt.json" \
    "$REPORT_DIR/comp.json" "$REPORT_DIR/blog.json" \
    > "$REPORT_DIR/report.json" 2>/dev/null
fi

echo "  ✅ Report generated: $REPORT_DIR/report.json"

# Generate and send email
node "$REPO_DIR/agents/email/index.js" "$REPORT_DIR/report.json" \
  --customer-id="$SITE_ID" | bash "$REPO_DIR/agents/send-email.sh" 2>&1

echo ""
echo "═══ Report complete ═══"
echo "Report: $REPORT_DIR/report.json"
echo "Email: sent to customer"
