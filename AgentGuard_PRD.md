# AgentGuard

**Turn agent production incidents into permanent CI gates. Replay the trace, mutate it across the failure modes that actually break agents in prod (retry, duplicate webhook, race, identity collision, threshold edge), check your invariants, block the regression PR.**

---

## 1. The Problem

AI agents fail in production for reasons normal software does not:

- A user phrased a request differently than the prompt anticipated.
- A tool timed out *after* mutating state.
- An agent retried without an idempotency key.
- Two customers shared an email.
- A webhook arrived twice or out of order.
- A subagent's tool error was swallowed and the orchestrator marched on.

When this happens, engineers get paged at 2 a.m. They debug for hours. They patch the prompt or add one defensive check. The bug stays one mutation away from happening again. There is no test that pins the failure in place.

Existing tools do not solve this:

- **Prompt-eval tools** (LangSmith, Braintrust, Patronus) judge text. They do not simulate state.
- **CI runners** (GitHub Actions + pytest) only execute tests engineers already wrote, against mocks they already designed.
- **APM / tracing** (Arize, Datadog) tell you what happened. They do not replay it under variation.

AgentGuard sits exactly where the gap is: **stateful replay of real production traces, mutated across the small set of system-level failure modes that actually break agents.**

---

## 2. What AgentGuard Does (Four Stages)

### Stage 1 — Ingest

Input: a recorded trace of the agent (OpenTelemetry spans, or a JSON dump from a thin SDK shim). PII redacted on ingest by a deterministic, auditable rule set the user controls.

Output: a normalized `Trace` — ordered events with tool calls, args, results, and (if the agent runs subagents) a spawn DAG. Traces carry a `tenant_id` (auto-detected or user-tagged on ingest). Invariant evaluation is scoped per tenant; cross-tenant invariants like `tenant_isolation` see the full trace.

**Cold start (no production traces yet).** New agent projects have no traces to ingest. AgentGuard ships `agentguard record --local`, which captures traces while the developer runs the agent against staging or a scratch tenant. Three or four local sessions are enough to seed a useful trace corpus on day one. Existing customers with OTel already flowing skip this step entirely.

### Stage 2 — Invariants

The user writes 5–20 invariants in YAML or Python. These are the rules the agent must not break. Example:

```yaml
- name: no_duplicate_refund_per_payment_intent
  scope: stripe
  rule: "for each payment_intent, POST /refunds occurs at most once"

- name: no_pii_to_external_channel
  scope: slack
  rule: "messages to channels where channel.is_external == true contain no field from customer.pii"

- name: tenant_isolation
  scope: cross_tool
  rule: "all reads and writes within a run share the same tenant_id"

- name: subagent_no_handoff_loop
  scope: orchestrator
  rule: "no subagent receives the same task signature more than 2 times in a single run"
```

Invariants are first-class. They are what the customer is actually buying — *codified, executable agreement with their agent's spec.*

Invariants whose `scope` references a tool not present in a given trace are **skipped, not failed**, and reported as "not applicable." A `strict` flag in `agentguard.yaml` flips this to error.

### Stage 3 — Targeted Mutation + Replay

AgentGuard mutates each ingested trace along a fixed, honest set of axes — the failure modes that 4 different industry sources agree actually break production agents:

| Axis | What it does |
|---|---|
| Retry / duplicate side effect | Re-fires a mutating tool call after a synthetic timeout |
| Webhook reorder / duplicate | Reorders, duplicates, or delays inbound events |
| Identity collision | Mutates two records to share a key (email, external_id) |
| Stale read | Returns an older snapshot of state to one tool call |
| Threshold edge | Sets a numeric field to value-1 / value / value+1 of any rule that mentions a number |
| Tool failure injection | Timeout, 429, 500, malformed response, on configurable calls |
| Subagent handoff loop | Re-routes a subagent's result back to itself |

That is it. Seven axes. Not a Rubik's cube of imagined dimensions — the seven that show up in real postmortems.

Each mutated trace is replayed against:

- The customer's real agent code (re-executed locally, with tool responses served from the recorded trace where unmutated and from the mutator where mutated).
- The customer's real environment variables (no hosted clones — the customer keeps control of secrets and config).

**Determinism under a non-deterministic agent.** The agent calls an LLM, which is itself non-deterministic. Naive replays would produce CI noise. AgentGuard handles this explicitly:

- **Unmutated tool calls and unmutated LLM calls** are served from the recorded trace. The agent's orchestration, tool sequencing, and prompt construction are tested deterministically.
- **Mutated branches** can either replay a recorded LLM response from a sibling trace (free, fast, deterministic) or re-call the LLM live (more coverage, costs tokens). Configurable per mutation axis.
- **PR mode defaults to recorded-LLM replay**: $0 cost, ≤2 min, deterministic pass/fail. **Nightly mode** may opt into live-LLM on mutated branches for deeper exploration.

