#!/usr/bin/env python3
"""Host Updater publication hook for MengCeng's existing nginx CDN bridge.

No uploads, database writes or container switching happen here. The updater owns
the component switch; this hook owns two preload files and verifies public bytes.
Configuration is trusted host input, never part of a release manifest.
"""

import concurrent.futures
import contextlib
import fcntl
import hashlib
import html.parser
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse


class PublicationError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise PublicationError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    with Path(path).open("rb") as source:
        result = hashlib.sha256()
        for block in iter(lambda: source.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def strict_json(path):
    def pairs(rows):
        result = {}
        for key, value in rows:
            require(key not in result, "Duplicate JSON field")
            result[key] = value
        return result
    require(Path(path).stat().st_size <= 8 * 1024 * 1024, "JSON input too large")
    return json.loads(Path(path).read_text(), object_pairs_hook=pairs)


def real_path(value, directory=False, private=False):
    require(isinstance(value, str) and value.startswith("/"), "Expected absolute host path")
    path = Path(value)
    require(str(path) == value and path.resolve() == path and path != Path("/"), "Mutable or unclean host path")
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), "Wrong host path type")
    require(not info.st_mode & (0o077 if private else 0o022), "Unsafe host path permissions")
    return path


def atomic_write(path, body, mode=0o600):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix=".publisher-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as target:
            os.fchmod(target.fileno(), mode)
            target.write(body)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary)


def save_json(path, value):
    atomic_write(path, (json.dumps(value, sort_keys=True, indent=2) + "\n").encode())


def asset_path(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_./~-]+", value), "Unsafe artifact name")
    path = PurePosixPath(value)
    require(not path.is_absolute() and str(path) == value and all(p not in (".", "..") for p in path.parts), "Artifact path traversal")
    return path


