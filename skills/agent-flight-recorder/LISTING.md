# Agent Flight Recorder

**Turn a saved agent transcript into an auditable AETHER-style flight log — six-class tool grammar, per-class stats, and a replayable timeline.**

## What it does

Point it at a Claude Code JSONL transcript or a JSON array of tool-call records. It classifies every call into `read`, `write`, `exec`, `net`, `sense`, or `call`, pairs each attempt with its `.ok` / `.ERR` outcome, measures elapsed time where the transcript provides it, and emits one flight JSON matching AETHER's kernel schema: `{id, goal, kind, startedAt, endedAt, status, events[], stats{...}}`.

Use the result to audit an agent run, replay tool calls in order, or debug agent behavior — retry loops, unexpected writes, failed network calls — without re-running anything. Includes a stdlib-only Python CLI, a worked example in `SKILL.md`, and a complete sample flight.

## What it does NOT do

**Post-hoc conversion only.** This skill reads a transcript that already exists. It does not and cannot instrument, hook, or wrap another agent's tool registry; a `SKILL.md` has no access to a host agent's runtime. There is no live tracing, no in-run event stream, and no automatic capture. If your transcript lacks timestamps or durations, the flight cannot invent them. Failures expressed only as free-form output text are not inferred.

## Who it's for

- Developers reviewing what an agent actually did before merging its work.
- Teams building eval, safety, or incident-review pipelines around agent runs.
- Anyone who wants AETHER's flight-recorder format for runs recorded elsewhere.

## Differentiators

1. **Six-class grammar, not a flat log.** The exact ordered regex taxonomy from AETHER's kernel (`read | write | exec | net | sense | call`), plus a documented alias layer for native host tools like `Read`, `Bash`, and `Edit`. Order-aware: `search_replace` is a write, not a web search.
2. **Per-class safety stats.** `stats` mirrors `kernel.log()` semantics — every event counts toward its class, `.ERR` events increment `errors`. See at a glance whether a run was mostly reads or quietly did 40 writes.
3. **Local-first, no account, no cloud.** One Python file, standard library only. Reads only the path you pass to `--input`, writes only where you say. No network calls, no environment reads, no subprocesses, no directory scanning.

## Price

Intended price: **$5**. Buyer pays $5; creator keeps $3.50 (Agensi takes 30%).
