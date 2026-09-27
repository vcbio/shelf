#!/usr/bin/env python3
"""Register a reviewed HTML issue in the public board without pushing it.

The caller must review the candidate and then publish the resulting git commit.
"""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile


def write_atomic(path, content):
    fd, temporary = tempfile.mkstemp(prefix=".weekly-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def register(root, candidate, end, registered):
    if end.weekday() != 6 or registered < end:
        raise ValueError("week end must be Sunday and registration cannot precede it")
    today = dt.date.today()
    if registered > today:
        raise ValueError("future registration date")
    week_id = f"{end.isocalendar().year}-W{end.isocalendar().week:02d}"
    slug = f"lab-weekly-{week_id.lower()}"
    start = end - dt.timedelta(days=6)
    first_weekday = end.replace(day=1).weekday()
    ordinal = (end.day + first_weekday - 1) // 7 + 1
    title = f"{end.month}월 {ordinal}주차 보고서"
    period = f"{start:%Y.%m.%d}–{end:%m.%d}"
    board = root / "d/weekly-reports.json"
    index = root / "shelf.json"
    destination = root / "d" / f"{slug}.html"
    if destination.exists():
        raise ValueError("issue HTML already exists; do not overwrite")
    reports = json.loads(board.read_text(encoding="utf-8"))
    documents = json.loads(index.read_text(encoding="utf-8"))
    if reports.get("version") != 1 or not isinstance(reports.get("reports"), list):
        raise ValueError("weekly board schema changed")
    if any(row.get("week") == week_id for row in reports["reports"]):
        raise ValueError("week is already registered")
    if any(row.get("slug") == slug for row in documents):
        raise ValueError("shelf slug already exists")
    body = candidate.read_bytes()
    if len(body) < 1000 or b"<html" not in body[:200] or b"</html>" not in body[-200:]:
        raise ValueError("candidate is not a complete HTML report")
    decoded = body.decode("utf-8")
    if not re.search(rf"{end.month}월\s+{ordinal}주차", decoded):
        raise ValueError("candidate week title does not match requested issue")
    reports["reports"].append({"week": week_id, "title": title,
                               "registeredAt": registered.isoformat(),
                               "period": period, "href": destination.name})
    reports["reports"].sort(key=lambda row: row["week"], reverse=True)
    documents.append({"slug": slug,
                      "title": f"헬스푸드 데이터랩 · {end.year}년 {title}",
                      "date": registered.isoformat()})
    board_bytes = (json.dumps(reports, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    index_bytes = (json.dumps(documents, ensure_ascii=False, indent=2) + "\n").encode()
    # Every input is validated before the first write. A git worktree is the rollback point.
    write_atomic(destination, body)
    write_atomic(board, board_bytes)
    write_atomic(index, index_bytes)
    return {"week": week_id, "html": str(destination), "board": str(board), "index": str(index)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--week-end", required=True)
    parser.add_argument("--registered-at", required=True)
    args = parser.parse_args()
    print(json.dumps(register(args.root.resolve(), args.candidate.resolve(),
                              dt.date.fromisoformat(args.week_end),
                              dt.date.fromisoformat(args.registered_at)), ensure_ascii=False))


if __name__ == "__main__":
    main()
