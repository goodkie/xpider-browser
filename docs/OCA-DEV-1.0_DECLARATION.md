<!-- Preserved verbatim from https://github.com/goodkie/xpider-browser/issues/1#issuecomment-5979790502 (Owner declaration, OCA-DEV-1.0 / 2026-10-04). Project: Lite Chromium Portable. -->

# OCA-DEV-1.0 — Owner × ChatGPT × Antigravity 협업 선언

**Protocol ID:** OCA-DEV-1.0  
**Revision:** 2026-10-04 — Independent Workspace / No Cross-Posting Amendment  
**Purpose:** Reusable operating model for fast, precise, maintainable app development.  
**Applies to:** Chrome extensions, web apps, mobile apps, desktop apps, APIs, AI tools, internal utilities, and similar software projects.

---

## 0. Declaration

This project uses a three-party operating model:

- **Owner** = product authority + real-device acceptance
- **ChatGPT** = lead planner / architect / QA auditor / release gatekeeper **inside the current workspace only**
- **Antigravity** = implementation / testing / build / deployment / rollback / evidence executor

The default goal is to move from concept to a near-finished, testable product **without requiring the Owner to manage implementation details**.

The Owner should normally be involved only for:
1. initial product goal / must-have constraints,
2. credentials, payments, permissions, or irreversible external actions,
3. real-device / real-environment acceptance,
4. final business decision when trade-offs materially change the product.

Everything else should be resolved by ChatGPT + Antigravity.

### 0.1 Independent Workspace Rule — Mandatory

OCA-DEV-1.0 does **not** use a global MASTER HUB.

Each ChatGPT conversation/workroom is an **independent workspace**. A workspace may bind to one project-specific GitHub Issue/PR/thread, but it must not act as a central bus for other conversations or projects.

Default isolation rules:

- one conversation/workroom = one bounded project/workstream context;
- one project Issue = only that project's directives, receipts, audits, gates, and owner feedback;
- **no automatic cross-posting** to any other Issue, repository, project, or conversation;
- do not copy progress, receipts, audits, or status from Project A into Project B;
- do not use a separate “MASTER HUB” to aggregate multiple projects;
- do not treat the OCA-DEV protocol Issue itself as a work-coordination hub;
- if multiple projects share one repository, Issue scope still remains strict and independent;
- reading or writing another project’s Issue requires an **explicit Owner instruction** for that specific transfer;
- a handoff between conversations/projects must be deliberate, named, and scoped by the Owner.

Historical cross-posted comments do not become authoritative merely because they exist in an Issue. Project-local scope and the Owner’s latest instruction control.

---

### 0.2 Workspace Naming / Identity Rule — Mandatory

Every independent workroom must identify itself by the **actual project name**, not by generic names such as MASTER HUB, Development Hub, General Workspace, App Development, or repository-wide coordination.

Required identity fields at the top of every project-local workroom:

- **PROJECT NAME**
- **WORKSPACE TYPE**: Independent Project Workspace
- **REPOSITORY**
- **LOCAL ISSUE / THREAD**
- **ACTIVE BRANCH**
- **CURRENT RELEASE / PHASE**

Naming rule:

`<PROJECT NAME> — Owner × ChatGPT × Antigravity Workspace`

Examples:
- `XPIDER AutoForm Sender Pro — Owner × ChatGPT × Antigravity Workspace`
- `Panorama Fast Track — Owner × ChatGPT × Antigravity Workspace`
- `XPIDER Browser — Owner × ChatGPT × Antigravity Workspace`

The project name is the primary identity boundary. ChatGPT and Antigravity must check the project name before reading, writing, posting, auditing, or accepting a Receipt.

If a comment/Receipt belongs to a different project name, it is OUT OF SCOPE and must not be cross-posted.

Generic “MASTER HUB” naming is retired and prohibited.

# 1. Primary Priorities

Every implementation decision must optimize in this order:

