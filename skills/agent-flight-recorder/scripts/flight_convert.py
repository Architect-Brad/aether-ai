#!/usr/bin/env python3
"""Convert a recorded tool-call transcript into an AETHER-style flight JSON.

Reads one explicitly supplied file (Claude Code JSONL or a JSON array of
tool-call records) and writes a single flight object matching the schema in
AETHER core/kernel.js. Conversion is post-hoc; it does not attach to or
observe a running agent.
"""

import argparse
import json
import math
import random
import re
import sys
import time
from datetime import datetime

CLASSES = ("read", "write", "exec", "net", "sense", "call")
MAX_EVENTS = 200

# Ordered tool-name patterns mirrored from kernel.js classify(). Order matters:
# the first matching class wins (e.g. "search_replace" is write, not net).
CLASS_PATTERNS = (
    ("read", re.compile(r"read_file|fs_read|fs_list|fs_stat|fs_exists|glob|grep|cat")),
    ("write", re.compile(r"write_file|fs_write|fs_patch|fs_mkdir|fs_rename|fs_copy|fs_delete|unzip|search_replace")),
    ("exec", re.compile(r"shell|puter_terminal|piston|exec|run")),
    ("net", re.compile(r"search|scrape|crawl|weather|github|slack|notion|jira|trello|x_|web_|email|cal_|location|puter_browse")),
    ("sense", re.compile(r"ocr|image|stt|tts|mic|vision|browser_agent")),
)

# Converter-only normalization: host tools (e.g. Claude Code's "Read"/"Bash")
# do not contain AETHER tokens, so map well-known names onto equivalent tokens
# before applying the unchanged taxonomy above. Unknown names pass through.
ALIASES = {
    "read": "read_file",
    "write": "write_file",
    "edit": "write_file",
    "multiedit": "write_file",
    "notebookedit": "write_file",
    "apply_patch": "fs_patch",
    "ls": "fs_list",
    "list": "fs_list",
    "bash": "exec_shell",
    "shell": "exec_shell",
    "terminal": "exec_shell",
    "powershell": "exec_shell",
    "killshell": "exec_shell",
    "bashoutput": "exec_shell",
    "websearch": "web_search",
    "webfetch": "web_fetch",
    "http": "web_fetch",
    "fetch": "web_fetch",
    "screenshot": "image",
    "computer": "browser_agent",
}

NAME_KEYS = ("name", "tool", "tool_name", "syscall", "function", "function_name")
ARGS_KEYS = ("input", "args", "arguments", "params", "parameters")
OUTPUT_KEYS = ("output", "result", "response", "content", "value")
TIME_KEYS = ("t", "timestamp", "time", "startedAt", "started_at")
DURATION_KEYS = ("ms", "duration_ms", "duration", "elapsed_ms", "elapsed", "latency_ms", "took_ms")
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def classify(name):
    """Return one of the six AETHER classes for a tool name."""
    text = str(name or "").lower()
    text = ALIASES.get(text, text)
    for cls, pattern in CLASS_PATTERNS:
        if pattern.search(text):
            return cls
    return "call"


def _compact_json(value):
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except (TypeError, ValueError):
        return str(value)


def _text(value, limit):
    if value is None:
        return ""
    text = value if isinstance(value, str) else _compact_json(value)
    return text[:limit]


def _js_round(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(number):
        return None
    return int(number + 0.5) if number >= 0 else int(number - 0.5)


def _to_ms(value):
    """Coerce epoch seconds, epoch millis, or an ISO-8601 string to epoch ms."""
    if value is None or isinstance(value, bool):
        return None
    number = None
    if isinstance(value, (int, float)):
        try:
            number = float(value)
        except (OverflowError, ValueError):
            return None
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.lstrip("-").isdigit():
            try:
                number = float(raw)
            except (OverflowError, ValueError):
                return None
        else:
            iso = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
            try:
                parsed = datetime.fromisoformat(iso)
            except ValueError:
                return None
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=datetime.timezone.utc)
            return int(parsed.timestamp() * 1000)
    else:
        return None
    if not math.isfinite(number):
        return None
    return int(number * 1000) if abs(number) < 1e11 else int(number)


def _duration_ms(record):
    if not isinstance(record, dict):
        return None
    for key in DURATION_KEYS:
        if key not in record or record[key] is None:
            continue
        value = record[key]
        if isinstance(value, str):
            value = value.strip()
            if value.endswith("ms"):
                value = value[:-2]
            elif value.endswith("s"):
                try:
                    value = float(value) * 1000
                except ValueError:
                    continue
        result = _js_round(value)
        if result is not None and result >= 0:
            return result
    return None


