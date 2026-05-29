#!/bin/bash
# send-email.sh — Pipe an agent's output through MIME wrapping and send via himalaya
# Usage:
#   node agents/notify/index.js migration-started --customer-id=X | bash agents/send-email.sh
#   node agents/email/index.js report.json --customer-id=X | bash agents/send-email.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMPFILE=$(mktemp /tmp/ranklabs-email-XXXXXX.eml)

# Pipe agent output through MIME wrapper into temp file, then send
python3 "$SCRIPT_DIR/mime-wrap.py" > "$TMPFILE"
himalaya message send < "$TMPFILE"
rm -f "$TMPFILE"