def validate_release(value):
    require(isinstance(value, dict) and value.get("format") == 1, "Unsupported release manifest")
    require(set(value) <= {"format", "id", "basedOn", "components"}, "Unexpected release field")
    require(isinstance(value.get("id"), str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", value["id"]), "Invalid release ID")
    components = value.get("components", {})
    require(set(components) == {"backend", "web", "yingce-agent"}, "Incomplete component manifest")
    for component in components.values():
        require(set(component) == {"image", "version", "commit"}, "Invalid component fields")
        require(isinstance(component["image"], str) and re.fullmatch(r"(?:sha256:[a-f0-9]{64}|[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[a-f0-9]{64})", component["image"]), "Image must be immutable")
        require(isinstance(component["commit"], str) and re.fullmatch(r"[a-f0-9]{40}", component["commit"]), "Full component commit required")
        require(isinstance(component["version"], str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", component["version"]), "Invalid component version")
    return value


class EntryHTML(html.parser.HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.modules, self.assets = [], []
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "script" and attrs.get("type") == "module" and attrs.get("src"):
            self.modules.append(attrs["src"])
        if tag in ("script", "link"):
            url = attrs.get("src") if tag == "script" else attrs.get("href")
            if url and url.startswith("/assets/"):
                self.assets.append(url[1:])


def inspect_artifact(root, stems):
    root = Path(root)
    files = {}
    for path in root.rglob("*"):
        require(not path.is_symlink(), "Artifact contains a link")
        if path.is_file():
            name = str(path.relative_to(root))
            asset_path(name)
            files[name] = {"sha256": file_hash(path), "bytes": path.stat().st_size}
    require("index.html" in files and len(files) <= 10000, "Incomplete or excessive artifact")
    text = (root / "index.html").read_text()
    parsed = EntryHTML(text)
    require(len(parsed.modules) == 1 and parsed.modules[0].startswith("/assets/"), "Expected one Vite module entry")
    entry = parsed.modules[0][1:]
    require(entry in files, "Missing module entry")
    require(text.count('<script type="module" crossorigin src="/' + entry + '"></script>') == 1, "Unsupported Vite entry tag layout")
    selected, queue = set(), []
    for stem in stems:
        matches = [name for name in files if re.fullmatch(r"assets/" + re.escape(stem) + r"-[A-Za-z0-9_-]{8}\.js", name)]
        require(len(matches) == 1, "Preload entry stem does not match this build")
        queue += matches
    while queue:
        name = queue.pop()
        if name in selected:
            continue
        require(name in files, "Missing static import dependency")
        selected.add(name)
        if name.endswith(".js"):
            content = (root / name).read_text()
            for dependency in re.findall(r"(?:\bfrom\s*|\bimport\s*)[\"'](\./[^\"'?]+\.(?:js|css))[\"']", content):
                resolved = str(PurePosixPath(name).parent / dependency[2:])
                asset_path(resolved)
                queue.append(resolved)
            stem = re.sub(r"-[A-Za-z0-9_-]{8}\.js$", "", name)
            queue += [f for f in files if re.fullmatch(re.escape(stem) + r"-[A-Za-z0-9_-]{8}\.css", f)]
    existing = set(parsed.assets)
    require(existing <= set(files), "HTML references missing assets")
    preloads = sorted(selected - existing)
    require(0 < len(preloads) < 100, "Unexpected preload graph size")
    return {"files": files, "entry": entry, "htmlAssets": sorted(existing), "preloads": preloads}


def quote_nginx(value):
    require("\x00" not in value and "\n" not in value and "\r" not in value, "Invalid nginx string")
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def render_preloads(release, artifact, cdn_prefix):
    entry = '<script type="module" crossorigin src="/' + artifact["entry"] + '"></script>'
    links = "".join(
        '<link rel="modulepreload" crossorigin href="/' + name + '">' if name.endswith(".js") else
        '<link rel="preload" as="style" crossorigin href="/' + name + '">'
        for name in artifact["preloads"])
    replacement = entry + links
    origin = ("# Host Updater web release " + release["id"] + '\nproxy_set_header Accept-Encoding "";\nsub_filter_once on;\nsub_filter ' + quote_nginx(entry) + " " + quote_nginx(replacement) + ";\n")
    replacement = replacement.replace('src="/assets/', 'src="${mc_static_assets}').replace('href="/assets/', 'href="${mc_static_assets}')
    chunks, current = [], ""
    for tag in re.findall(r"<[^>]*>|[^<]+", replacement):
        if current and len(current) + len(tag) > 2000:
            chunks.append(current)
            current = ""
        current += tag
    if current:
        chunks.append(current)
    cdn = cdn_prefix + "".join("set $mc_preload_" + str(i) + " " + quote_nginx(chunk) + ";\n" for i, chunk in enumerate(chunks))
    cdn += "sub_filter " + quote_nginx(entry) + " " + quote_nginx("".join("${mc_preload_" + str(i) + "}" for i in range(len(chunks)))) + ";\n"
    return origin.encode(), cdn.encode()


def verify_asset_headers(name, headers, location):
    cache = headers.get("cache-control", "").lower()
    require("immutable" in cache and re.search(r"\bmax-age=[1-9][0-9]*", cache), location + " asset cache policy mismatch")
    mime = headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if name.endswith(".js"):
        require(mime in ("application/javascript", "text/javascript"), location + " JavaScript MIME mismatch")
    if name.endswith(".css"):
        require(mime == "text/css", location + " stylesheet MIME mismatch")


class Publisher:
    def __init__(self, config_path, old_path, new_path, receipt):
        self.config_path = real_path(str(config_path))
        self.config = strict_json(self.config_path)
        c = self.config
        keys = {"format", "projectName", "nginxCommand", "originURL", "originResolveIP", "cdnAssetsURL", "cdnBrandURL", "originPreloadFile", "cdnPreloadFile", "protectedFiles", "preloadStems", "cdnTransforms", "htmlMarkers", "lockFile", "dockerPath", "curlPath", "requestTimeout", "operationTimeout", "workers"}
        require(set(c) <= keys and c.get("format") == 1, "Unsupported publisher configuration")
        require(re.fullmatch(r"[a-z0-9][a-z0-9_-]*", c.get("projectName", "")), "Explicit Compose project required")
        for key in ("originURL", "cdnAssetsURL", "cdnBrandURL"):
            url = urllib.parse.urlsplit(c[key])
            require(not url.username and not url.password and not url.query and not url.fragment, "URL contains credentials or query")
            loopback = url.hostname in ("127.0.0.1", "localhost", "::1")
            require(url.scheme == "https" or (url.scheme == "http" and loopback), "Public URLs must use HTTPS")
            require(url.hostname and (key == "originURL" and url.path in ("", "/") or key != "originURL" and url.path.endswith("/")), "Invalid publication URL")
        require(c["originURL"] == c["originURL"].rstrip("/"), "Origin URL must omit trailing slash")
        if c.get("originResolveIP"):
            ipaddress.ip_address(c["originResolveIP"])
        self.receipt = real_path(str(receipt), directory=True, private=True)
        self.old = validate_release(strict_json(old_path))
        self.new = validate_release(strict_json(new_path))
        self.input_hashes = {"from": digest(json.dumps(self.old, sort_keys=True).encode()), "to": digest(json.dumps(self.new, sort_keys=True).encode()), "config": file_hash(self.config_path)}
        require(self.old["id"] != self.new["id"] and self.new.get("basedOn") == self.old["id"], "Release ancestry mismatch")
        self.active = [real_path(c[k]) for k in ("originPreloadFile", "cdnPreloadFile")]
        require(len(set(self.active)) == 2, "Preload files must be distinct")
        self.protected = c["protectedFiles"]
        require(isinstance(self.protected, dict) and self.protected, "Pinned nginx routing files required")
        for path, expected in self.protected.items():
            real_path(path)
            require(re.fullmatch(r"[a-f0-9]{64}", expected), "Invalid protected-file hash")
            require(Path(path) not in self.active, "Mutable preload file is listed as immutable routing")
        for path in self.active + [self.config_path] + [Path(p) for p in self.protected]:
            require(self.receipt not in path.parents and path not in self.receipt.parents, "Receipt overlaps host configuration")
        self.nginx = c["nginxCommand"]
        require(isinstance(self.nginx, list) and self.nginx and all(isinstance(arg, str) and arg for arg in self.nginx), "Invalid nginx command")
        real_path(self.nginx[0])
        self.docker = str(real_path(c.get("dockerPath", "/usr/bin/docker")))
        self.curl = str(real_path(c.get("curlPath", "/usr/bin/curl")))
        self.stems = c["preloadStems"]
        require(isinstance(self.stems, list) and self.stems and all(isinstance(s, str) and re.fullmatch(r"[A-Za-z0-9_-]+", s) for s in self.stems), "Invalid preload stems")
        self.transforms = c["cdnTransforms"]
        require(isinstance(self.transforms, list) and all(set(t) == {"from", "to"} and isinstance(t["from"], str) and t["from"] and isinstance(t["to"], str) for t in self.transforms), "Invalid CDN transform rules")
        self.request_timeout = c.get("requestTimeout", 15)
        self.workers = c.get("workers", 4)
        duration = c.get("operationTimeout", 600)
        require(isinstance(duration, int) and 30 <= duration <= 1200 and isinstance(self.request_timeout, int) and 1 <= self.request_timeout <= 60 and isinstance(self.workers, int) and 1 <= self.workers <= 8, "Invalid publication limits")
        self.deadline = time.monotonic() + duration

    def run(self, args, output=None, timeout=120):
        remaining = self.deadline - time.monotonic()
        require(remaining > 0, "Publication deadline exceeded")
        result = subprocess.run(args, stdout=output if output is not None else subprocess.PIPE, stderr=subprocess.PIPE, timeout=min(timeout, remaining))
        require(result.returncode == 0, "Host command failed; private recovery inspection required")
        return result.stdout

    def protected_unchanged(self):
        require(file_hash(self.config_path) == self.input_hashes["config"], "Publisher configuration changed")
        for path, expected in self.protected.items():
            real_path(path)
            require(file_hash(path) == expected, "Pinned nginx routing changed")

    def image(self, release):
        component = release["components"]["web"]
        rows = json.loads(self.run([self.docker, "image", "inspect", component["image"]]))
        require(len(rows) == 1 and re.fullmatch(r"sha256:[a-f0-9]{64}", rows[0]["Id"]), "Image inspection failed")
        image = rows[0]
        require(not component["image"].startswith("sha256:") or image["Id"] == component["image"], "Image content mismatch")
        require((image["Config"].get("Labels") or {}).get("org.opencontainers.image.revision") == component["commit"], "Web image source commit mismatch")
        return image["Id"]

    def running_web(self, release):
        ids = self.run([self.docker, "ps", "-q", "--filter", "label=com.docker.compose.project=" + self.config["projectName"], "--filter", "label=com.docker.compose.service=web"]).decode().split()
        require(len(ids) == 1, "Expected one running web container")
        row = json.loads(self.run([self.docker, "inspect", ids[0]]))[0]
        require(row["Image"] == self.image(release) and row["State"]["Running"] and row["State"].get("Health", {}).get("Status") == "healthy", "Running web does not match manifest")
        return row["Id"]

    def extract(self, image):
        target = self.receipt / ("image-" + image.removeprefix("sha256:"))
        complete = self.receipt / (target.name + ".complete.json")
        if target.exists():
            require(complete.is_file() and strict_json(complete) == {"image": image, "complete": True}, "Interrupted artifact extraction; preserve receipt for inspection")
            return target
        require(os.statvfs(self.receipt).f_bavail * os.statvfs(self.receipt).f_frsize > 20 * 1024**3, "Insufficient host disk for artifact inspection")
        name = "mc-publisher-" + digest(str(self.receipt).encode())[:12] + "-" + image[-12:]
        container = self.run([self.docker, "create", "--name", name, "--label", "io.mengceng.web-publisher=" + digest(str(self.receipt).encode()), "--network", "none", "--entrypoint", "/bin/true", image]).decode().strip()
        try:
            with tempfile.TemporaryFile(dir=self.receipt) as archive:
                self.run([self.docker, "cp", container + ":/opt/canvas-release/.", "-"], output=archive)
                archive.seek(0)
                target.mkdir(mode=0o700)
                count, total = 0, 0
                with tarfile.open(fileobj=archive, mode="r|") as source:
                    for entry in source:
                        name = entry.name.removeprefix("./").rstrip("/")
                        if name in ("", ".") and entry.isdir():
                            continue
                        path = asset_path(name)
                        require(entry.isdir() or entry.isfile(), "Image artifact contains links or special entries")
                        count += 1
                        total += entry.size
                        require(count <= 12000 and 0 <= entry.size <= 256 * 1024**2 and total <= 1024**3, "Image artifact exceeds limits")
                        destination = target.joinpath(*path.parts)
                        if entry.isdir():
                            destination.mkdir(mode=0o700, parents=True, exist_ok=True)
                        else:
                            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                            with destination.open("xb") as output, source.extractfile(entry) as content:
                                for chunk in iter(lambda: content.read(1024 * 1024), b""):
                                    output.write(chunk)
                            destination.chmod(0o600)
            save_json(complete, {"image": image, "complete": True})
            return target
        finally:
            self.run([self.docker, "rm", container])

    def fetch(self, url, origin_cookie=False):
        remaining = self.deadline - time.monotonic()
        require(remaining > 0, "Publication request deadline exceeded")
        with tempfile.TemporaryDirectory(prefix="request-", dir=self.receipt) as temporary:
            body, headers = Path(temporary) / "body", Path(temporary) / "headers"
            args = [self.curl, "--disable", "--silent", "--show-error", "--fail", "--noproxy", "*", "--max-time", str(min(self.request_timeout, remaining)), "--max-filesize", str(64 * 1024**2), "--header", "Accept-Encoding: identity", "--output", str(body), "--dump-header", str(headers)]
            if origin_cookie:
                args += ["--header", "Cookie: mc_static_origin=1"]
            parsed = urllib.parse.urlsplit(url)
            origin = urllib.parse.urlsplit(self.config["originURL"])
            if self.config.get("originResolveIP") and (parsed.scheme, parsed.netloc) == (origin.scheme, origin.netloc):
                args += ["--resolve", parsed.hostname + ":" + str(parsed.port or (443 if parsed.scheme == "https" else 80)) + ":" + self.config["originResolveIP"]]
            self.run(args + [url], timeout=self.request_timeout + 2)
            text = headers.read_text(encoding="iso-8859-1")
            blocks = [block for block in text.replace("\r\n", "\n").split("\n\n") if block.startswith("HTTP/")]
            require(blocks and blocks[-1].splitlines()[0].split()[1] == "200", "Public response must be HTTP 200 without redirect")
            values = {}
            for line in blocks[-1].splitlines()[1:]:
                key, separator, value = line.partition(":")
                if separator:
                    key = key.lower()
                    values[key] = values.get(key, "") + (", " if key in values else "") + value.strip()
            require(body.stat().st_size <= 64 * 1024**2, "Public response too large")
            return body.read_bytes(), values

    def verify_html(self, artifact, preloads):
        reports = []
        for route in ("/", "/login"):
            for fallback in (False, True):
                body, headers = self.fetch(self.config["originURL"] + route, fallback)
                text = body.decode()
                require("[an error occurred" not in text.lower(), "SSI rendering failed")
                expected = "/" + artifact["entry"] if fallback else self.config["cdnAssetsURL"] + artifact["entry"].removeprefix("assets/")
                require(EntryHTML(text).modules == [expected], "Published module entry mismatch")
                cache = headers.get("cache-control", "").lower()
                require("no-cache" in cache or "no-store" in cache or re.search(r"\bmax-age=0\b", cache), "HTML must revalidate")
                if route == "/":
                    require(all(marker in text for marker in self.config.get("htmlMarkers", [])), "Public homepage content missing")
                    if preloads:
                        base = "/assets/" if fallback else self.config["cdnAssetsURL"]
                        require(all('href="' + base + name.removeprefix("assets/") + '"' in text for name in artifact["preloads"]), "Homepage preload graph mismatch")
                reports.append({"route": route, "originFallback": fallback, "sha256": digest(body)})
        return reports

    def verify_assets(self, artifact, names, cdn=True):
        root = self.receipt / artifact["directory"]

        def check(name):
            expected = (root / name).read_bytes()
            origin, headers = self.fetch(self.config["originURL"] + "/" + name, True)
            require(digest(origin) == artifact["files"][name]["sha256"], "Origin asset bytes mismatch")
            verify_asset_headers(name, headers, "Origin")
            record = {"path": name, "originSha256": digest(origin)}
            if cdn:
                if name.endswith((".js", ".css")):
                    for rewrite in self.transforms:
                        expected = expected.replace(rewrite["from"].encode(), rewrite["to"].encode())
                actual, headers = self.fetch(self.config["cdnAssetsURL"] + name.removeprefix("assets/"))
                require(actual == expected, "CDN asset bytes or configured rewrite mismatch")
                verify_asset_headers(name, headers, "CDN")
                record["cdnSha256"] = digest(actual)
            return record
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            return list(pool.map(check, sorted(names)))

    def verify_fonts(self, artifact, names):
        root = self.receipt / artifact["directory"]
        fonts = set()
        for name in names:
            if name.endswith(".css"):
                for path in re.findall(r"url\([\"']?(/brand/fonts/[^)\"'?]+)[\"']?\)", (root / name).read_text()):
                    relative = path[1:]
                    asset_path(relative)
                    require(relative in artifact["files"], "Stylesheet references a missing brand font")
                    fonts.add(relative)
        reports = []
        for name in sorted(fonts):
            source, _ = self.fetch(self.config["originURL"] + "/" + name, True)
            cdn, headers = self.fetch(self.config["cdnBrandURL"] + name.removeprefix("brand/"))
            expected = artifact["files"][name]["sha256"]
            require(digest(source) == expected and digest(cdn) == expected, "Brand font bytes mismatch")
            require("max-age=" in headers.get("cache-control", "").lower(), "Brand font cache policy missing")
            reports.append({"path": name, "sha256": expected})
        return reports

    def preflight(self):
        require(not (self.receipt / "plan.json").exists(), "Receipt already prepared; inspect it instead of overwriting recovery evidence")
        self.protected_unchanged()
        configuration = self.run(self.nginx + ["-T"]).decode()
        require(str(self.active[1]) in configuration, "CDN preload file is not in nginx's configuration")
        self.running_web(self.old)
        artifacts = {}
        for key, release in (("from", self.old), ("to", self.new)):
            root = self.extract(self.image(release))
            artifacts[key] = inspect_artifact(root, self.stems)
            artifacts[key]["directory"] = root.name
        old, new = artifacts["from"], artifacts["to"]
        for name, info in old["files"].items():
            if name.startswith("assets/") and name in new["files"]:
                require(info["sha256"] == new["files"][name]["sha256"], "Immutable asset filename changed bytes; use a new content hash")
        current = self.active[1].read_text()
        marker = "set $mc_preload_0 "
        require(current.count(marker) == 1 and "${mc_static_assets}" in current, "Unrecognized nginx homepage preload layout")
        prefix = current.split(marker)[0]
        origin, cdn = render_preloads(self.new, new, prefix)
        hashes = {}
        modes = []
        for index, (active, next_body) in enumerate(zip(self.active, (origin, cdn))):
            before, after = "before-" + str(index) + ".conf", "next-" + str(index) + ".conf"
            atomic_write(self.receipt / before, active.read_bytes())
            atomic_write(self.receipt / after, next_body)
            hashes[before] = file_hash(self.receipt / before)
            hashes[after] = file_hash(self.receipt / after)
            modes.append(active.stat().st_mode & 0o777)
        critical = set(old["htmlAssets"] + old["preloads"])
        reports = {"html": self.verify_html(old, False), "assets": self.verify_assets(old, critical), "fonts": self.verify_fonts(old, critical)}
        self.protected_unchanged()
        require(all(file_hash(path) == hashes["before-" + str(i) + ".conf"] for i, path in enumerate(self.active)), "Preloads changed during preflight")
        save_json(self.receipt / "preflight-verification.json", reports)
        plan = {"format": 1, "inputs": self.input_hashes, "artifacts": artifacts, "receiptFiles": hashes, "modes": modes}
        save_json(self.receipt / "plan.json", plan)
        self.journal("prepared")

    def load_plan(self):
        plan = strict_json(self.receipt / "plan.json")
        require(plan.get("format") == 1 and plan.get("inputs") == self.input_hashes, "Publisher inputs differ from preflight")
        for name, expected in plan["receiptFiles"].items():
            asset_path(name)
            require(file_hash(real_path(str(self.receipt / name), private=True)) == expected, "Private recovery receipt changed")
        for artifact in plan["artifacts"].values():
            asset_path(artifact["directory"])
            root = real_path(str(self.receipt / artifact["directory"]), directory=True, private=True)
            require(inspect_artifact(root, self.stems)["files"] == artifact["files"], "Frozen artifact changed")
        self.protected_unchanged()
        return plan

    def journal(self, stage):
        save_json(self.receipt / "publication.json", {"stage": stage, "from": self.old["id"], "to": self.new["id"], "recordedAt": time.time()})

    def install(self, plan, target):
        # Accept either side of our own partial write, never overwrite an
        # operator's concurrent edit or a third publication's configuration.
        for i, path in enumerate(self.active):
            real_path(str(path))
            allowed = {plan["receiptFiles"][side + "-" + str(i) + ".conf"] for side in ("before", "next")}
            require(file_hash(path) in allowed, "Live preload configuration drift; refuse overwrite")
        self.protected_unchanged()
        self.journal("installing-" + target)
        for i, path in enumerate(self.active):
            atomic_write(path, (self.receipt / (target + "-" + str(i) + ".conf")).read_bytes(), plan["modes"][i])
        self.run(self.nginx + ["-t"])
        self.run(self.nginx + ["-s", "reload"])
        self.journal("reloaded-" + target)

    def verify(self, plan, rollback=False):
        release = self.old if rollback else self.new
        artifact = plan["artifacts"]["from" if rollback else "to"]
        self.running_web(release)
        expected = "before" if rollback else "next"
        require(all(file_hash(path) == plan["receiptFiles"][expected + "-" + str(i) + ".conf"] for i, path in enumerate(self.active)), "Active preload files do not match publication")
        names = set(artifact["htmlAssets"] + artifact["preloads"])
        if not rollback:
            old_files = plan["artifacts"]["from"]["files"]
            names.update(name for name, info in artifact["files"].items() if name.startswith("assets/") and (name not in old_files or old_files[name] != info))
        last_error = None
        for _ in range(8):
            try:
                html = self.verify_html(artifact, not rollback)
                break
            except (PublicationError, subprocess.TimeoutExpired) as error:
                last_error = error
                require(time.monotonic() + 1 < self.deadline, "HTML publication did not settle")
                time.sleep(1)
        else:
            raise PublicationError("HTML publication did not settle") from last_error
        assets = self.verify_assets(artifact, names)
        fonts = self.verify_fonts(artifact, names)
        retained = []
        if not rollback:
            old = plan["artifacts"]["from"]
            prior = set(old["htmlAssets"] + old["preloads"]) - set(artifact["files"])
            retained = self.verify_assets(old, prior)
        self.protected_unchanged()
        save_json(self.receipt / ("rollback-verification.json" if rollback else "verification.json"), {"release": release["id"], "html": html, "assets": assets, "fonts": fonts, "retainedOldAssets": retained, "checkedAt": time.time()})
        self.journal("rolled-back" if rollback else "verified")

    def phase(self, phase):
        if phase == "preflight":
            self.preflight()
            return
        plan = self.load_plan()
        if phase == "publish":
            self.running_web(self.new)
            # Test the actual target through the origin fallback before changing
            # nginx or relying on CDN cache. Container switching is not ours.
            body, _ = self.fetch(self.config["originURL"] + "/", True)
            require(EntryHTML(body.decode()).modules == ["/" + plan["artifacts"]["to"]["entry"]], "Target web HTML is not live")
            self.install(plan, "next")
        elif phase == "verify":
            self.verify(plan)
        elif phase == "rollback":
            self.running_web(self.old)
            self.install(plan, "before")
            self.verify(plan, rollback=True)
        else:
            raise PublicationError("Unknown publication phase")


def main():
    require(len(sys.argv) == 5 and sys.argv[1] in ("preflight", "publish", "verify", "rollback"), "Expected PHASE FROM_JSON TO_JSON RECEIPT_DIRECTORY")
    publisher = Publisher(os.environ.get("MENGCENG_WEB_PUBLISHER_CONFIG", "/etc/mengceng/web-publisher.json"), sys.argv[2], sys.argv[3], sys.argv[4])
    lock = Path(publisher.config["lockFile"])
    real_path(str(lock.parent), directory=True)
    require(lock.is_absolute() and lock.resolve() == lock, "Unsafe publisher lock path")
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), "Invalid publisher lock")
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        publisher.phase(sys.argv[1])


if __name__ == "__main__":
    def interrupted(_signal, _frame):
        raise PublicationError("Publication interrupted; keep the recovery receipt")
    signal.signal(signal.SIGTERM, interrupted)
    try:
        main()
    except Exception:
        # curl, Docker, nginx and JSON errors may contain private configuration.
        # Durable private receipts identify the phase; do not expose raw output.
        print("Web publication failed; preserve private receipts and inspect the interrupted phase.", file=sys.stderr)
        sys.exit(1)
