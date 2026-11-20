---
name: agent-flight-recorder
description: Audit an agent run, replay tool calls, and debug agent behavior from a saved transcript. Converts Claude Code JSONL or a JSON array of tool-call records into an AETHER-style flight JSON with a six-class taxonomy (read, write, exec, net, sense, call), paired attempt/outcome events, per-class safety stats, and timing. Post-hoc transcript conversion only — not live tracing.
---

# Agent Flight Recorder

Turn a saved tool-call transcript into a compact, auditable flight log in the exact schema of AETHER's `core/kernel.js` (`beginFlight` / `log` / `wrapTool` / `endFlight`).

## Scope — read this first

**This skill converts records that already exist. It does not instrument a running agent.** A `SKILL.md` cannot attach to, wrap, or hook another agent's tool registry, so this package provides no live tracing, no event stream, and no in-run monitoring. It reads one transcript file you supply, classifies the recorded calls, and writes a flight JSON that an AETHER-style recorder would have produced if it had been present. Do not describe its output as a live trace.

Use it to **audit an agent run after the fact**, **replay tool calls** as a timeline, or **debug agent** behavior such as retry loops, unexpected writes, and failed network calls.

## Quick start

```bash
python3 scripts/flight_convert.py \
  --input ./run.jsonl \
  --output ./flight.json \
  --goal "Fix failing checkout tests" \
  --kind agent \
  --status landed
```

- `--input PATH` is required and is the only file the script reads.
- `--output PATH` writes the flight JSON. Omit it to print JSON to stdout.
- `--goal`, `--kind`, `--status` are optional metadata; defaults are `session`, `agent`, `landed`.
- `--help` prints CLI usage. Malformed lines are skipped with a warning; empty or unusable input exits with status 2 and a message on stderr.

The script is Python 3 standard library only. It makes no network calls, reads no environment variables, starts no subprocesses, and scans no directories.

## Accepted input

**1. Claude Code JSONL** — one JSON object per line. The converter pairs `tool_use` blocks (`name`, `input`, `id`) with matching `tool_result` blocks (`tool_use_id`, `content`, `is_error`, optional `duration_ms`) across lines. Tool-result content may be a string or a list of text blocks. Non-tool lines are ignored.

**2. Generic JSON array** — a JSON array of record objects. Recognized keys:

| Field | Accepted keys |
|---|---|
| Tool name | `name`, `tool`, `tool_name`, `syscall`, `function`, `function_name` |
| Arguments | `input`, `args`, `arguments`, `params`, `parameters` |
| Outcome | `output`, `result`, `response`, `content`, `value` |
| Failure | `is_error`, `error`, `failed`, `failure`; `ok: false` / `success: false`; `status: "error"` |
| Duration (ms) | `ms`, `duration_ms`, `duration`, `elapsed_ms`, `elapsed`, `latency_ms`, `took_ms` |
| Timestamp | epoch seconds, epoch millis, or ISO-8601, under `t`, `timestamp`, `time`, `startedAt`, `started_at` |

A single JSON object with a `tool_calls` array is also accepted. Records without a usable tool name are skipped.

## Six-class taxonomy

Verbatim from `kernel.js: classify(name)`: lowercase the tool name, then test these regexes **in order**; the first match wins; otherwise the class is `call`.

| Order | Class | Regex |
|---|---|---|
| 1 | `read` | `/read_file\|fs_read\|fs_list\|fs_stat\|fs_exists\|glob\|grep\|cat/` |
| 2 | `write` | `/write_file\|fs_write\|fs_patch\|fs_mkdir\|fs_rename\|fs_copy\|fs_delete\|unzip\|search_replace/` |
| 3 | `exec` | `/shell\|puter_terminal\|piston\|exec\|run/` |
| 4 | `net` | `/search\|scrape\|crawl\|weather\|github\|slack\|notion\|jira\|trello\|x_\|web_\|email\|cal_\|location\|puter_browse/` |
| 5 | `sense` | `/ocr\|image\|stt\|tts\|mic\|vision\|browser_agent/` |
| 6 | `call` | fallback — no pattern matched |

Order matters: `search_replace` is `write` (tested before `net`), and a name containing both `read_file` and `exec` is `read`.

**Converter-only alias layer.** Host tools such as Claude Code's `Read`, `Bash`, and `Edit` contain none of the AETHER tokens above and would all collapse to `call`. Before applying the unchanged taxonomy, the converter maps well-known host names to equivalent tokens: `read → read_file`, `write/edit/multiedit/notebookedit → write_file`, `apply_patch → fs_patch`, `ls/list → fs_list`, `bash/shell/terminal/powershell/killshell/bashoutput → exec_shell`, `websearch → web_search`, `webfetch/http/fetch → web_fetch`, `screenshot → image`, `computer → browser_agent`. Unknown names pass through untouched and still fall back to `call`. This alias layer is a converter addition, not part of `kernel.js`.