def _is_failure(record):
    if not isinstance(record, dict):
        return False
    for key in ("is_error", "error", "failed", "failure"):
        if record.get(key):
            return True
    for key in ("ok", "success"):
        if key in record and record[key] is False:
            return True
    status = record.get("status")
    if isinstance(status, str) and status.lower() in ("error", "err", "failed", "failure", "fail"):
        return True
    return False


def _generic_record(raw):
    """Normalize one record dict into the converter's internal shape."""
    name = None
    for key in NAME_KEYS:
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            name = value.strip()
            break
    args = None
    for key in ARGS_KEYS:
        if key in raw and raw[key] is not None:
            args = raw[key]
            break
    output = None
    for key in OUTPUT_KEYS:
        if key in raw and raw[key] is not None:
            output = raw[key]
            break
    stamp = None
    for key in TIME_KEYS:
        if key in raw and raw[key] is not None:
            stamp = _to_ms(raw[key])
            if stamp is not None:
                break
    return {
        "name": name,
        "args": args,
        "output": output,
        "failed": _is_failure(raw),
        "ms": _duration_ms(raw),
        "t": stamp,
    }


def _looks_like_call(obj):
    has_name = any(isinstance(obj.get(k), str) and obj.get(k).strip() for k in NAME_KEYS)
    return has_name and any(k in obj for k in ARGS_KEYS)


def _flatten_content(content):
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text", item.get("content"))
                if text is not None:
                    parts.append(_text(text, 500))
        return "\n".join(parts)
    if isinstance(content, dict):
        return _compact_json(content)
    return str(content)


def parse_jsonl(lines):
    """Extract tool calls and their results from Claude Code JSONL lines."""
    uses = {}
    results = {}
    records = []
    skipped = 0
    for line in lines:
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            skipped += 1
            continue
        if not isinstance(obj, dict):
            skipped += 1
            continue

        if obj.get("type") == "tool_result" and obj.get("tool_use_id"):
            results[obj["tool_use_id"]] = obj

        message = obj.get("message")
        if isinstance(message, dict) and isinstance(message.get("content"), list):
            blocks = message["content"]
        elif isinstance(obj.get("content"), list):
            blocks = obj["content"]
        else:
            blocks = [obj]

        saw_use = False
        for block in blocks:
            if not isinstance(block, dict):
                continue
            kind = block.get("type")
            if kind == "tool_use":
                saw_use = True
                tool_id = block.get("id")
                name = block.get("name")
                if isinstance(name, str) and name.strip():
                    record = _generic_record({
                        "name": name,
                        "input": block.get("input"),
                        "t": obj.get("timestamp", obj.get("t")),
                    })
                    if tool_id:
                        uses[tool_id] = record
                    records.append(record)
            elif kind == "tool_result" and block.get("tool_use_id"):
                results[block["tool_use_id"]] = block

        if not saw_use and obj.get("type") != "tool_result" and _looks_like_call(obj):
            records.append(_generic_record(obj))

    for tool_id, record in uses.items():
        result = results.get(tool_id)
        if not result:
            continue
        record["output"] = _flatten_content(result.get("content"))
        record["failed"] = _is_failure(result)
        elapsed = _duration_ms(result)
        if elapsed is not None:
            record["ms"] = elapsed
    return records, skipped


def parse_array(data):
    """Normalize a generic JSON array of tool-call records."""
    records = []
    for item in data if isinstance(data, list) else []:
        if not isinstance(item, dict):
            continue
        calls = item.get("tool_calls")
        if isinstance(calls, list):
            for call in calls:
                if not isinstance(call, dict):
                    continue
                fn = call.get("function") if isinstance(call.get("function"), dict) else call
                raw = {
                    "name": fn.get("name", call.get("name")),
                    "input": fn.get("arguments", call.get("input")),
                    "output": item.get("output", item.get("result")),
                    "t": item.get("t", item.get("timestamp")),
                }
                for key in ("ms", "duration_ms", "error", "ok", "success"):
                    if key in item:
                        raw[key] = item[key]
                record = _generic_record(raw)
                if record["name"]:
                    records.append(record)
            continue
        record = _generic_record(item)
        if record["name"]:
            records.append(record)
    return records


