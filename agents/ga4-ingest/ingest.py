#!/usr/bin/env python3
"""GA4 Data API ingestion — pull metrics for a single property → PostgreSQL.

Usage:
  GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json python3 ingest.py \\
    --property-id=properties/539456549 --site-id=getranklabs --days=30

Stores daily rows in ga4_data table (PostgreSQL on k3s).
"""
from __future__ import annotations

import argparse
import datetime
import os
import sys

import psycopg2
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest

# ── PostgreSQL connection ───────────────────────────────────────────────────

DB_CONFIG = {
    "host": os.environ.get("PGHOST", "postgresql.database.svc.cluster.local"),
    "port": int(os.environ.get("PGPORT", "5432")),
    "dbname": os.environ.get("PGDATABASE", "ranklabs"),
    "user": os.environ.get("PGUSER", "postgres"),
    "password": os.environ.get("PGPASSWORD", "ranklabs-dev"),
}


def get_db():
    return psycopg2.connect(**DB_CONFIG)


# ── GA4 ingestion ───────────────────────────────────────────────────────────


def ingest(property_id: str, site_id: str, days: int = 30):
    """Pull GA4 metrics and upsert into ga4_data."""
    client = BetaAnalyticsDataClient()

    end = datetime.date.today()
    start = end - datetime.timedelta(days=days)

    request = RunReportRequest(
        property=property_id,
        dimensions=[Dimension(name="date")],
        metrics=[
            Metric(name="activeUsers"),
            Metric(name="sessions"),
            Metric(name="screenPageViews"),
            Metric(name="bounceRate"),
            Metric(name="averageSessionDuration"),
            Metric(name="newUsers"),
        ],
        date_ranges=[DateRange(
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
        )],
    )

    response = client.run_report(request)
    rows_upserted = 0

    conn = get_db()
    try:
        with conn.cursor() as cur:
            for row in response.rows:
                date_val = row.dimension_values[0].value
                mv = row.metric_values
                cur.execute("""
                    INSERT INTO ga4_data
                        (site_id, property_id, date, active_users, sessions,
                         page_views, bounce_rate, avg_session_sec, new_users)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (site_id, date)
                    DO UPDATE SET
                        active_users    = EXCLUDED.active_users,
                        sessions        = EXCLUDED.sessions,
                        page_views      = EXCLUDED.page_views,
                        bounce_rate     = EXCLUDED.bounce_rate,
                        avg_session_sec = EXCLUDED.avg_session_sec,
                        new_users       = EXCLUDED.new_users
                """, (
                    site_id,
                    property_id,
                    date_val,
                    int(mv[0].value or 0),
                    int(mv[1].value or 0),
                    int(mv[2].value or 0),
                    float(mv[3].value or 0.0),
                    float(mv[4].value or 0.0),
                    int(mv[5].value or 0),
                ))
                rows_upserted += 1
        conn.commit()
    finally:
        conn.close()

    return rows_upserted


# ── GSC ingestion ───────────────────────────────────────────────────────────


def ingest_gsc(site_url: str, site_id: str, days: int = 30):
    """Pull GSC search analytics and upsert into gsc_data.

    Uses the shared OAuth credentials (user-based, not service account).
    Requires the searchops_google_oauth module to be installed and logged in.
    """
    try:
        from ranklabs_google_oauth import get_access_token
    except ImportError:
        print("GSC: searchops_google_oauth not installed — skipping", file=sys.stderr)
        return 0

    import json
    import urllib.request

    token = get_access_token()
    end = datetime.date.today()
    start = end - datetime.timedelta(days=days)

    body = json.dumps({
        "startDate": start.strftime("%Y-%m-%d"),
        "endDate": end.strftime("%Y-%m-%d"),
        "dimensions": ["query", "country", "device"],
        "rowLimit": 1000,
    }).encode()

    url = f"https://www.googleapis.com/webmasters/v3/sites/{site_url}/searchAnalytics/query"
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200] if e.fp else ""
        print(f"GSC API error ({e.code}): {body}", file=sys.stderr)
        return 0

    rows = data.get("rows", [])
    if not rows:
        return 0

    conn = get_db()
    upserted = 0
    try:
        with conn.cursor() as cur:
            for row in rows:
                keys = row.get("keys", [])
                query = keys[0] if len(keys) > 0 else ""
                country = keys[1] if len(keys) > 1 else ""
                device = keys[2] if len(keys) > 2 else ""
                cur.execute("""
                    INSERT INTO gsc_data
                        (site_id, date, query, country, device,
                         clicks, impressions, ctr, position)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (site_id, date, query)
                    DO UPDATE SET
                        clicks      = EXCLUDED.clicks,
                        impressions = EXCLUDED.impressions,
                        ctr         = EXCLUDED.ctr,
                        position    = EXCLUDED.position
                """, (
                    site_id,
                    start.isoformat(),  # aggregated by period
                    query,
                    country,
                    device,
                    int(row.get("clicks", 0) or 0),
                    int(row.get("impressions", 0) or 0),
                    float(row.get("ctr", 0) or 0),
                    float(row.get("position", 0) or 0),
                ))
                upserted += 1
        conn.commit()
    finally:
        conn.close()

    return upserted


# ── CLI ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="GA4 / GSC data ingestion")
    parser.add_argument("--property-id", help="GA4 property ID (e.g. properties/123456789)")
    parser.add_argument("--site-id", required=True, help="Customer site ID")
    parser.add_argument("--site-url", help="Site URL for GSC (e.g. https://example.com)")
    parser.add_argument("--days", type=int, default=30, help="Days of data to pull")
    parser.add_argument("--no-gsc", action="store_true", help="Skip GSC ingestion")
    args = parser.parse_args()

    results = []

    if args.property_id:
        print(f"GA4: Pulling {args.days} days for {args.site_id}...", file=sys.stderr)
        n = ingest(args.property_id, args.site_id, args.days)
        results.append(f"GA4: {n} rows")
        print(f"GA4: {n} rows upserted", file=sys.stderr)

    if not args.no_gsc and args.site_url:
        print(f"GSC: Pulling {args.days} days for {args.site_url}...", file=sys.stderr)
        n = ingest_gsc(args.site_url, args.site_id, args.days)
        results.append(f"GSC: {n} rows")
        print(f"GSC: {n} rows upserted", file=sys.stderr)

    if not results:
        results.append("nothing to do (no --property-id or --site-url)")

    # Print summary for the Node.js orchestrator to capture
    print(" ".join(results))


if __name__ == "__main__":
    main()
