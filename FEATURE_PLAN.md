# AgentGuard — Feature Plan (v2, post-critique)

Rewritten after a brutal self-review concluded the original plan was research-bait wrapped in a cube metaphor. This plan is narrower, less impressive on a slide, and roughly 5× more likely to survive contact with real customers.

The one-line product:

> Ingest production agent traces. Mutate them across the seven failure modes that actually break agents. Evaluate invariants. Gate the regression PR.

No cube. No ABM extractor. No LLM-judged root cause. No four verticals.

---

## 1. What Changed From v1 of This Plan

| v1 (cut) | v2 (kept / replaced with) |
|---|---|
| Spec-driven scenario generator (the "cube") | **Trace ingest + targeted mutation.** Real traces, not generated scenarios. |
| ABM extractor from BRD/PRD/README | **User-written invariants (YAML/Python DSL).** Boring, reliable, customer-owned. |
| Behavioral-signature clustering + ranked root cause (with %) | **Deterministic grouping by (invariant, mutation axis).** No ML, no confidence theater. |
| Hosted tool clones for Slack/Stripe/Linear/Jira/... | **Replay recorded tool responses from the ingested trace.** No clones to maintain. |
| Persona library (~8 personas) | **Cut.** Adversarial-goal library deferred until conversational agents are a customer cluster. |
| Coverage metric ("64% of state space fuzzed") | **Cut.** Denominator is meaningless. |
| 4 verticals at launch | **One wedge: support / operations agents.** Others wait for 10 paying customers in the wedge. |
| Cube-style multi-axis combinatorial generator | **Seven named mutation axes from real postmortems.** Honest scope. |
| Critic agent / why-failed LLM annotations | **Cut.** Trace links + invariant + axis are enough. |

The five core primitives (`World`, `Actor`, `Probe`, `Trace`, `Signature`, `Cluster`) survive *as internal abstractions* because they are sound. They stop being a feature surface.

---

## 2. MVP (10 weeks, single wedge)

Six product features + three table stakes. Anything not on this list is post-MVP.

### 2.1 Product features

1. **Trace ingest with deterministic PII redaction (+ cold-start `record` mode).**
   OTel-native + 50-LOC SDK shim for under-instrumented frameworks. For greenfield agents with no traces yet, `agentguard record --local` captures local dev runs as starter traces. PII rule set is user-controlled, auditable, and runs without an LLM in the default path. Enterprise legal can read the rule file.

2. **Invariant DSL (YAML + Python).**
   ~10 built-in predicates: `at_most_once`, `tenant_isolation`, `field_not_in_message`, `numeric_threshold_respected`, `prerequisite_call_before`, `no_subagent_loop`, etc. Custom Python invariants for anything else. This is what the customer is actually buying — codified, executable agreement with their agent's spec.

3. **Local re-execution harness with deterministic-by-default replay.**
   Replays the ingested trace against the customer's agent in their own dev environment. Unmutated tool calls *and unmutated LLM calls* get the recorded response — PR mode is deterministic and $0 cost. Mutated calls get the mutator's response, or a recorded sibling LLM response. Live-LLM replay on mutated branches is opt-in for nightly mode. No hosted clones.

4. **Seven mutation axes.**
   Retry / duplicate side effect • webhook reorder + duplicate • identity collision • stale read • threshold edge • tool failure injection (timeout / 429 / 500 / malformed) • subagent handoff loop. Each axis is config-tunable. No "cube" — these seven are the product.

5. **Flat invariant-violation report (HTML + terminal).**
   Per violation: invariant name, severity, mutation axis, trace link to the exact event. Deterministic grouping when (invariant, axis) match. No confidence percentages. No LLM commentary.

6. **Deterministic mutation seeds + replay.**
   Every mutation records its seed. Reruns are exact. Engineers can reproduce, bisect, and pin a regression test.

### 2.2 Table stakes (no product without these)

7. **GitHub Action + CLI.**
   PR mode (replay historically violating traces + their mutations, ≤2 min, blocks on new critical violation) and nightly mode (full corpus × all axes, opens issues on new violations). Exit codes, PR comments with violation summary + trace links.