def _args_preview(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        preview = " | ".join(_text(part, 80) for part in value)
    else:
        preview = _text(value, 80)
    return preview[:500]


def _outcome_detail(value, failed):
    if failed and isinstance(value, dict):
        value = value.get("message", value.get("error", value))
    return _text(value, 500 if failed else 120)


def _event(stamp, syscall, cls, detail, ok, ms):
    return {
        "t": stamp,
        "syscall": syscall,
        "class": cls,
        "detail": detail[:500],
        "ok": bool(ok),
        "ms": ms,
    }


def _base36(number):
    if number == 0:
        return "0"
    digits = []
    while number:
        number, rem = divmod(number, 36)
        digits.append(B36[rem])
    return "".join(reversed(digits))


def _flight_id():
    suffix = "".join(random.choice(B36) for _ in range(6))
    return "flight_" + _base36(int(time.time() * 1000)) + "_" + suffix


def build_flight(records, goal, kind, status):
    """Emit attempt/outcome event pairs and kernel-style per-class stats."""
    prepared = []
    for record in records:
        name = record.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        name = name.strip()
        prepared.append({
            "name": name,
            "cls": classify(name),
            "args": record.get("args"),
            "output": record.get("output"),
            "failed": bool(record.get("failed")),
            "ms": record.get("ms"),
            "t": record.get("t"),
        })

    if prepared:
        base = min((item["t"] for item in prepared if item["t"] is not None), default=int(time.time() * 1000))
    else:
        base = int(time.time() * 1000)
    cursor = base - 1
    for item in prepared:
        if item["t"] is None:
            item["t"] = cursor + 1000
        if item["t"] <= cursor:
            item["t"] = cursor + 1
        cursor = item["t"]

    all_events = []
    for item in prepared:
        all_events.append(_event(item["t"], item["name"], item["cls"], _args_preview(item["args"]), True, None))
        suffix = ".ERR" if item["failed"] else ".ok"
        all_events.append(_event(
            item["t"] + (item["ms"] if item["ms"] is not None else 1),
            item["name"] + suffix,
            item["cls"],
            _outcome_detail(item["output"], item["failed"]),
            not item["failed"],
            item["ms"],
        ))

    # kernel.js appends events in real time, so long calls can interleave with
    # later attempts. Preserve that chronological order here.
    all_events.sort(key=lambda event: event["t"])

    stats = {cls: 0 for cls in CLASSES}
    stats["errors"] = 0
    for event in all_events:
        if event["class"] in CLASSES:
            stats[event["class"]] += 1
        if not event["ok"]:
            stats["errors"] += 1

    started = prepared[0]["t"] if prepared else base
    ended = max((event["t"] for event in all_events), default=started)
    events = all_events[-MAX_EVENTS:] if len(all_events) > MAX_EVENTS else all_events

    return {
        "id": _flight_id(),
        "goal": goal or "session",
        "kind": kind or "agent",
        "startedAt": started,
        "endedAt": ended,
        "status": status or "landed",
        "events": events,
        "stats": stats,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="flight_convert.py",
        description="Convert a recorded tool-call transcript into an AETHER-style flight JSON.",
    )
    parser.add_argument("--input", required=True, metavar="PATH",
                        help="Claude Code JSONL transcript or JSON array of tool-call records.")
    parser.add_argument("--output", metavar="PATH",
                        help="Write flight JSON to this path. Omit to print to stdout.")
    parser.add_argument("--goal", default="session", help="Flight goal (default: session).")
    parser.add_argument("--kind", default="agent", help="Flight kind (default: agent).")
    parser.add_argument("--status", default="landed", help="Flight status (default: landed).")
    args = parser.parse_args(argv)

    try:
        with open(args.input, "r", encoding="utf-8") as handle:
            text = handle.read()
    except OSError as exc:
        print("flight_convert: cannot read input: %s" % exc, file=sys.stderr)
        return 2
    except UnicodeDecodeError as exc:
        print("flight_convert: input is not UTF-8 text: %s" % exc, file=sys.stderr)
        return 2

    stripped = text.strip()
    if not stripped:
        print("flight_convert: input is empty", file=sys.stderr)
        return 2

    skipped = 0
    if stripped.startswith("["):
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError as exc:
            print("flight_convert: invalid JSON array: %s" % exc, file=sys.stderr)
            return 2
        if not isinstance(data, list):
            print("flight_convert: expected a JSON array of records", file=sys.stderr)
            return 2
        records = parse_array(data)
    elif stripped.startswith("{"):
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            records, skipped = parse_jsonl(stripped.splitlines())
        else:
            records = parse_array([data]) if isinstance(data, dict) else []
    else:
        records, skipped = parse_jsonl(stripped.splitlines())

    if skipped:
        print("flight_convert: skipped %d malformed line(s)" % skipped, file=sys.stderr)
    if not records:
        print("flight_convert: no tool calls found in input", file=sys.stderr)
        return 2

    flight = build_flight(records, args.goal, args.kind, args.status)
    payload = json.dumps(flight, indent=2, ensure_ascii=False) + "\n"

    if args.output:
        try:
            with open(args.output, "w", encoding="utf-8") as handle:
                handle.write(payload)
        except OSError as exc:
            print("flight_convert: cannot write output: %s" % exc, file=sys.stderr)
            return 2
    else:
        sys.stdout.write(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