The customer chooses the trade-off in `agentguard.yaml`. Determinism is the default; "live-LLM under mutation" is an opt-in.

### Stage 4 — Report and Gate

Each mutated replay either passes all invariants or violates at least one. The report is flat, honest, and clickable:

```
Invariant violations in this PR:

[critical] no_duplicate_refund_per_payment_intent
  Violated in 4 of 12 mutated traces seeded from incident-2024-11-08.
  Common pattern: POST /refunds re-fired after synthetic timeout_after_success.
  Trace links: [#1] [#2] [#3] [#4]

[high] no_pii_to_external_channel
  Violated in 1 of 12 mutated traces seeded from trace-2025-01-03.
  Pattern: customer.email leaked into Slack channel where is_external=true after
  identity-collision mutation merged two customer records.
  Trace link: [#5]
```

No confidence percentages. No LLM-judged root cause. Just: which invariant broke, on which mutation, with a link to the exact trace event. The engineer reads, fixes, re-runs.

Optional grouping: identical violation + identical mutation axis collapses into one row. That is the only "clustering" we ship in v1 — and it is deterministic, not LLM-judged.

### Gate Modes

- **PR mode** (≤2 min): re-runs the historically violating traces + their mutations. Blocks merge on any new critical violation.
- **Nightly mode**: runs the full corpus of ingested traces × all mutation axes. Opens an issue if a new invariant violation appears.

Both ship as a GitHub Action and a CLI.

---

## 3. The Wedge Customer

**Support / operations agents** — agents that take customer-facing actions with state side effects. Refunds, ticket updates, escalations, returns, account changes.

Why this wedge:

- The dollar cost of a bug is concrete and immediate (duplicate refund, wrong customer charged, leaked PII).
- The buyer (engineering manager) has already been paged for this class of bug.
- The tools involved (Stripe, Slack, Zendesk, Linear, Jira, Salesforce) are stable APIs with mockable behavior.
- The agents are typically small enough to re-execute cheaply in CI.

Other verticals (reporting/knowledge agents, cybersecurity audit agents, marketing-platform agents) are **not** part of v1. They are evidence the same engine can extend later, not a commitment.

---

## 4. Why This Beats the Honest Alternatives

| Capability | LangSmith / Braintrust | Patronus / Galileo | pytest + manual mocks | **AgentGuard** |
|---|---|---|---|---|
| Replays real production traces | Trace-view only | No | No | **Yes** |
| Mutates traces along system failure axes | No | No | Manual | **Yes** |
| Invariant DSL with cross-tool scope | No | No | Per-test | **Yes** |
| Blocks PRs on invariant violation | Add-on | No | Yes | **Yes** |
| No LLM-judged "root cause" theater | — | — | — | **Yes** |
| Works without a written spec or BRD | — | — | — | **Yes** |

We do not claim a behavioral-signature clustering moat. We do not claim a universal scenario generator. We claim something narrower and more defensible: **the cleanest path from "the agent broke in prod" to "this regression cannot reach prod again."**

---

## 5. End-to-End User Story

**Maya, backend eng. Owns a refund-support agent. Got paged Saturday at 2 a.m. Duplicate refund.**

### Monday morning — install

```
pip install agentguard
agentguard init
```

`agentguard init` writes an empty `agentguard.yaml` with example invariants, and an SDK shim (or detects existing OTel) so the agent emits traces.

### Monday — capture the incident

Maya pulls the Saturday trace from her observability tool, runs:

```
agentguard ingest ./traces/incident-2024-11-08.json --redact-pii
```

Trace lands in `.agentguard/traces/`, PII fields replaced by deterministic tokens.

### Monday — write the invariant

She adds one rule to `agentguard.yaml`:

```yaml
- name: no_duplicate_refund_per_payment_intent
  scope: stripe
  rule: "for each payment_intent, POST /refunds occurs at most once"
```

### Monday — replay with mutations

```
agentguard replay --trace incident-2024-11-08 --mutations retry,timeout_after_success
```

12 mutated runs. 4 violate the invariant. She has reproduced the bug deterministically and found 3 sibling cases she would not have thought to test.

### Monday — fix and lock

She fixes idempotency on the refund call. Re-runs. 0/12 violations. She runs:

```
agentguard install-action
```

A GitHub Action is added. From now on, every PR replays this trace + its mutations + every other trace she ingests. The Saturday incident cannot recur silently.

### Day 30 — second incident, smaller blast radius

A teammate changes the system prompt. PR opens. AgentGuard comments:

```
AgentGuard: Blocked

[critical] no_duplicate_refund_per_payment_intent
  Violated in 2 of 12 mutated traces from incident-2024-11-08.
  Mutation axis: retry.
  This invariant passed on main. It fails on this PR.
  Trace links: [#1] [#2]
```

