#!/usr/bin/env python3
"""GSC Site Verification — automated via meta tag injection.

Part of the Rank Labs onboarding pipeline.
1. Gets a verification meta tag from Google
2. Injects it into the site template
3. Redeploys
4. Verifies ownership

Usage:
  python3 gsc-verify.py https://example.com --site-dir /path/to/site
"""
import argparse, json, os, sys, urllib.request, urllib.error
from pathlib import Path

SA_PATH = os.path.expanduser("~/.hermes/workspace/ranklabs/google-sa.json")
SCOPE = "https://www.googleapis.com/auth/siteverification"


def get_creds():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    creds = service_account.Credentials.from_service_account_file(SA_PATH, scopes=[SCOPE])
    creds.refresh(Request())
    return creds


def get_verification_token(url: str, method: str = "META") -> str:
    """Get a verification token from Google for the given site."""
    creds = get_creds()
    body = json.dumps({
        "site": {"identifier": url, "type": "SITE"},
        "verificationMethod": method,
    }).encode()

    req = urllib.request.Request(
        "https://www.googleapis.com/siteVerification/v1/token",
        data=body, method="POST",
        headers={"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    return data["token"]


def verify_site(url: str, method: str = "META") -> bool:
    """Verify site ownership. Returns True if verified or already verified."""
    creds = get_creds()
    body = json.dumps({
        "site": {"identifier": url, "type": "SITE"},
        "verificationMethod": method,
    }).encode()

    req = urllib.request.Request(
        f"https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod={method}",
        data=body, method="POST",
        headers={"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        if "already verified" in body.lower() or "already" in body.lower():
            return True
        print(f"Verification failed ({e.code}): {body}", file=sys.stderr)
        return False


def inject_meta_tag(site_dir: str, meta_tag: str) -> bool:
    """Inject the verification meta tag into every HTML file's <head>."""
    dist_dir = Path(site_dir) / "dist"
    if not dist_dir.exists():
        dist_dir = Path(site_dir)
    
    injected = 0
    for html_file in dist_dir.rglob("*.html"):
        content = html_file.read_text()
        if meta_tag in content:
            continue
        # Inject right after <head> or before first <script> in head
        if "<head>" in content:
            content = content.replace("<head>", f"<head>\n    {meta_tag}", 1)
        elif "</head>" in content:
            content = content.replace("</head>", f"    {meta_tag}\n  </head>", 1)
        else:
            continue
        html_file.write_text(content)
        injected += 1
    
    # Also inject into source template if Astro
    layout_files = list(Path(site_dir).glob("src/layouts/*.astro")) + \
                   list(Path(site_dir).glob("src/layouts/*.svelte")) + \
                   list(Path(site_dir).glob("templates/**/*.html"))
    for lf in layout_files:
        content = lf.read_text()
        if meta_tag not in content:
            if "</head>" in content:
                content = content.replace("</head>", f"    {meta_tag}\n  </head>", 1)
                lf.write_text(content)
                injected += 1
    
    return injected > 0


def main():
    parser = argparse.ArgumentParser(description="GSC site verification")
    parser.add_argument("url", help="Site URL to verify (e.g. https://example.com)")
    parser.add_argument("--site-dir", help="Path to site directory for meta tag injection")
    parser.add_argument("--build-cmd", default="npm run build", help="Build command")
    parser.add_argument("--deploy", action="store_true", help="Deploy after injection")
    parser.add_argument("--project-name", help="Cloudflare Pages project name (for deploy)")
    args = parser.parse_args()

    # Step 1: Get meta tag
    print(f"Getting verification token for {args.url}...", file=sys.stderr)
    meta_tag = get_verification_token(args.url)
    print(f"  Token: {meta_tag}", file=sys.stderr)

    # Step 2: Inject into site
    if args.site_dir:
        print(f"Injecting meta tag into {args.site_dir}...", file=sys.stderr)
        if inject_meta_tag(args.site_dir, meta_tag):
            print("  ✅ Meta tag injected", file=sys.stderr)
        else:
            print("  ⚠️  No HTML files found to inject into", file=sys.stderr)

    # Step 3: Build + deploy
    if args.deploy and args.project_name:
        import subprocess, shlex
        site_dir = Path(args.site_dir).resolve() if args.site_dir else Path.cwd()
        print(f"Building...", file=sys.stderr)
        subprocess.run(shlex.split(args.build_cmd), cwd=site_dir, check=True)
        print(f"Deploying to {args.project_name}...", file=sys.stderr)
        subprocess.run(
            ["npx", "wrangler", "pages", "deploy", "dist", "--project-name", args.project_name, "--branch", "main"],
            cwd=site_dir, check=True,
        )
        print("  ✅ Deployed", file=sys.stderr)

    # Step 4: Verify
    print(f"Verifying {args.url}...", file=sys.stderr)
    if verify_site(args.url):
        print("✅ VERIFIED", file=sys.stderr)
        print(json.dumps({"verified": True, "url": args.url, "meta_tag": meta_tag}))
    else:
        print("❌ Verification failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
