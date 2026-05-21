# AgentGuard

**A Rubik's-cube fuzzer for AI agents. Reads your product spec, generates every realistic user path, runs them against stateful clones of your tools, clusters failures, and tells you the most likely root cause — before your agent touches production.**

---

## 1. The Problem

AI agents in production do not fail like normal software. They fail because:

- A user phrased a request differently than expected.
- A tool returned data in an order the prompt did not anticipate.
- An API timed out *after* mutating state.
- Two customers shared an email.
- A webhook arrived twice.
- The agent retried without an idempotency key.
- The agent took a 7-step path the developer never imagined.

No existing tool tests this. Prompt-eval tools (LangSmith, Braintrust, Patronus) judge text outputs. CI runners (GitHub Actions) only execute tests you already wrote. Nobody simulates **stateful tool side effects across every realistic workflow permutation** — which is where real agents break.

AgentGuard does exactly that.

---

## 2. What AgentGuard Does (Five Stages)

### Stage 1 — Comprehension

Input: project BRD, PRD, README, or a short product description. Optional: agent source, tool schemas, OpenAPI specs.

AgentGuard extracts:

- Domain entities (customer, payment, ticket, channel, order)
- Tools the agent uses (Slack, Stripe, Linear, internal APIs)
- User intents (refund, escalate, resolve, notify, query)
- Business rules (no duplicate refund, no PII in external channels, approval thresholds, tenant isolation)
- Tenancy and permission model

Output: a structured **Agent Behavior Model** (ABM) — the spec of what the agent is *supposed* to do, in machine-readable form.

### Stage 2 — Scenario Synthesis (the Rubik's Cube)

For each user intent, AgentGuard explores a multi-dimensional state space:

| Axis | Variants |
|---|---|
| Input phrasing | direct, vague, multi-intent, contradictory, polite, hostile, prompt-injected |
| Data state | clean, missing field, duplicate record, stale read, cross-tenant, archived |
| Identity | exact match, similar name, two customers same email, deleted user |
| Tool failure | none, timeout, timeout_after_success, 429, 500, malformed, stale, out-of-order webhook |
| Sequence | normal, race, retry storm, duplicate webhook, delayed event |
| Scale | tiny, normal, near-threshold, above-threshold |
| Policy edge | well within, exactly at boundary, just over, repeated near-misses |

A combinatorial generator picks N axes per scenario and produces variants. A **mutation engine** then does coverage-guided random walks — seeded by failures from prior runs — to surface paths the developer never wrote a test for.

Variants are deduplicated by **behavioral signature** (the canonical sequence of tool calls + final state shape) so 10,000 generated scenarios collapse to ~200 distinct behaviors worth running.

### Stage 3 — Execution

- Spins up stateful clones of every tool the agent uses (Slack, Stripe, Linear for MVP; pluggable for others).
- Seeds clone state per scenario.
- Injects clone URLs into the agent's env.
- Runs the agent.
- Records every API request, response, mutation, retry, and final state.
- Parallelizes runs (default: N = CPU cores).

### Stage 4 — Failure Clustering and Root-Cause Attribution

This is the differentiator.

When scenarios fail, AgentGuard does **not** just list failures. It:

1. **Clusters** failures by behavioral signature. 47 failing scenarios with the same broken tool-call pattern = 1 root cause, not 47 bugs.
2. **Ranks suspected causes** for each cluster with confidence scores derived from trace patterns:

   ```
   Cluster #1 — 47 scenarios failed (refund-related)
   Suspected causes:
     [87%] Agent did not check existing refunds before creating a new one
           Evidence: 47/47 runs called POST /refunds with no prior GET /refunds
     [76%] Agent retries on timeout without an idempotency key
           Evidence: 31/47 runs sent duplicate POST /refunds after timeout
     [62%] Agent matches customer by email instead of customer_id
           Evidence: 18/47 runs refunded the wrong cus_* when emails collided
   ```

3. **Links** each hypothesis to specific trace events (clickable in the report).
4. **Stops there.** It does not auto-fix. The developer reads, decides, fixes.

This is the part competitors do not have. They tell you *that* the agent failed. AgentGuard tells you *why*, ranked.

### Stage 5 — Gate

Two run modes:

- **PR mode** (fast, ~2 min): runs a curated subset — the historically failing scenarios + a fresh batch of mutations. Blocks merge on any critical cluster.
- **Nightly mode** (deep, unlimited): runs the full generated suite. Surfaces new clusters. Auto-promotes a new scenario into the PR set when it produces a new failure cluster.

Both modes ship as a GitHub Action and a CLI.

---

## 3. Why This Beats Every Competitor

| Capability | LangSmith / Braintrust | Patronus / Galileo | GitHub Actions + pytest | **AgentGuard** |
|---|---|---|---|---|
| Generates scenarios from spec | No | No | No | **Yes** |
| Simulates stateful tools | No | No | Manual mocks | **Yes** |
| Failure injection | No | No | Manual | **Yes** |
| Permutation/mutation engine | No | No | No | **Yes** |
| Behavioral failure clustering | No | No | No | **Yes** |
| Ranked root-cause attribution | No | No | No | **Yes** |
| Blocks PRs | Add-on | No | Yes | **Yes** |

Competitors stop at "the LLM output had bad vibes." AgentGuard reproduces the *system-level* failure with real state, then explains the cause.

---

## 4. End-to-End User Story

**Maya, backend eng. Owns a refund-support agent that reads Slack, queries Stripe, updates Linear.**

### Day 0 — Install and point it at her docs

```
pip install agentguard
agentguard analyze --brd ./docs/refund-agent.md --agent ./agents/refund/
```