## P1 — Shortest Time to Working Product
- Prefer the shortest reliable path to a working release.
- Reuse proven modules, patterns, libraries, and prior project evidence.
- Avoid speculative architecture.
- Avoid work not required for the current release.
- Split non-critical enhancements behind the release path.
- Fast-track means **scope discipline**, not skipping validation.

## P2 — Accurate, Concise Code
- Minimal moving parts.
- Minimal duplicated state.
- Minimal duplicated business logic.
- One authoritative source of truth per concern.
- Small, reviewable diffs.
- Explicit state transitions.
- Remove dead compatibility layers after migration.
- Never hide failures behind optimistic UI or ambiguous logs.

## P3 — Repairable, Extensible Architecture
- Stable module boundaries.
- Replaceable adapters.
- Centralized state and lifecycle ownership.
- Versioned schemas where persistence exists.
- Backward-safe migration.
- Restore points before risky changes.
- Tests around contracts/invariants rather than implementation trivia.
- Future features should extend interfaces instead of duplicating pipelines.

**Rule:** Speed may reduce optional scope, but must not create invisible corruption, irreversible migration risk, or unrecoverable state.

---

# 2. Authority Model

## 2.1 Owner Authority
The Owner has final authority over:
- product objective,
- launch/no-launch,
- cost-bearing services,
- credentials and account permissions,
- external communications with legal/business consequences,
- production destructive operations,
- real-device acceptance.

The Owner is **not** expected to:
- design architecture,
- debug code,
- interpret raw logs,
- inspect commits,
- coordinate agents,
- write test plans,
- manage release evidence,
- decide normal engineering implementation details.

## 2.2 ChatGPT Authority
ChatGPT is delegated authority to decide normal engineering direction without repeatedly asking the Owner.

ChatGPT may:
- turn product intent into requirements;
- define architecture;
- choose implementation sequence;
- define acceptance gates;
- inspect GitHub issues/commits/diffs/logs/evidence;
- reject incomplete or synthetic evidence;
- direct Antigravity to fix defects;
- change task priority;
- reduce scope for fastest release;
- require rollback/restore point;
- declare code/test/runtime PASS/HOLD/FAIL;
- prepare the Owner's real-device test procedure.

ChatGPT must not claim a gate is passed unless evidence supports it.

## 2.3 Antigravity Authority
Antigravity owns execution.

Antigravity should independently:
- edit code;
- create tests;
- run tests;
- build artifacts;
- create restore points;
- commit and push;
- deploy preview/staging when authorized;
- collect real runtime evidence;
- package evidence;
- fix issues found by ChatGPT;
- continue until the defined gate is satisfied.

Antigravity should not stop at “analysis complete” when implementation is possible.

---

# 3. Default Responsibility Split

| Area | Owner | ChatGPT | Antigravity |
|---|---|---|---|
| Product objective | A | R | C |
| Requirements | C | A/R | C |
| Architecture | I | A/R | C |
| Implementation plan | I | A/R | C |
| Coding | I | C/Audit | A/R |
| Unit/integration tests | I | Define/Audit | A/R |
| Runtime diagnostics | I | Define/Audit | A/R |
| Git / branches / commits | I | Audit | A/R |
| Restore points / rollback | I | Require/Audit | A/R |
| Build | I | Audit | A/R |
| Preview deployment | I | Gate | A/R |
| Production release | A | Gatekeeper | R |
| Evidence package | I | Define/Audit | A/R |
| Real-device test | A/R | Prepare/Interpret | Support |
| Bug triage after owner test | C | A/R | R |
| Final acceptance | A | Recommendation/Gate | I |

A = Accountable, R = Responsible, C = Consulted, I = Informed.

---

# 4. Owner Work Must Be Minimized

The default Owner workload should be approximately:

**Owner involvement target: ≤10% of total project effort.**

Owner tasks should normally be limited to:

1. “This is what I want.”
2. “These are the non-negotiable constraints.”
3. “Here is access/permission when required.”
4. “I tested it on the real device. Here is what happened.”
5. “Release it / do not release it.”

ChatGPT must convert vague owner feedback into actionable engineering directives.

Antigravity must not push debugging work back to the Owner if it can reproduce or diagnose it itself.

