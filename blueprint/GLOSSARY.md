# Glossary

This page lists T3DOT's terms next to the closest term in the two systems T3DOT learned from:
- **Marketing OS:** the Agentic Marketing OS, an always-on internal agent team at Fretron, described in [STORY.md](../STORY.md). It isn't public, so this page describes its concepts, not its code. T3DOT contains none of its code.
- **Paperclip:** [paperclipai/paperclip](https://github.com/paperclipai/paperclip) (MIT, © Paperclip Labs, Inc.), read at commit `c2971ba` in October 2026. Its terms may have changed since.

How to read the tables:
- "—" means there's no direct equivalent.
- **From** says where T3DOT's version came from: *Marketing OS*, *Paperclip*, *both*, *T3 Code* (something T3 Code provides or requires), or *new*.
- Full definitions of T3DOT's core terms are in [BLUEPRINT.md §1](BLUEPRINT.md#1-concepts).

## How the three map

### Organisation

| T3DOT | Marketing OS | Paperclip | From |
|---|---|---|---|
| **Company**: one install | One install for one business | **Company**: one install hosts many, each with its own access checks | Marketing OS |
| **Brand**: a dimension on seats, events, work and budgets | — | — | new |
| **Seat**: a role bound to a T3 thread | **Seat**: role, mission, doctrine, tools, reporting line and a limit on parallel tasks | **Agent**: role, title, `reportsTo`, adapter and budget | both |
| **Work seat**: a seat that exists for one goal, project or job, with its own thread that rotates and retires at close-out | **Owner thread**: every goal and project has its own conversation (`work:<id>`), never rotated | — Closest: a parent issue assigned to the project's lead agent, whose session lasts as long as that issue | Marketing OS, with Paperclip's parent-wake rule |
| **Reports to** | A reporting chain; work can be assigned down it | An org chart; hiring an agent can require board approval | both |
| **Class**: reader, actor, presenter or operator | — | — | new |
| **Presenter**: the seat that curates decisions for people | **Presenter**: exactly one seat, the chief of staff, brings decisions to a person | — (any agent can open an approval) | Marketing OS |
| **Profile**: the T3 provider instance a seat runs on | A seat's runtime (engine and home), plus model routes | Adapter type and adapter config | T3 Code |
| **Doctrine**: standing instructions built from the knowledge base | Doctrine, instructions and skills, assembled per seat and per kind of thread | Skills injected at run time, including the Paperclip skill | Marketing OS |

### Work

| T3DOT | Marketing OS | Paperclip | From |
|---|---|---|---|
| **Work item**: a goal, project, task or job | **Work**: goals, projects and tasks in one model. Goals and projects belong to people; agents draft them | **Goal → project → issue** | both |
| **Acceptance** | A task's objective and acceptance. Nothing checks them automatically; the owner above judges | Execution-policy review stages before an issue is done | Marketing OS |
| **Next mover**: what moves an open item next | Owner waits, self-wakes and a stall counter. Stuck work was found by hand | The **next-mover contract**: "never leave work in a state where nobody is responsible for the next move and nothing will wake or surface it" | Paperclip |
| **Recovery item**: one per stuck item | — | **Recovery action**: at most one open per issue | Paperclip |
| **Work request**: asking another seat for work | **Work request**: only the receiving seat's Dispatcher turns it into work | Agents create sub-issues and delegate across the org chart | Marketing OS |
| **Blocker** (a next mover of kind `work`) | Blocking on a question or a Needs-me item | The `blocks` relation between issues | both |

### Waking and running

| T3DOT | Marketing OS | Paperclip | From |
|---|---|---|---|
| **Event**: a typed fact with an idempotency key | Wake inputs: notices, identity events, schedules, monitors | About 40 free-text wake reasons, coming from timers, assignments, on-demand calls and automations | new |
| **Route**: config that maps an event to a seat | **Dispatcher-only wakes**: only a seat's Dispatcher wakes its goals and projects. Routine child notices update context without a turn | Comments, assignments and status changes wake agents directly. A parent wakes when all its children finish | Marketing OS |
| **Wake**: one pending per seat; events coalesce into it | Wakes coalesced per conversation | **Wakeup request**, coalesced | both |
| **Admission**: one path, with gates G0–G7 in a fixed order | A claim loop that silently skipped work on several conditions | `enqueueWakeup`: one admission function | Paperclip |
| **Gate receipt**: why a wake didn't run | — | **Execution wait** record, deduplicated by condition | Paperclip |
| **Dispatcher**: the kernel component that sends admitted wakes to T3 | **Dispatcher**: a seat's own coordinating conversation. It routes each input and never does the work itself | — | name only; the meanings differ |
| **Run**: the kernel's record of one T3 run | **Run**: one attempt, fenced by a 90-second lease and a generation number | **Heartbeat run** | both |
| **Binding** and **generation**: a seat's current thread | One conversation per work item, with a provider cursor | **Agent task session**: one resumable session per agent, adapter and task | new |
| **Rotation**: a fresh thread with a STATE brief, at about 8,000 items | **Thread handoff** with a checkpoint, when a session can't resume | Session compaction rotates some adapters' sessions, but not Claude Code's or Codex's | both |
| **Observed run**: a run the kernel didn't send | — | — | T3 Code |
| **Held queue** | — | — | T3 Code |

### Outcomes

| T3DOT | Marketing OS | Paperclip | From |
|---|---|---|---|
| **Settle**: complete, block, defer, progress or ack | **Task outcome**: complete, block (business or technical), progress or wake | Issue status changes, comments and work products | Marketing OS |
| **Nudge**: two, then block | Two nudges, then a business block | — | Marketing OS |
| **Evidence** on a settle | **Artifact**: published from the seat's workspace with a hash | **Work product**: a pull request, branch, commit, preview URL or document | both |
| **Record**: a pointer into the system of record, which the kernel never writes | A shared knowledge base and business-records database | Issues and documents | new |

### Governance

| T3DOT | Marketing OS | Paperclip | From |
|---|---|---|---|
| **Decision**: a typed ask, pinned to a content hash | **Approval request**: pinned to an exact version and hash; a newer version supersedes it | **Approvals** with a free-form payload; **decisions** with typed effects and a signed spec; tool action requests pinned by an arguments hash | Marketing OS |
| **Decision type** | Eight built-in approval types, such as strategic decision, production change and policy change | Four approval types: hire an agent, approve the CEO's strategy, budget override and board approval | Marketing OS |
| **Needs-me** (a decision of kind `assist`) | The **Needs me** lane: quick unblockers only a person can do, which present themselves | One attention inbox | Marketing OS |
| **Floor**: only a person decides | The operating policy's ask-the-owner list. Money and client messages are hard-wired to a person | — | Marketing OS |
| **Delegated approver** | The first manager above the work's owner, when policy allows it for that type | Review-stage participants | Marketing OS |
| **Standing rule**: "approve and always allow" | — | **Trust rule**: created from an approval and tied to the tool's version hash | Paperclip |
| **Grant**: may this seat or script call this op, within limits | **Grant** in a deployment config file: exact write commands, an expiry and a lifetime call count | **Tool policy**: allow, block, require approval, trust rule or rate limit | Marketing OS |
| **Broker** and **act** | **Integration broker**: holds every credential, and one switch makes it read-only | The MCP tool gateway | Marketing OS |
| **Receipt**: idempotent; `uncertain` blocks a blind retry | **Integration receipt** by operation id: "reconcile before a new operation" | Idempotency keys on tool invocations | Marketing OS |
| **Pause**: stops admission and brokered writes | **System pause**, which survives restarts | Pausing a company, agent or project; holds on an issue tree | Marketing OS |
| **Config revision** with rollback | A versioned operating policy; other config is edited in place | **Agent config revisions** with rollback | Paperclip |
| **Policy**: decision types, floors and grants | **Operating policy**: versioned; pre-approves low-risk work | **Execution policy**: review and approval stages | both |

### Resources and money

| T3DOT | Marketing OS | Paperclip | From |
|---|---|---|---|
| **Budget**: rate, money, compute, balance or gauge, over a window | Per-attempt caps and grant call counts | **Budget policy**: warn at 80%, hard stop, unpriced usage blocked by default | Paperclip |
| **Ledger**: append-only and idempotent | Usage stored on the run; a failed write is dropped | **Cost events**: reported, estimated or unpriced | Paperclip |
| **Lease** with a fencing token | Leases on runs only, fenced by a generation number | Issue checkout and execution locks; environment leases whose exclusivity the database doesn't enforce | new, from both |
| **Capacity** | 10 slots: 2 kept for Dispatchers, and at most 3 per seat | `maxConcurrentRuns` per agent | both |

### Time and monitoring

| T3DOT | Marketing OS | Paperclip | From |
|---|---|---|---|
| **Timer**: an event source; gates decide whether anyone wakes | Schedules and self-wakes | **Routine** (schedule, webhook or API) that creates an issue and wakes its assignee. Interval heartbeats exist but are off by default | both |
| **Catch-up** after downtime | — | Routine catch-up: skip missed runs, or replay up to 25 | Paperclip |
| **Expectation**: "this must have happened by then" | An agent that checked on the others every 30 minutes | Issue monitors and watchdogs | new |
| **Monitor**: a deterministic check that emits events | **Script monitors**, which cost no model time | Watchdogs and liveness checks | Marketing OS |
| **Failure kind**: quota, transient, auth, context, stall or silent | Free-text errors and a fixed retry ladder | Typed adapter failures with a retry-not-before time | Paperclip |
| **Engine health** | A manual pause during rate-limit storms | One recovery for failures that share a fingerprint | both |
| **Silent run** | Wall-clock turn limits only | An output-inactivity timer, and a run watchdog (suspicious at 5 minutes, critical at 15) | Paperclip |

### Execution

| T3DOT | Marketing OS | Paperclip | From |
|---|---|---|---|
| **Bridge**, with credentials C1 and C2 | Its own Claude Code and Codex runners behind one engine router | **Adapters**: Claude Code, Codex, Cursor, Gemini CLI, OpenCode and more | T3 Code |
| **Company MCP**: eight tools for seat threads | A per-run MCP tool server with a one-attempt token | A REST API with agent API keys and run tokens, taught by an injected skill | Marketing OS |
| **Posture**: standard or confined | A per-run sandbox, and an egress proxy that blocks host and private addresses | Sandbox providers such as e2b, Daytona and Modal | Marketing OS |
| **Surface**: where people decide | Its own UI, plus an operator MCP with read, operate, decide and administer scopes | The board UI and REST API | new |
| **Workspace** | A workspace per seat | Project workspaces and worktrees | T3 Code |

## Terms only in T3DOT

- **Bridge mode / full mode.** In full mode, T3DOT runs an org's control plane. In bridge mode, an org keeps its own kernel and uses only the Bridge to run its agents on T3 Code.
- **C1 and C2.** The kernel's two T3 credentials. C1 is an MCP OAuth session, used for commands. C2 is a session bearer, used for status, usage and failure detail. There are two because T3 refuses the MCP session anywhere but `/mcp`.
- **Coalescing.** Folding new events into a seat's one pending wake instead of creating another.
- **Condition hash.** A hash of what blocked a wake. If the same thing blocks it again, the counter on its gate receipt goes up instead of a new row being added.
- **Environment.** One T3 server the Bridge drives.
- **Fencing token.** A number that goes up every time a lease is acquired. Protected operations must present the current one, so a holder that has lost its lease can't act.
- **Generation.** How many threads a seat has had. It goes up at each rotation.
- **Held queue.** Queued T3 runs that won't start until a person sends a message from a client or a run completes cleanly. MCP can't see the flag; gate G4 detects it.
- **Kernel.** The T3DOT service: one process, one SQLite file, running as its own OS user.
- **Observed run.** A run in a seat's thread that the kernel didn't send: a person typing, T3 continuing after a restart, or a delegated child. It takes up capacity but needs no settle.
- **Operation id.** The idempotency key on an external effect. A second call with the same id returns the first receipt.
- **Posture.** *Standard* is for seats with real desktop needs; their effects are controlled at the broker. *Confined* is for seats that must never see integration secrets; they get a separate OS user, firewall rules and Claude's sandbox.
- **Rule of Two.** A session that reads untrusted inbound content doesn't also send, so reader seats can't hold outbound send grants.
- **Shell.** T3's status summary for each thread (status, latest run, last error class, usage-limit reset time and pending requests). The kernel polls it with C2.
- **STATE brief.** The handoff a rotated seat starts from: open work with next movers, held leases, pending decisions and recent settles.
- **Uncertain.** A receipt whose outcome is unknown, for example after a timeout. It blocks a retry with the same operation id until someone reconciles it.
- **Wake packet.** The short message a wake sends into a seat's thread: event ids, the work item, leases and budgets, in at most 2,000 characters. The seat pulls details through the company MCP.

## What T3DOT took, and what it left

**From the Marketing OS:**
- seats with doctrine and reporting lines, and one place that decides who wakes;
- the settle contract, with two nudges before a block;
- a thread for each goal and project, kept as work seats, but rotated and woken only when needed;
- approvals pinned to an exact version and hash, and superseded by newer versions;
- one presenter, and the split between Needs-me items and decisions;
- an integration broker that holds every credential, with exact write grants, and receipts where an uncertain result blocks a blind resend;
- script monitors that cost no model time, and a pause that survives restarts.

**From Paperclip:**
- one admission function, and a receipt for every wake that didn't happen;
- waking a parent only when all its children finish (`work.children_done`);
- the next-mover contract, with at most one open recovery item per piece of work;
- typed failures that tell a quota reset from a passing rate limit;
- an append-only cost ledger, and budgets that fail closed;
- "always allow" trust rules;
- config revisions with rollback, and capped catch-up for missed timers.

**Where all three agree:**
- no timer heartbeats by default;
- wakes coalesced instead of sent once per event;
- idempotency keys on everything that can repeat.

**New in T3DOT,** mostly because T3 Code is the execution plane:
- the Bridge and its two credentials;
- held-queue detection and observed runs;
- thread rotation with STATE briefs;
- leases on resources, not only on runs;
- expectations and postures;
- brand as a dimension;
- the reader/actor split;
- floors and delegated approvers as configuration.

**Left out on purpose, from Paperclip:**
- agents checking out their own issues;
- comments, assignments and status changes waking agents directly;
- approvals any agent can open with a free-form payload;
- per-call "ask first" prompts;
- one inbox that mixes failures and decisions;
- a large manual injected into every run;
- exclusivity enforced only in code.

**Left out on purpose, from the Marketing OS:**
- grants kept in a hand-edited file, with lifetime call counts and no approval path;
- free-text errors on a fixed retry ladder;
- usage writes that fail silently;
- its own model runners, which T3 Code replaces;
- coordination threads that never rotate;
- owners woken on routine child notices, which in one measured two-day sample took most of the model spend.
