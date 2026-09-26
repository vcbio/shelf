#!/usr/bin/env python3
"""Stage the shelf's linked public files without deploying old, unlinked JSON versions."""

import argparse
import collections
import hashlib
import json
import os
import posixpath
import re
import shutil
import subprocess
import urllib.request
from pathlib import Path


JSON_NAME = re.compile(r"[A-Za-z0-9_./-]+\.json")
DECLARED_REF = re.compile(r"\b[A-Z_]+_REF\s*=\s*['\"]([^'\"]+\.json)['\"]")
MAX_BYTES = 1_000_000_000


def pending_json_paths(tracked, root):
    """Carry unpublished JSON commits across canceled intermediate Pages runs."""
    repository = os.environ.get("GITHUB_REPOSITORY")
    head = os.environ.get("GITHUB_SHA")
    token = os.environ.get("GITHUB_TOKEN")
    if not all((repository, head, token)):
        return set()

    def api(path):
        request = urllib.request.Request(
            f"https://api.github.com/repos/{repository}/{path}",
            headers={"Accept": "application/vnd.github+json",
                     "Authorization": f"Bearer {token}",
                     "User-Agent": "vcbio-shelf-pages-stage"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)

    deployments = api("deployments?environment=github-pages&per_page=15")
    previous = None
    for deployment in deployments:
        statuses = api(f"deployments/{deployment['id']}/statuses?per_page=1")
        if statuses and statuses[0]["state"] == "success":
            previous = deployment["sha"]
            break
    if not previous or previous == head:
        return set()
    comparison = api(f"compare/{previous}...{head}")
    if comparison.get("status") not in {"ahead", "identical"}:
        raise ValueError("Pages deployment is not an ancestor of this build")
    files = comparison.get("files", [])
    if len(files) >= 300:
        # GitHub's compare API returns at most 300 files. Diff the two trees
        # locally so a large batch cannot silently drop unpublished JSON.
        subprocess.run(["git", "fetch", "--no-tags", "--depth=1", "origin", previous],
                       cwd=root, check=True, stdout=subprocess.DEVNULL)
        changed = subprocess.check_output(
            ["git", "diff", "--name-only", "--diff-filter=ACMRTUXB", previous, head, "--", "*.json"],
            cwd=root, text=True).splitlines()
        return {path for path in changed if path in tracked}
    return {entry["filename"] for entry in files
            if entry.get("status") != "removed" and entry["filename"].endswith(".json")
            and entry["filename"] in tracked}


def tracked_paths(root):
    raw = subprocess.check_output(["git", "ls-files", "-z"], cwd=root)
    return {Path(os.fsdecode(part)).as_posix() for part in raw.split(b"\0") if part}


def stage(root, output):
    tracked = tracked_paths(root)
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"output is not empty: {output}")
    if "index.html" not in tracked or "shelf.json" not in tracked:
        raise ValueError("shelf index is missing")
    documents = json.loads((root / "shelf.json").read_text(encoding="utf-8"))
    missing_docs = [item["slug"] for item in documents
                    if f"d/{item['slug']}.html" not in tracked]
    if missing_docs:
        raise ValueError(f"indexed documents are missing: {missing_docs[:5]}")

    json_paths = {path for path in tracked if path.endswith(".json")}
    names = collections.defaultdict(list)
    for path in json_paths:
        names[posixpath.basename(path)].append(path)

    def resolve(token, source):
        token = token.replace("\\/", "/").split("?", 1)[0]
        candidates = [token, posixpath.normpath(posixpath.join(posixpath.dirname(source), token))]
        for candidate in candidates:
            if candidate in json_paths:
                return candidate
        same_name = names[posixpath.basename(token)]
        return same_name[0] if len(same_name) == 1 else None

    selected = {path for path in tracked
                if not path.endswith(".json") and not path.startswith(".github/")}
    selected.add("shelf.json")
    # An index can resolve per-ingredient files at runtime. Preserve every generation.
    selected.update(path for path in json_paths if path.startswith("d/main-series/generations/"))
    # The publisher waits for a new YouTube sidecar to be public before updating HTML.
    selected.update(path for path in json_paths if path.startswith("d/youtube-"))
    selected.update(pending_json_paths(tracked, root))

    for source in sorted(path for path in selected if path.endswith((".html", ".js", ".css"))):
        text = (root / source).read_text(encoding="utf-8", errors="replace")
        for token in JSON_NAME.findall(text):
            target = resolve(token, source)
            if target:
                selected.add(target)
        if source in {"d/vcbio-market.html", "d/vcbio-market-fable.html"}:
            for token in DECLARED_REF.findall(text):
                target = resolve(token, source)
                if not target:
                    raise ValueError(f"unpublished dashboard reference: {source}: {token}")
                selected.add(target)

    # Product indexes are split into immutable parts that are fetched after page load.
    for source in sorted(path for path in selected if path.startswith("d/products-")
                         and path.endswith(".json") and not path.endswith("-part.json")):
        data = json.loads((root / source).read_text(encoding="utf-8"))
        for part in data.get("parts", []):
            target = resolve(part["file"], source)
            if not target:
                raise ValueError(f"missing product part: {source}: {part['file']}")
            contents = (root / target).read_bytes()
            if len(contents) != part["bytes"] or hashlib.sha256(contents).hexdigest() != part["sha256"]:
                raise ValueError(f"product part checksum mismatch: {target}")
            selected.add(target)

    size = 0
    for rel in selected:
        path = root / rel
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"missing or linked staged file: {rel}")
        size += path.stat().st_size
    if size >= MAX_BYTES:
        raise ValueError(f"staged site exceeds the 1 GB target: {size} bytes")

    for rel in sorted(selected):
        destination = output / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / rel, destination)
    print(json.dumps({"indexedDocuments": len(documents), "files": len(selected),
                      "jsonFiles": sum(path.endswith(".json") for path in selected),
                      "bytes": size, "output": str(output)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("_site"))
    args = parser.parse_args()
    stage(args.root.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