8. **Regression baselines.**
   "This PR introduces 2 new invariant violations not present on main." Concrete delta vs main is the actual purchase trigger for an engineering manager.

9. **PII redaction is auditable and provable.**
   Rule file is human-readable. Every redaction emits a log line with the rule that fired. Customers can answer their own legal team without us.

### 2.3 MVP success criteria

1. Trace ingest + PII redaction completes in <30 s for a 10 MB trace.
2. First invariant authored in <10 min from cold start by a customer engineer.
3. On a real customer's real incident trace, mutated replay reproduces the original incident on ≥1 axis.
4. Same replay surfaces ≥1 additional invariant violation the customer had not thought of.
5. PR mode runs in ≤2 min on standard CI hardware.
6. Customer installs the GitHub Action without a sales call.

---

## 3. V1.1 (after 3 paying design partners, ~weeks 11–20)

Cautious additions. Each one earns its place from observed customer pain, not from the slide deck.

1. **Custom mutation axes.** Customer-defined mutators that compose with the built-in seven. Triggered when ≥3 customers ask for "the same not-yet-built mutation."

2. **Cross-tool state diff in the report.** When an invariant fires, snapshot what changed across all tools touched by the mutated run vs the baseline run.

3. **Cost / runtime budget per scenario.** Caps + per-replay cost reporting. Every platform lead asks for this in onboarding week 2.

4. **Behavioral diff between builds.** "Commit A passes invariants X, Y. Commit B passes only X." Two-build compare in the report.

5. **Trace generalization for replays across data.** Already in the PRD as `ingest`, but expand: replay one ingested trace against synthetic variants of the input data while keeping the failure-axis mutations.

6. **One adapter family per framework.** LangGraph, CrewAI, OpenAI Agents SDK, Anthropic Agent SDK, Vercel AI SDK — thin decorators only. Driven by which framework shows up most in design-partner pipelines.

That is six items, ranked. Nothing about clusters, nothing about ML, nothing about LLM-judged anything.

---

## 4. V2 (only after 10 paying customers in the wedge)

These are vertical expansions. They are *not* commitments. They exist on this list to prove the engine generalizes when the time is right.

1. **Reporting / knowledge agent pack.** New invariant predicates: `source_not_stale_at_read_time`, `pagination_did_not_truncate`. New ingest types for Slack/Teams/email/Jira traces.

2. **Cybersecurity audit agent pack.** New invariant predicates: `finding_references_real_file_line`, `no_false_consensus_across_subagents`. New "environment" actor for repo snapshots.

3. **Marketing platform pack.** Outbound email + n8n-style workflow assembly. Predicates: `respects_unsubscribe`, `assembled_workflow_uses_valid_credentials`. New actor for `EmailPeer` (LLM-driven goal-following correspondent).

4. **Adversarial-goal library** (NOT a persona library). ~6 goal templates with explicit pass/fail invariants: `extract_other_tenant_data`, `force_duplicate_side_effect`, `bypass_policy_threshold`, `leak_internal_field_to_external_channel`, `cause_infinite_subagent_handoff`, `confuse_with_contradictory_multi_turn_input`.

5. **Statistical gates.** Where invariants are inherently probabilistic (e.g., on LLM-judged ones the customer chooses to write), pass/fail by sample threshold rather than binary.

6. **Self-hosted / VPC deploy.** First enterprise blocker after design-partner phase.

Each pack adds, at most: new predicates, new ingest formats, new actor kinds. The engine does not change. If a pack would require engine changes, that is a signal the engine abstractions were wrong, not a signal to ship the pack.

---

## 5. Explicitly Cut (and Why) — Expanded From v1

