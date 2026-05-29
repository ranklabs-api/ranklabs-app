#!/usr/bin/env python3
"""Wrap HTML content into a proper MIME multipart/alternative email for himalaya.

Reads headers (From, To, Subject) + HTML body from stdin,
wraps in MIME multipart/alternative with plain-text fallback,
outputs to stdout for piping to `himalaya template send`.

Usage:
  echo "From: ...\nTo: ...\nSubject: ...\n\n<html>...</html>" | python3 mime-wrap.py | himalaya template send
"""
import sys
import re
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html.parser import HTMLParser


def html_to_plain_text(html: str) -> str:
    """Strip HTML tags and decode entities for plain-text fallback."""
    class Stripper(HTMLParser):
        def __init__(self):
            super().__init__()
            self.text = []
        def handle_data(self, data):
            self.text.append(data)
        def handle_entityref(self, name):
            self.text.append(f"&{name};")
    s = Stripper()
    s.feed(html)
    # Rough: join with newlines on block-ish breaks
    raw = "".join(s.text)
    # Collapse whitespace
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    raw = re.sub(r" {2,}", " ", raw)
    return raw.strip()


def main():
    raw = sys.stdin.read()

    # Split headers from body: first \n\n
    parts = raw.split("\n\n", 1)
    if len(parts) < 2:
        print("Error: Expected headers + blank line + HTML body", file=sys.stderr)
        sys.exit(1)

    header_block, html_body = parts

    # Parse headers
    headers = {}
    for line in header_block.strip().split("\n"):
        if ":" in line:
            key, _, val = line.partition(":")
            headers[key.strip().lower()] = val.strip()

    from_addr = headers.get("from", "Rank Labs <hello@getranklabs.com>")
    to_addr = headers.get("to", "")
    subject = headers.get("subject", "(no subject)")

    # Grab any additional headers
    extra_headers = {k: v for k, v in headers.items() if k not in ("from", "to", "subject")}

    # Build MIME message
    msg = MIMEMultipart("alternative")
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    for k, v in extra_headers.items():
        if k not in msg:
            msg[k] = v

    # Plain text fallback
    plain = html_to_plain_text(html_body)
    msg.attach(MIMEText(plain, "plain", "utf-8"))

    # HTML part
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    # Output raw MIME message for himalaya
    sys.stdout.write(msg.as_string())


if __name__ == "__main__":
    main()