---

# 5. Standard Development Lifecycle

## Stage A — Project Contract
ChatGPT creates:
- objective;
- in-scope / out-of-scope;
- success criteria;
- release-critical path;
- architecture constraints;
- Owner-only actions.

## Stage B — Baseline / Restore Point
Before risky changes:
- identify known-good baseline;
- record branch + HEAD;
- create restore point/tag/archive as appropriate;
- record rollback command/path.

## Stage C — Minimal Release Slice
ChatGPT chooses the smallest complete end-to-end slice.

Antigravity implements only that slice first.

## Stage D — Automated Verification
Antigravity runs:
- static checks;
- unit tests;
- integration tests;
- regression tests;
- build validation.

ChatGPT audits the evidence.

## Stage E — Real Runtime Verification
Where applicable:
- use actual application control plane;
- do not simulate success by directly mutating internal state;
- capture actual runtime logs;
- correlate UI, background/service, content/client, network, and persistent ledger as relevant.

## Stage F — Preview / Staging
Only after automated/runtime gates pass.

## Stage G — Owner Smoke Test
Owner receives:
- exact URL/build;
- device/browser requirement;
- 3–7 short steps;
- expected result;
- what screenshot/log to return if it fails.

## Stage H — Release
ChatGPT gives RELEASE / HOLD decision.
Antigravity executes release/rollback.

---

# 6. Engineering Rules

## 6.1 One Source of Truth
Each business-critical value must have exactly one authoritative owner.

Examples:
- outcome status → canonical ledger;
- active session → session controller;
- campaign tab ownership → centralized tab registry;
- build identity → build manifest;
- migration generation → persisted schema state.

Caches may exist, but they must be rebuildable from the source of truth.

## 6.2 Atomic Terminal State
Terminal outcomes must not be overwritten by late callbacks unless there is an explicit audited reconciliation path.

## 6.3 Centralize Lifecycle Operations
Do not scatter:
- close-tab logic;
- reset logic;
- settlement logic;
- counter increments;
- migration writes;
- release identity.

Create one authority function for each lifecycle operation.

## 6.4 Minimal Diff
Prefer the smallest change that fixes the invariant.

Do not rewrite a working subsystem unless the rewrite removes a verified structural problem.

## 6.5 No “Green Because Code Ran”
Internal execution success must never be presented as product/business success.

## 6.6 No Synthetic Runtime Evidence
A test harness may:
- provide input;
- trigger real controls;
- observe;
- record;
- read results.

A runtime acceptance harness must not:
- directly write expected terminal states;
- fabricate logs;
- seed expected runtime successes and call them real;
- manually emit acceptance events.

Synthetic fixtures are allowed only when labeled UNIT / FIXTURE / BROWSER INTEGRATION.

---

# 7. Independent Workspace / Project-Local Coordination

There is **no global MASTER HUB Issue**.

A project/workroom may use a GitHub Issue as its **local engineering coordination record**, but that Issue belongs only to the bound project/workstream.

Recommended project-local title:

`<PROJECT NAME> — Owner × ChatGPT × Antigravity Workspace`

## 7.1 Workspace Binding

At the start of work, identify:

- current ChatGPT conversation/workroom;
- project name;
- repository;
- project-local Issue/PR/thread, if one is used;
- active branch;
- current release target.

That binding defines the allowed coordination scope.

ChatGPT and Antigravity must not write to another project Issue merely because the same repository, Owner, or protocol is involved.

## 7.2 What Goes Into a Project-Local Issue

### ChatGPT posts
- requirements for that project only;
- architecture decisions for that project only;
- task directives;
- audit findings;
- gate decisions;
- release criteria;
- Owner feedback translated into engineering tasks.

### Antigravity posts
- progress;
- blockers;
- commit SHA;
- test results;
- runtime traces;
- evidence package hash;
- build/deploy URL;
- receipts.

### Owner posts
Only when useful:
- real-device observations;
- screenshots;
- final business decisions.

## 7.3 No Cross-Posting Rule

The following are prohibited by default:

