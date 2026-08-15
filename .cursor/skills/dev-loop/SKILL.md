---
name: dev-loop
description: The deterministic delivery pipeline for a unit of work — sequences Plan, Build, Verify, Ship, delegating each phase to whatever capability satisfies its contract and stopping only at the human checkpoints (spec approval, merge approval). A thin orchestrator that owns phase order and gates, never the work itself. Fully agnostic and pluggable: it names no specific skill or tool and mandates no fixed content — each phase is defined by a functional contract, so any planning, testing, or gate capability that meets the contract slots in, on any codebase. Use as the entry point for building or shipping a unit of work, to resume in-flight work, or whenever work should follow the standard lifecycle instead of ad-hoc coding.
metadata:
  author: julian
  version: "0.1.0"
---

# Dev Loop

## Overview

`dev-loop` is the single, repeatable pipeline every unit of work goes through, so delivery is
deterministic regardless of which agent or session drives it. It is **thin**: it owns the *order of
phases* and the *gates between them*, and delegates the actual work to whatever capability fills
each phase. It knows nothing project-specific — no language, framework, or domain — and it names no
other skill. Each phase is defined by a **contract**; any tool that meets a contract slots in.

The goal is to remove the human from the loop except where judgment is genuinely required. Two
things enforce that: this skill (the happy path) and a merge gate (the guardrail). If they ever
disagree, the gate wins — nothing should be able to argue its way past a red or absent gate.

## The phases (each a contract, not a named skill)

| Phase | The slot's contract | Advance when |
|-------|---------------------|--------------|
| **Plan** | produce a reviewable spec artifact and declare the merge gate for this work | the spec (what/why + how it will be verified) is approved |
| **Build** | implement to the approved spec | it compiles/builds and the work's status reflects "in progress" |
| **Verify** | run the project's regression check (a runnable pass/fail command) and cover any newly-affected invariant | the check is green |
| **Ship** | the gate: work is consistent, the verify check is green, and a human approved the merge | merged to the integration branch |

Rules:
- **No phase skipping and no reordering.** You cannot Build without an approved spec; you cannot
  Ship without a green Verify and a satisfied gate.
- **A seam touched in Build forces a full re-verify** — run the whole regression check and cover any
  property that now depends on the change. This is the phase that catches cross-feature breakage.
- Make the current phase legible from the work's own tracked state, so a cold session can resume
  mid-loop rather than restarting.

## The gate contract (the guardrail)

`dev-loop` requires a mechanism that **blocks Ship** unless: the verify check is green and a human
approved the merge. It is indifferent to *how* that gate is implemented — a pre-merge hook, a CI
check, a review step. If the project provides one, `dev-loop` respects it. If none exists,
`dev-loop` refuses to Ship past a red or absent check and says so, rather than merging on trust.

## Slots — functional integration (no skill names)

`dev-loop` fills each phase from a capability discovered by **role**, never by name:

- a **planning** capability — produces a reviewable spec + declares the gate. Absent → plan inline
  and write a lightweight gate.
- a **verify** capability — exposes a runnable pass/fail regression command. Absent → Verify
  degrades to a documented manual check, and flag the gap loudly.
- a **gate** mechanism — blocks the merge when the contract isn't met.

Any skill or tool that provides a role plugs in; `dev-loop` references none. This is what makes it
portable across codebases and composable with whatever else is installed.

## The only human checkpoints

Surface to the user at exactly two points; automate everything else:
1. **After Plan** — approve the spec before code is written.
2. **Before Ship** — approve the merge to the integration branch.

Do not ask the user to decide things the spec, the code, or sensible defaults already answer. If a
genuine fork appears mid-loop, resolve it by looping back to Plan (amend the spec), not by
improvising in Build.

## Resuming a loop (cold start)

1. Read the project's own bootstrap/context and its invariant catalog, if present.
2. Infer the current phase from the work's tracked state.
3. Re-enter at that phase; don't restart the loop.

## Boundaries — what this is NOT

- **Not a doer.** It writes no specs, no code, no tests directly — it invokes the capability filling
  each phase. Any project-specific knowledge that creeps in belongs in a slot, not here.
- **Not the paper trail or the gate mechanics.** It requires those gates to exist and pass; it does
  not implement them.
- **Not rigid about content.** It mandates *phases + gates* (universal), never a fixed list of specs
  or invariants (per-project). Each repo declares its own; the loop only requires a gate exists and
  is green before Ship.
