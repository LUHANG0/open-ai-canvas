#!/usr/bin/env python3
"""Read-only checks of an already running candidate against its extracted Web image."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--dist", required=True, type=Path)
    args = parser.parse_args()
    target = urlsplit(args.base_url)
    if target.scheme not in ("http", "https") or not target.hostname or target.username or target.password or target.query or target.fragment or target.path not in ("", "/"):
        parser.error("base-url must be an origin without credentials, query or path")
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        parser.error("commit must be a full Git SHA")
    if not (args.dist / "index.html").is_file():
        parser.error("dist must contain index.html extracted from the candidate Web image")
    base = args.base_url.rstrip("/")
    checks = []

    def fetch(path):
        try:
            response = urlopen(base + path, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            if urlsplit(response.url).netloc != target.netloc:
                raise RuntimeError("unexpected cross-origin redirect")
            return response.status, response.headers, response.read()

    def check(condition, name):
        if not condition:
            raise RuntimeError(name)
        checks.append(name)

    status, _, body = fetch("/api/health/ready")
    envelope = json.loads(body)
    data = envelope.get("data", {})
    check(status == 200 and envelope.get("code") == 0 and data.get("ready") is True, "API proxy and readiness")
    build, schema = data.get("build", {}), data.get("schema", {})
    check(build.get("commit") == args.commit and build.get("version") == args.version, "Backend exact commit and version")
    check(schema.get("ready") is True and schema.get("current") == schema.get("expected"), "Schema current equals expected")
    check(all(data.get("checks", {}).get(key) is True for key in ("database", "runtime", "schema")), "Database and startup runtime checks (Redis needs separate PING)")
    shell = (args.dist / "index.html").read_bytes()
    for route in ("/", "/login", "/tasks", "/assets", "/assets/", "/canvas", "/canvas/", "/admin/settings/system-update", "/share/canvas/release-probe"):
        status, headers, body = fetch(route)
        check(status == 200 and body == shell, "SPA shell " + route)
        check("no-store" in headers.get("Cache-Control", ""), "HTML cache " + route)
    for path in ("/assets/release-probe-missing.js", "/mediapipe/wasm/release-probe-missing.wasm"):
        status, _, body = fetch(path)
        check(status == 404 and body != shell, "Missing asset returns 404 " + path)
    files = sorted(path for path in (args.dist / "assets").rglob("*") if path.is_file())
    critical = [path for path in files if re.search(r"worker|ffmpeg|\.wasm$", path.name, re.I)]
    check(any(path.suffix == ".wasm" for path in critical), "WASM present in image")
    check(any("worker" in path.name.lower() for path in critical), "Worker present in image")
    entry_names = re.findall(rb'(?:src|href)="(/assets/[^"?#]+)"', shell)
    critical = sorted(set(critical + [args.dist / name.decode().lstrip("/") for name in entry_names]))
    artifacts = []
    for path in critical:
        relative = path.relative_to(args.dist).as_posix()
        expected = path.read_bytes()
        status, headers, body = fetch("/" + relative)
        check(status == 200 and body == expected, "Asset bytes " + relative)
        check("immutable" in headers.get("Cache-Control", ""), "Asset cache " + relative)
        if path.suffix == ".wasm":
            check(headers.get_content_type() == "application/wasm" and body[:4] == b"\x00asm", "WASM MIME and magic")
        elif path.suffix == ".js":
            check(headers.get_content_type() in ("application/javascript", "text/javascript"), "JavaScript MIME " + relative)
        artifacts.append({"path": relative, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()})
    check(any(args.commit.encode() in path.read_bytes() for path in files if path.suffix == ".js"), "Web embedded commit")
    print(json.dumps({"commit": args.commit, "version": args.version, "schema": schema.get("current"), "checks": checks, "artifacts": artifacts, "scope": "read-only deployment shape; not browser execution or production business acceptance"}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