| Feature | Why cut |
|---|---|
| Spec-driven scenario generator (the cube) | Unbounded LLM-on-LLM with no ground truth. Research project, not product. |
| ABM extractor from docs | Real BRDs are out of date or absent. Garbage in, garbage out. |
| LLM-judged root-cause ranking with confidence % | Confidence theater. One bad rank destroys trust. We show invariant + axis + trace link instead. |
| Hosted tool clones (Stripe, Slack, Linear, Jira, ...) | Unbounded surface; every customer has a tool we don't simulate. We replay recorded responses instead. |
| Behavioral-signature clustering ML | No ground truth, no eval set. Deterministic grouping by (invariant, axis) is enough. |
| Persona library | Personalities are the wrong unit. Adversarial *goals* are. Deferred to V2 as a goal library, not a persona library. |
| Coverage metric (% of state space fuzzed) | Denominator is meaningless when the state space is infinite. |
| Time-travel scenarios (event-sourced clones) | Infra cost enormous; buyers won't pay extra. |
| Critic agent / why-failed LLM annotations | Adds an LLM judge with no eval; trust risk > value. |
| Single-decision probes / prompt-slice tests | Promptfoo and Braintrust own this category. Do not fight there. |
| Human-in-loop stub | Every customer's HIL is bespoke; we'd build 10, ship 0. Let them stub. |
| Tool-misuse tempter, conversational depth probes | Subsets of an adversarial-goal library. Don't list as separate features. |
| ABM-rule microtests, confidence bands, distribution drift | Statistician candy. Buyers want pass/fail + a clear cause. |
| Hosted dashboard at launch | CLI + HTML report cover MVP. Dashboard comes after revenue. |
| Auto-fix | Out forever. One wrong auto-fix destroys the trust we built. |
| "Four verticals at launch" | Marketing slide, not a roadmap. Pick one wedge. |

---

## 6. Architecture (Unchanged From v1 — It Was Right)

The five core primitives survive. They were the strong part of the original analysis. They just stop being marketed as features.

```
World      = { state_store, clock, seed, actors[], probes[] }
Actor      = { id, kind: "agent" | "tool" | "human_sim" | "environment",
                transport_adapter, parent_id? }
Probe      = { axis_id, mutator, precondition, observable[] }
Trace      = ordered [Event{ actor, op, args, result, t, causal_parent, spawn? }]
Signature  = { structural_hash, semantic_hash, outcome_class,
                invariant_violations[] }
Cluster    = { signature_centroid, members[], blame_path, severity }
```

`Signature` and `Cluster` remain internal abstractions even though we do not surface ML-driven clustering in v1. They give us a clean place to add it later if a customer signal demands it.

### Four architectural decisions that still must be right at MVP

1. **Trace ingest is OTel-native, not SDK-native.** A proprietary SDK locks us into per-framework adapter work forever. OTel makes a new framework a config change.

2. **`Actor` includes `human_sim` and `environment` as first-class kinds.** Marketing-email (human_sim) and cybersec (environment) are unreachable later without this. Add them at v1 even though v1 does not use them.

3. **Invariants are first-class objects with deterministic evaluation.** No LLM in the invariant evaluator's default path. Determinism is a product feature; customers can re-run, bisect, and trust the output.

4. **Trace storage is split: payloads outside git, manifest inside git.** `.agentguard/traces/` is git-ignored; a manifest of trace IDs + content hashes is committed so CI fetches the right traces from an external blob store (S3/GCS) or a local cache. Repos stay small; traces stay reproducible across machines and CI runners.

---

## 7. Build Order (Matches PRD §8)

1. Trace schema + OTel ingest.
2. Deterministic PII redactor + SDK shim.
3. Invariant DSL + 10 built-in predicates.
4. Local re-execution harness — replay verbatim, assert pass.
5. Mutation axis #1 (retry / duplicate) end-to-end on one real refund agent.
6. Mutation axes #2–#7.
7. Flat invariant-violation report.
8. Deterministic grouping.
9. GitHub Action.
10. Onboarding polish.

Ten steps. Ship in 10 weeks. Each step is independently demonstrable.

---

## 8. The Bar for v1

A founder hands AgentGuard:
- a recorded production trace from a customer's support agent
- five invariants the customer wrote in under 30 minutes

…and gets back, within 2 minutes:
- a reproduction of the original incident under retry-mutation
- ≥1 additional violation the customer did not anticipate
- a single-line GitHub Action that gates every future PR against both

No demo magic. No "we'll add that vertical later." No "the confidence score says..." Just the boring, defensible loop that turns an incident into a permanent test.

That is the product. Everything else is post-revenue.