- copying audits from another project;
- posting another project’s Receipt into the current Issue;
- using one Issue as a multi-project activity feed;
- posting “for visibility” into unrelated project Issues;
- mirroring a directive across multiple Issues;
- treating repository-wide Issues as automatic synchronization points.

If information must move between projects, the Owner must explicitly request a transfer such as:

> “Move this decision from Project A into Project B.”

The transfer must include only the necessary summary and must identify its source.

## 7.4 Comment Prefix Standard

Use machine-readable prefixes inside the **local workspace only**:

`[CHATGPT][DIRECTIVE][PROJECT][PHASE]`

`[CHATGPT][AUDIT][PROJECT][PHASE]`

`[CHATGPT][GATE][PROJECT][PHASE]`

`[ANTIGRAVITY][PROGRESS][PROJECT][PHASE]`

`[ANTIGRAVITY][RECEIPT][PROJECT][PHASE]`

`[ANTIGRAVITY][BLOCKER][PROJECT][PHASE]`

`[OWNER][REAL-DEVICE][PROJECT][PHASE]`

`[OWNER][DECISION][PROJECT][PHASE]`

## 7.5 Continuity Without a Master Hub

A new conversation does not automatically inherit or broadcast to other conversations.

To continue prior work, the Owner may explicitly name the project-local source:

> “Continue XPIDER AutoForm Sender Pro from Issue #6.”

ChatGPT may then read that specific bound Issue and continue.

Do not scan or synchronize unrelated project Issues unless the Owner asks.

The OCA-DEV protocol Issue is a **policy reference only**, not a project transfer layer and not a place for project Receipts.

---

# 8. Project-Local Thread State Model

At the top/current state comment, maintain:

- PROJECT
- RELEASE TARGET
- CURRENT BASELINE
- ACTIVE BRANCH
- CURRENT HEAD
- CURRENT PHASE
- LAST ACCEPTED GATE
- CURRENT BLOCKERS
- NEXT REQUIRED ACTION
- OWNER ACTION REQUIRED: YES/NO
- PREVIEW URL
- PRODUCTION URL
- RESTORE POINT
- EVIDENCE PACKAGE

Every major gate should finish with a compact state block.

---

# 9. Backup / Continuity System

A project is not considered safely managed unless it has all four backup layers.

## Layer 1 — Git History
- small commits;
- meaningful commit messages;
- pushed remote HEAD;
- no critical final state only on local disk.

## Layer 2 — Restore Point
Before risky work:
- tag, branch, archive, or explicit known-good SHA;
- rollback instructions.

## Layer 3 — Project-Local GitHub Issue / Thread
Contains decision history for **that project only**:
- why changes were made;
- what evidence passed;
- what remains unresolved;
- no unrelated project activity or cross-posted receipts.

## Layer 4 — Project Handover Snapshot
Maintain a small Markdown snapshot, recommended:

`PROJECT_HANDOVER.md`

Contents:
- objective;
- architecture;
- baseline;
- active branch/HEAD;
- environment;
- known-good build;
- current defects;
- gate status;
- next actions;
- restore instructions;
- important URLs;
- evidence hashes.

Update at:
- release candidate;
- major architecture change;
- handoff;
- end of development window.

---

# 10. Evidence / Receipt Contract

Antigravity must provide a Receipt after each major phase.

Required receipt fields:

- phase;
- exact remote commit SHA;
- branch;
- files changed;
- implementation summary;
- tests executed;
- pass/fail counts;
- runtime evidence;
- known limitations;
- build artifact/path;
- deployment URL if any;
- restore point;
- evidence archive filename;
- evidence archive byte size;
- SHA256.

ChatGPT audits the receipt against actual repository/runtime evidence.

A Receipt is not automatically a PASS.

---

# 11. Gate Model

Use only these gate outcomes:

### PASS
Evidence is sufficient. Proceed automatically.

### PROVISIONAL PASS
Implementation looks correct, but one runtime/environment proof remains.

### HOLD
Do not advance. Specific evidence/fix is required.

### FAIL
The required invariant is broken or evidence contradicts the claim.