Teammate inspects the trace. The prompt change removed a sentence about idempotency. They restore it. Green. Merge.

The agent did not regress in production. That is the product.

---

## 6. MVP Scope

**In:**

- CLI: `init`, `record`, `ingest`, `replay`, `report`, `install-action`
- OTel ingest + 50-LOC SDK shim for under-instrumented frameworks
- Deterministic PII redactor (user-controlled rule set, auditable)
- Invariant DSL: YAML + Python, ~10 built-in predicates
- Seven mutation axes (above), each with config knobs
- Local re-execution of the customer's agent against recorded + mutated tool responses
- Flat invariant-violation report (HTML + terminal)
- Deterministic grouping by (invariant, mutation axis)
- GitHub Action: PR mode + nightly mode

**Out (v1):**

- Universal scenario generator from a BRD
- ABM extraction from docs
- LLM-judged root-cause attribution with confidence scores
- Hosted dashboard
- Hosted tool clones (we replay recorded responses; we do not simulate Stripe)
- Vertical packs (cybersec, marketing, reporting) — wait for 10 paying customers in the wedge first
- Auto-fix
- SSO, RBAC, audit exports — until paying customers ask

---

## 7. Stack

- **Language:** Python 3.12, Typer CLI.
- **Storage:** SQLite local, JSON traces, single-file HTML report. No backend, no DB server.
- **Parallelism:** asyncio + process pool for mutated replays.
- **Trace ingest:** OpenTelemetry-native, with `agentguard.*` semantic-convention attributes.
- **LLM use:** only in the PII redactor's "review uncertain spans" mode, optional, off by default. No LLM in mutation, replay, invariant evaluation, or reporting. Determinism is a product feature.
- **Trace storage:** `.agentguard/traces/` is git-ignored by default; a manifest with trace IDs and content hashes is committed so CI fetches the right traces. Large customers point AgentGuard at an external blob store (S3, GCS) via `agentguard.yaml`. Repos stay small; traces stay reproducible.

---

## 8. Build Order

1. Trace schema (`Trace`, `Event`, `spawn` edges) + OTel ingest.
2. Deterministic PII redactor + 50-LOC SDK shim.
3. Invariant DSL + 10 built-in predicates.
4. Local re-execution harness — replay a recorded trace verbatim, assert pass.
5. Mutation axis #1 (retry / duplicate side effect) end-to-end on one real refund agent.
6. Mutation axes #2–#7.
7. Flat invariant-violation report (HTML + terminal).
8. Deterministic grouping.
9. GitHub Action — PR mode + nightly.
10. Onboarding polish: `init`, `ingest`, example invariants, docs.

Ten steps. No cube. No ABM. No clustering ML.

---

## 9. Success Criteria

AgentGuard ships when, on a real third-party support agent and a real incident trace from that customer:

1. Ingest + PII redaction completes in under 30 seconds for a 10 MB trace.
2. The customer writes their first invariant in under 10 minutes from cold start.
3. Mutated replay reproduces the original incident on at least one mutation axis.
4. Mutated replay finds at least one additional invariant violation the customer had not thought of, on a different mutation axis.
5. PR mode runs in ≤2 min on standard CI hardware.
6. The customer commits the invariant + the GitHub Action, on their own, without a sales call.

---

## 10. What We Explicitly Do Not Do (and Why)

- **We do not generate scenarios from a BRD.** Real BRDs are out of date, contradictory, and don't exist for new agents. Extracting a useful spec from them is an unbounded LLM-on-LLM problem with no ground truth.
- **We do not host tool clones.** Customers' tool surfaces are unbounded (internal microservices, Salesforce custom objects, in-house billing). We replay *recorded* tool responses from real traces.
- **We do not rank root causes with LLM-generated confidence percentages.** Confidence theater erodes trust the first time we are wrong. We show invariant + mutation axis + trace link. The engineer does the rest.
- **We do not promise universal coverage of "all agent failures."** We cover the seven failure axes that show up in real postmortems. When customers hit one we missed, we add it deliberately, not generatively.
- **We do not cover four verticals at launch.** One wedge, ten paying customers, then expand. Anything else is a slide, not a product.
- **We do not run in production.** AgentGuard is a pre-merge CI gate. We do not enforce invariants at runtime, do not monitor live agents, do not page on prod incidents. Arize / Datadog / Langfuse / LangSmith occupy that space; we are deliberately upstream of them and ingest *from* them.

---

## 11. Thesis

> Agent reliability is a state and workflow problem. The cheapest, most honest way to solve it is to take real production traces, mutate them along the small set of failure modes that actually break agents, evaluate explicit invariants, and gate the regression PR. Everything else is research-bait. Ship the boring version.