AgentGuard reads the BRD, sees the agent imports a Stripe SDK and Slack SDK, sees the prompt mentions "refund," "ticket," "customer," "approval over $500." Generates an **Agent Behavior Model**:

```
intents: [process_refund, escalate, decline_refund, request_more_info]
tools:   [slack, stripe, linear]
entities: [customer, payment, refund, ticket, channel]
rules:
  - no duplicate refund per payment
  - refunds > $500 need approval
  - never post PII to external channels
  - one refund per ticket
tenancy: customer.tenant_id must equal ticket.tenant_id
```

Maya skims it, edits one line. Commits.

### Day 1 — First exploration

```
agentguard explore --depth full
```

AgentGuard generates 8,427 variants. Dedupes to 214 distinct behaviors. Runs them. Takes 11 minutes on her laptop.

**Result:**
- 168 passed
- 46 failed, grouped into 4 clusters

```
Cluster #1 — 22 scenarios — CRITICAL
Symptom: duplicate refund created
Suspected causes:
  [89%] No idempotency key on POST /refunds after timeout
  [71%] Agent does not GET /refunds before POST when retrying

Cluster #2 — 13 scenarios — CRITICAL
Symptom: refunded wrong customer
Suspected causes:
  [82%] Customer disambiguation uses email, not customer_id
  [58%] Agent picks first match without checking tenant_id

Cluster #3 — 8 scenarios — HIGH
Symptom: posted internal policy text to external Slack channel
Suspected causes:
  [76%] Prompt template leaks `system.policy_id` field into reply
  [44%] Agent does not check channel.external before posting

Cluster #4 — 3 scenarios — MEDIUM
Symptom: large refund processed without approval
Suspected causes:
  [91%] Threshold check uses payment.amount in cents but compares to dollars
```

Cluster #4 makes her gasp. She would have shipped that.

### Day 1 — Fix and rerun

She fixes the threshold bug first. Reruns just Cluster #4. Passes. Fixes idempotency, customer-id matching, prompt template. Reruns. 211/214 pass. The 3 remaining are edge cases she explicitly chooses to defer; she annotates them as `accepted_risk` and they stop blocking.

### Day 2 — Lock it in CI

```
agentguard install-action
```

PR-mode workflow added. From now on, every PR runs the failure-prone subset in ~2 minutes. Nightly job runs full exploration and opens an issue if a new cluster appears.

### Day 12 — Prompt change regression

A teammate tweaks the system prompt to be more concise. PR opens. AgentGuard PR comment:

```
AgentGuard: Blocked
New failure cluster detected (not present in baseline):
  Cluster — 9 scenarios — CRITICAL
  Symptom: agent skips human approval for refunds over $500
  Suspected causes:
    [84%] New prompt removed "ALWAYS check approval threshold" instruction
    [52%] Tool-use order changed: refund called before approval check
```

Teammate reverts the line. Green. Merge.

### Day 30 — Production-shaped variant

A real customer hits a weird state: two payments same amount, one disputed, one not. Maya feeds the production trace in:

```
agentguard import-trace ./prod-trace.json --generalize
```

AgentGuard redacts PII, infers the initial state, generates 14 mutated variants around that shape, adds them to the suite. The bug never returns.

---

## 5. MVP Scope

**In:**
- CLI: `analyze`, `explore`, `run`, `report`, `install-action`, `import-trace`
- ABM extractor (LLM-driven, deterministic schema output)
- Scenario synthesizer + mutation engine
- Stateful clones for Slack, Stripe, Linear
- Failure injection (timeout, timeout_after_success, 429, 500, stale_read, duplicate_webhook, out_of_order_webhook)
- Trace recorder
- Failure clustering by behavioral signature
- Root-cause ranker with confidence scores
- HTML + terminal report
- GitHub Action (PR mode + nightly mode)

**Out (later):**
- Hosted dashboard
- More tool clones (GitHub, Jira, Gmail, HubSpot)
- SSO, RBAC, audit exports — none of that until paying customers ask
- Auto-fix suggestions
- Production monitoring

---

## 6. Stack

- **Language:** Python 3.12, FastAPI for clones, Typer for CLI.
- **Storage:** SQLite local, JSON trace files, single-file HTML report.
- **Parallelism:** asyncio + process pool for scenario runs.
- **LLM for ABM extraction and root-cause ranking:** Claude Sonnet/Opus via Anthropic SDK with prompt caching on the BRD and trace prefixes.
- **No backend, no auth, no DB server required for local use.** Hosted dashboard is a later layer on top of the same trace format.

---

## 7. Build Order

1. ABM extractor on a sample BRD — prove the spec-to-model step works.
2. One clone deeply (Stripe) with failure injection.
3. Trace recorder + signature hash.
4. Scenario synthesizer driven by ABM.
5. Mutation engine with coverage-guided seeding.
6. Slack and Linear clones.
7. Behavioral clustering + root-cause ranker.
8. HTML report.
9. GitHub Action.
10. `import-trace --generalize`.

---

## 8. Success Criteria

AgentGuard ships when, on a real third-party refund agent, it:

1. Extracts an ABM from the agent's README in under 60 seconds.
2. Generates ≥150 distinct scenarios with no manual authoring.
3. Finds at least one real bug the developer did not know about.
4. Clusters failures into ≤10 groups with ≥70% top-cause confidence accuracy when audited by a human.
5. Runs PR-mode in ≤3 minutes on standard CI hardware.
6. Blocks a regression PR end-to-end through the GitHub Action.

---

## 9. The Thesis

> Agent reliability is not a prompt problem or an output problem. It is a **state and workflow** problem. The only way to find the bugs that matter is to enumerate realistic workflows automatically, run them against stateful tools, and explain the failures by cause — not by symptom.