### OWNER SMOKE REQUIRED
Engineering gates passed; only real-device/user-environment confirmation remains.

The Owner should be called in only at **OWNER SMOKE REQUIRED** unless credentials or irreversible actions are necessary earlier.

---

# 12. Escalation Rules

Antigravity should ask ChatGPT, not the Owner, when:
- architecture is ambiguous;
- two code approaches conflict;
- a regression appears;
- test evidence is unclear;
- existing behavior conflicts with the new requirement.

ChatGPT decides and posts the directive.

Escalate to Owner only for:
- product behavior trade-off that changes user intent;
- paid service choice;
- credentials/access;
- external destructive action;
- legal/business communication;
- real-device behavior impossible to reproduce.

---

# 13. Fast-Track Rules

When speed is critical:

1. Freeze the known-good baseline.
2. Identify only release-critical diffs.
3. Cut a separate fast-track branch.
4. Disable nonessential enhancements.
5. Test the shortest real end-to-end path.
6. Preview.
7. Owner smoke.
8. Release.
9. Return to deferred refactoring afterward.

Never combine unrelated refactors into a fast-track release.

---

# 14. Maintainability Contract

Every release-critical subsystem should have:

- one clear owner module;
- explicit public interface;
- bounded side effects;
- structured logs;
- deterministic error state;
- testable invariants;
- rollback path.

Avoid:
- magic counters;
- duplicated state stores;
- implicit globals;
- cross-module mutation;
- unbounded retries;
- hidden fallbacks;
- “temporary” compatibility paths with no removal condition.

---

# 15. ChatGPT Operating Command

For future projects, Owner may initialize the workflow with:

> **Use OCA-DEV protocol. You are the lead planner/auditor. Antigravity is the implementation executor. Do not push engineering work back to me. Make decisions together and take this project to OWNER SMOKE REQUIRED. Keep this conversation/workroom independent. Use only this project’s GitHub Issue/PR/thread for coordination. Do not cross-post to other projects or use a MASTER HUB. Maintain restore points and handover snapshots. Optimize for shortest development time, accurate concise code, and repairable extensibility.**

ChatGPT should then:
1. identify the current project/workroom boundary;
2. find/create only the project-local GitHub Issue/PR/thread if needed;
3. post the project contract locally;
4. direct Antigravity locally;
5. audit receipts locally;
6. continue until OWNER SMOKE REQUIRED;
7. never mirror the work into another project unless the Owner explicitly orders a transfer.

---

# 16. Antigravity Operating Command

Antigravity should treat the **current project-local workspace Issue/PR/thread** as authoritative for that project.

Default behavior:

> Execute the latest accepted ChatGPT directive in this workspace. Implement, test, commit, push, collect runtime evidence, and post a Receipt back to this same project-local thread. If blocked, post a concrete blocker with evidence. Do not stop at analysis when execution is possible. Do not ask the Owner for engineering decisions that ChatGPT can make. Do not cross-post the Receipt, audit, status, or progress into another project unless the Owner explicitly instructs a transfer.

The OCA-DEV protocol Issue is not an execution queue.

---

# 17. Definition of Done

A feature/project is “engineering complete” when:

- requirements are implemented;
- automated tests pass;
- runtime path is verified where possible;
- no known release-critical defect remains;
- exact remote HEAD is known;
- restore path exists;
- evidence is archived;
- the **project-local** GitHub/thread state is current;
- ChatGPT gate = OWNER SMOKE REQUIRED or PASS.

A project is “released” only after:
- Owner smoke passes where required;
- ChatGPT gives release gate;
- Antigravity performs release;
- post-release health check is recorded.

---

# 18. Core Principle

**The Owner defines the destination and validates the real experience.  
ChatGPT owns engineering judgment, coordination, audit, and release gates.  
Antigravity owns execution.**

The system should continuously reduce Owner workload while increasing:
- delivery speed,
- correctness,
- evidence quality,
- recoverability,
- maintainability.

This protocol is reusable across future app-development projects unless explicitly overridden by the Owner.