## Output schemas

Flight (`endFlight` shape), all timestamps epoch milliseconds:

```json
{
  "id": "flight_mwplmot8_7bcqgo",
  "goal": "Fix floating-point rounding in checkout totals",
  "kind": "agent",
  "startedAt": 1795185124120,
  "endedAt": 1795185143750,
  "status": "landed",
  "events": [],
  "stats": { "read": 0, "write": 0, "exec": 0, "net": 0, "sense": 0, "call": 0, "errors": 0 }
}
```

`id` follows AETHER's `uid('flight')`: `flight_<base36 epoch ms>_<6 base36 chars>`. `startedAt` is the first recorded call time; `endedAt` is the last event time. `status` defaults to `landed` but accepts any value passed to `--status`.

Event (`log` / `wrapTool` shape):

```json
{
  "t": 1795185130860,
  "syscall": "shell.ERR",
  "class": "exec",
  "detail": "FAIL tests/checkout.test.js · expected 8400, received 8400.000000000002",
  "ok": false,
  "ms": 1840
}
```

- `t` — epoch ms of the event.
- `syscall` — attempt events use the tool name; outcome events append `.ok` or `.ERR`.
- `class` — one of the six classes.
- `detail` — argument preview on attempts; result preview (120 chars) on `.ok`, error message on `.ERR`. Hard-capped at 500 chars. Non-strings render as compact JSON.
- `ok` — attempts and `.ok` are `true`; `.ERR` is `false`.
- `ms` — `null` on attempts; rounded duration on outcomes; `null` if the transcript has no duration.

Each recorded call produces one attempt event plus one outcome event — the same pair `wrapTool()` emits. A call with no matching result in the transcript keeps only its attempt event. Events are sorted chronologically, matching the order `kernel.js` appends them.

## Stats computation

Mirrors `kernel.log()` exactly: **stats count events, not logical calls.**

1. Start `{read:0, write:0, exec:0, net:0, sense:0, call:0, errors:0}`.
2. For every emitted event: increment `stats[event.class]` if it is one of the six classes.
3. If `event.ok` is `false`, increment `stats.errors`.

Consequences: a successful paired call adds **2** to its class (`name` + `name.ok`); a failed paired call also adds **2** to its class and adds **1** to `errors` via `name.ERR`. An unmatched attempt adds **1**. Because every emitted event has one of the six classes, the class counts sum to the event count when nothing has been truncated.

The converter keeps at most the latest **200 events** (`MAX_EVENTS`), as `kernel.js` does. Stats are counted over all events *before* truncation, so they can exceed the visible event count on very long runs. `kernel.js` archives up to 40 flights; this CLI emits one flight object, which the caller can append to such an archive.

## Worked example

Input (`run.json`):

```json
[
  {"name":"read_file","input":{"path":"src/cart.js"},"output":"export function total(items) {...}","ms":14,"t":"2026-11-20T14:32:04Z"},
  {"name":"search_replace","input":{"file":"src/cart.js","from":"a+b","to":"Math.round((a+b)*100)/100"},"output":"1 replacement","ms":35,"t":"2026-11-20T14:32:06Z"},
  {"name":"Bash","input":{"command":"npm test"},"output":"FAIL: 1 test failed","error":true,"ms":820,"t":"2026-11-20T14:32:08Z"}
]
```

Command:

```bash
python3 scripts/flight_convert.py --input run.json --goal "Fix cart totals" --output flight.json
```

Abridged output:

```json
{
  "goal": "Fix cart totals",
  "events": [
    {"t": 1795185124000, "syscall": "read_file", "class": "read", "detail": "{\"path\":\"src/cart.js\"}", "ok": true, "ms": null},
    {"t": 1795185124014, "syscall": "read_file.ok", "class": "read", "detail": "export function total(items) {...}", "ok": true, "ms": 14},
    {"t": 1795185128820, "syscall": "Bash.ERR", "class": "exec", "detail": "FAIL: 1 test failed", "ok": false, "ms": 820}
  ],
  "stats": {"read": 2, "write": 2, "exec": 2, "net": 0, "sense": 0, "call": 0, "errors": 1}
}
```

The six events (three attempts + three outcomes) yield those counts. `Bash` is classed `exec` via the alias layer. See `EXAMPLE_FLIGHT.json` for a complete 24-event flight.

## Fidelity notes

- The transcript is the source of truth for what happened; the flight is a deterministic rendering of it, not an independent measurement. Durations and timestamps are only as accurate as the supplied records.
- Detail previews are lossy by design (80-char arguments, 120-char results, 500-char cap), matching the recorder's own truncation.
- The converter infers failure from explicit error fields. A tool that reported failure only in free-form output text is recorded as `.ok`; review `detail` when auditing.
