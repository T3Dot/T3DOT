# t3dot blueprint: the neutral system

**Status: proposal, v2.2 (3 Nov 2026).** This is a design; nothing here is built yet.

How this design was made:
- **T3 Code facts** come from reading T3 Code's public source. [Appendix A](#appendix-a-t3-code-facts-this-design-relies-on) lists every behaviour the design depends on, with source paths, checked at upstream `main` `e6e2ab05cc` (1 Nov 2026). Re-check them against the version you run.
- **Prior art:** [Paperclip](https://github.com/paperclipai/paperclip) (MIT, Paperclip Labs) was read closely. Ideas are borrowed; no code is copied.
- **Complete configurations were written for two real agent organisations,** from how they actually operate: a small multi-brand services business that runs its desk, social posting and releases on T3 Code (full mode), and a team that already runs its own agent kernel (bridge mode). Neither adoption has been carried out yet. The configurations hold private operational detail and are not published; what they taught is folded in, anonymised.

The configuration format is specified in [`CONFIG.md`](CONFIG.md) and checked by [`schema.json`](schema.json) plus [`../tools/validate.mjs`](../tools/validate.mjs).

T3 Code is © T3 Tools, Inc. and MIT-licensed. "T3" and "T3 Code" are trademarks of T3 Tools, Inc. This project is independent and not affiliated with T3 Tools; see [NOTICE.md](../NOTICE.md).

---

## 0. Summary

t3dot is a small company kernel that runs beside T3 Code. T3 runs the agent threads. For each seat (a role), t3dot:
- decides when it should act;
- checks that it may (gates);
- sends the wake into its T3 thread;
- watches the run;
- insists on a declared outcome.

It also records spend, decisions and external effects. It does not replace T3's apps, store transcripts or run LLM monitors.

### 0.1 Three layers, two ways to adopt

| Layer | What it does | Full mode | Bridge mode |
|---|---|---|---|
| **Bridge** | Talks to T3: credentials, seat threads, dispatch, watching, failures, usage, profiles | Uses it | Uses it, as a new executor inside the org's own kernel |
| **Kernel** | Org, work, events, admission gates, timers, leases, decisions, grants and broker, budgets and ledger, monitors, company MCP | Runs it (the t3dot service) | Keeps its own kernel and adopts six neutral contracts (§15.3) |
| **Adapters** | Event sources, the record system, the decision surface, integrations, alerts | Written per org | Usually exist already |

- **Full mode** suits an org whose agents already live in T3 Code threads, held together by scripts, schedules and prompts. t3dot becomes its control plane.
- **Bridge mode** suits an org that already runs a mature agent kernel of its own: org chart, work items, approvals, a broker. Re-platforming that kernel gains little. Swapping its model runners for T3 Code gains a lot: runner, sandbox and transcript code goes away, and the org gets T3's web, desktop and mobile apps.

### 0.2 Findings that shaped the design

| Assumption | What the code or the adopters showed | Design response |
|---|---|---|
| Confirm a run started by reading the thread within 60 s | Claude sessions can take 30–60 s to come up, and a default thread read returns the *oldest* items | Confirm from the send's `delivery` field plus shell status (§6.4, §6.5) |
| One T3 credential is enough | T3's MCP OAuth session is refused by its HTTP and WebSocket APIs, by design | Two credentials: C1 for commands; C2 for status, usage and failure detail (§7.1) |
| A queued wake will run | A send can be parked behind a **held queue** that MCP can't see; only a human or a cleanly completed run releases it | Gate G4, held-queue detection and a Needs-me item (§6.3, §7.5) |
| T3 won't start work on a usage-limited provider | A usage limit holds *queued* runs, but a send to an idle thread starts anyway | The kernel gates engine health itself (G3) |
| After a restart, re-send the wake | T3 continues runs that a restart interrupted | Observe the continuation; never double-wake (§6.9) |
| Headless T3 loses browser logins | Profiles persist headless; an agent tab is isolated only when no profile is given | Posting seats open the persistent profile (§9.3) |
| Long-lived threads are fine | MCP thread reads cost more as threads grow, and long coordination threads degrade; one production thread failed near 13,000 items | Rotation at 8,000 items with a STATE handoff; never fork (§7.6) |
| The kernel should own business records | Real orgs already have a system of record with one writer per table | The kernel consumes record events and never writes business records (I11) |
| One install per brand | Brands of one business share a phone line, a payment account, a browser session and a production deployment | One install per company; brand is a dimension |
| Build a new decisions inbox | Both adopters already had an owner console or an approvals UI | Present through surface adapters (§12) |
| A lock file per shared resource is enough | Ad-hoc lock files can be taken by two runs at once | Leases with fencing tokens (§9.5) |
| Caps and pauses can live in prompts and scripts | Prompt-level caps get waived; scripts forget to check HALT files | Caps, consent checks and pause are enforced in the broker (§9.3, §9.6) |
| Lock every seat to broker-only network access | Some seats need the open web. What matters is that secret files are unreadable, the host's services are unreachable, and credentials stay in the broker | Two postures, standard and confined (§11) |

### 0.3 Non-goals
- **No T3 fork or private patches.** Upstream patches are proposed (§7.8), and workarounds are used until they land.
- **No transcript store or chat UI.** Humans talk to seats in T3.
- **None of these:** LLM monitors, timer heartbeats with no task, agents choosing their own work, waking a parent on every child completion.
- **Not multi-tenant.** One install is one company, possibly with several brands.

### 0.4 Provenance

- **t3dot is written fresh.** It borrows ideas from Paperclip and from operating real agent teams. It includes no third-party code.
- **Paperclip is MIT.** Three small pieces may be ported later, with its notice: the quota and transient-error patterns with the reset-time parser, the output-inactivity resolver, and the process-activity sampler (which needs a macOS variant). Any port will be recorded in [NOTICE.md](../NOTICE.md).
- **T3 Code is used only through its interfaces:** MCP over HTTP, a small HTTP API, and provider-instance settings. No T3 Code source is copied. Copyright and trademark notices are in [NOTICE.md](../NOTICE.md).

---

## 1. Concepts

| Term | Meaning | Example (full mode) | Example (bridge mode) |
|---|---|---|---|
| Company | One install: brands, environments, policies | Acme Studio, with two brands | A marketing team |
| Brand | A dimension on seats, events, work, budgets and the ledger | `acme`, `acme-labs` | `product-a` |
| Environment | One T3 server the bridge drives | The office Mac mini | A cloud VM |
| Seat | A role with authority, budgets, a profile and a bound thread | `chief`, `social`, `posting-desk` | `chief`, `website` |
| Work seat | A seat that exists for one goal, project or job: its own thread, rotated, retired at close-out | A seat for the "new website" project | The org's own thread per project |
| Profile | The T3 provider instance a seat runs on: model, mode, doctrine file, sandbox | `seat-chief` (Claude, full-access) | `seat-website` (Claude, confined) |
| Binding | A seat's current T3 thread, with a generation number | chief gen 5 | website gen 2 |
| Event | A typed fact with a source and an idempotency key | `msg.inbound`, `slot.due` | `ticket.closed` |
| Route | A rule mapping an event to a seat, and optionally to a work item | `msg.inbound → chief` | `approval.decided → requester` |
| Wake | A pending request for a seat to act. It coalesces events | A chief wake carrying 3 inbound messages | A website wake |
| Gate | A check that must pass before a wake is sent | Quiet hours; `browser:social` free | Engine health |
| Run | The kernel's record of one T3 run | — | — |
| Settle | The outcome a seat declares for a wake | `complete`, `defer` | `complete`, `block` |
| Work item | A goal, project, task or job, with an owner and a next mover | A paid client job | A project with acceptance criteria |
| Next mover | What moves an open item next: a run, timer, decision, human, other work or external event | Waiting on the owner's price | Waiting on a tooling ticket |
| Timer | A time-based event source: cron, once or interval; owned by the system or a seat | The 15:55 posting slot; "wake me at 14:00" | Weekly review |
| Expectation | "This must have happened by then," checked by a monitor | Five posts a day | Scorecard by 21:45 |
| Decision | A typed ask to a decider, pinned to a content hash. **Needs-me** items are decisions of kind `assist` | A price quote | A production change |
| Standing rule | "Approve and always allow": a scope created from a decision | A follow-up template class | Low-risk blog edits |
| Grant | Permission for a seat or script to call an integration operation, with constraints | Chief may `msg.send` approved templates | Website may `github.push` to its own branch |
| Budget | A rate, money or compute limit over a window | 100 sends a day per phone line; ₹1,000 a day on ads | Tokens per seat per day |
| Lease | An exclusive hold on a resource, with a fencing token | `browser:social`, `prod:release` | `browser:shared` |
| Receipt | The idempotent record of one external effect | One WhatsApp send | One CRM write |
| Ledger | Append-only usage, spend and send records | — | — |
| Monitor | A deterministic check that emits events | Sentinel, stuck sweep | Stall scan |
| Surface | Where humans see things and decide | Owner console cards | The team's approvals UI |
| Record | A pointer into the external system of record | `sor:job/88` | A knowledge-base row |

How these terms map to the Marketing OS and Paperclip, and which ideas came from each: [GLOSSARY.md](GLOSSARY.md).

---

## 2. Invariants

Each invariant is a test target. Section 14 says how each is tested.

| # | Invariant | Enforced by |
|---|---|---|
| I1 | **Single admission.** Only the dispatcher sends to T3, and only for admitted wakes. The company MCP has no send tool | Module boundary: only C6 imports the bridge's `send` |
| I2 | At most one open wake per seat, and at most one kernel-dispatched active run per binding | Partial unique index on `wakes(seat_id)`; capacity gate G2 |
| I3 | Every blocked wake leaves a gate receipt keyed by (seat, work, gate, condition hash), with a repeat counter | Admission (C5) |
| I4 | Every open work item has exactly one next mover. Violations are found within 5 min and get one recovery item | Stuck sweep (C11) |
| I5 | Every dispatch is confirmed (the run starts) or escalated: Needs-me at 3 min if held, alert at 20 min, presenter at 40 min | Watcher (C8) plus confirm timers |
| I6 | A wake whose route requires a settle gets one, or two nudges and then a block | Settler (C9) |
| I7 | External effects go through the broker: grant, budget, lease token, receipt. An `uncertain` receipt blocks any retry with the same operation id | Broker (C13) |
| I8 | A human-gated action needs a decision pinned to the content hash. A changed hash supersedes the decision | Governance (C12) plus broker |
| I9 | An exclusive lease has one holder, and protected operations must present the current fencing token | `leases` primary key plus token check |
| I10 | Budgets fail closed: hold at 100%; unpriced spend is counted per policy | Ledger (C14), broker, gate G5 |
| I11 | The kernel never writes business records. It consumes record events, and the owning seats write | No record write path except owner-seat `act` calls |
| I12 | The kernel never stores transcripts, only refs, counts and digests | Schema |
| I13 | Secrets never appear in events, wake packets, decisions, the ledger or logs | Redaction at ingress; the packet builder accepts refs only |
| I14 | Config is revisioned. An invalid unit is disabled on its own, and its last-known-good version stays live | Config (C1) |
| I15 | Ingestion is idempotent: (source, key) is unique | `events` unique index |
| I16 | **Pause is central.** One switch stops admission and makes the broker refuse writes, for seats and scripts alike | `pauses`, checked by C5 and C13 |
| I17 | A work seat exists only while its work item is open, and a work item has at most one | Partial unique index on `seats(template_id, work_id)`; the work-seat lifecycle (§5.9) |

---

## 3. Architecture

### 3.1 Picture

```
 Humans ── T3 apps (chat with seats) ── Surface (decisions, Needs-me) ── Alerts (failures only)
                │                              ▲                               ▲
┌───────────────┼──────────────────────────────┴───────────────────────────────┴──────────┐
│ t3dot kernel · one Node process · one SQLite file · its own OS user                     │
│                                                                                         │
│ Sources ─► Ingress ─► Events ─► Router ─► Wakes ─► Admission (G0–G7) ─► Dispatcher ─────┼─► Bridge ─► T3
│ http · file tail · record outbox · timers · monitors        │ gate receipts             │      │
│                                                                                         │      │
│ Watcher ◄── shell poll every 5 s (C2) ◄─────────────────────────────────────────────────┼──────┘
│   └─► Settler: nudge/block · failure kinds · retries ─► Engine health · Ledger          │
│                                                                                         │
│ Company MCP ◄── seat threads: context · events · work · settle · decide · act · timer · lease
│ Broker: grants · budgets · leases · receipts ─► Integration adapters                    │
│ Governance: decision types · standing rules ─► Surface adapters                         │
│ Timers · Expectations · Monitors · Config (git + revisions) · CLI / Admin API · Views   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Components

| # | Component | Responsibility | Writes | Est. LOC |
|---|---|---|---|---|
| C1 | Config | Load the company directory (YAML); validate schema and cross-references; keep revisions and last-known-good per unit; apply and roll back | `config_revisions` | 900 |
| C2 | Store | SQLite in WAL mode; migrations; repositories; `BEGIN IMMEDIATE` transactions | all tables | 1,200 |
| C3 | Ingress | `POST /v1/events` with per-source HMAC; ndjson tailers with byte offsets; record-outbox poller; internal emit | `events` | 900 |
| C4 | Router | Match an event to seats plus a work rule | `wakes`, `work_items` | 400 |
| C5 | Admission | Coalesce; run gates G0–G7 in order; write receipts; re-evaluate on triggers | `wakes`, `gate_receipts`, `leases` | 900 |
| C6 | Dispatcher | Capacity and fairness; build packets; send; record runs; confirm timers | `runs` | 500 |
| C7 | Bridge | T3 client: C1 MCP (OAuth) and C2 HTTP; launch, send, read, wait, interrupt, queue, pending, organize; profiles | — | 1,100 |
| C8 | Watcher | Poll the shell every 5 s, diff it, emit run and thread events | `events`, `runs` | 500 |
| C9 | Settler | Check settles; nudge and block; classify failures; retry; maintain engine health | `runs`, `wakes`, `engine_health` | 600 |
| C10 | Timers | Cron, once and interval; compare-and-set fire claims; catch-up; seat timers | `timer_fires`, `events` | 400 |
| C11 | Monitors | Built-in sentinel, stuck sweep, expectations, held-queue scan, rotation check, lease reaper, budget roll-up, credential expiry; plus command monitors | `events` | 700 |
| C12 | Governance | Decision types, presenter routing, standing rules, surface adapters | `decisions`, `standing_rules` | 900 |
| C13 | Broker | The `act` pipeline (§9.3) and the integration adapter interface | `receipts`, `ledger` | 1,100 |
| C14 | Ledger and budgets | Append usage and spend; window roll-ups; warn and hold | `ledger`, `budget_windows` | 500 |
| C15 | Company MCP | HTTP MCP server for seat threads: identity plus 8 tools (§8) | via services | 900 |
| C16 | CLI, Admin API, views | The `t3dot` CLI; admin HTTP on localhost or Tailscale; generated `roles.json`, `schedules.md` and `health.md` | `pauses`, config | 700 |
| | **Total** | | | **≈11,800 plus ≈6,000 of tests** |

**Runtime choices:**
- TypeScript on Node 24 or later.
- `node:sqlite`, so there are no native dependencies.
- `yaml` and `ajv` for config.
- The official MCP TypeScript SDK, for both the company MCP server and the T3 MCP client.
- Plain `fetch` for C2.
- No ORM and no framework requirement.

**Why SQLite:** the kernel process is the only writer. It is boring, backed up by copying, and the same approach T3 itself uses. Scripts never open the database; they call the HTTP API. Switch to Postgres only if the kernel ever becomes multi-process.

### 3.3 Processes, users, ports

| Process | OS user | Listens on | Notes |
|---|---|---|---|
| T3 server (desktop app or `t3 serve`) | The agent OS user: the logged-in user on a desktop host, or a dedicated `t3agents` user on a server | 127.0.0.1:<T3 port> | Seat threads run here |
| t3dot kernel | `t3dot`: no login; owns the broker's secrets | 127.0.0.1:8890 for events, company MCP and admin | macOS LaunchDaemon with `UserName t3dot`, or a systemd unit |
| Event sources (desk scripts and similar) | Their own users | — | Post events; call the broker API |

- **Start order:** T3, then the kernel. The kernel tolerates T3 being down: health is set to `down` and admission blocks with receipts.
- **On kernel restart** it reconciles runs from a shell snapshot before sending anything (§6.9).
- **Why a separate OS user:** a full-access agent can read any file its OS user can read. The broker's credentials must live where that user cannot read them. A full-mode org can phase this in (M7). An org whose agents must never see integration secrets needs it from the start.

### 3.4 Interfaces

| Interface | Path | Auth | Used by |
|---|---|---|---|
| Ingress | `POST /v1/events` | HMAC-SHA256 per source (`X-T3dot-Source`, `X-T3dot-Signature`) | Desk scripts, record-outbox relay, webhooks |
| Broker API | `POST /v1/act` | Per-script token | Deterministic senders (autoreply, follow-ups) |
| Company MCP | `POST /mcp` | Seat token (Bearer) plus `X-T3-Thread` | Seat threads |
| Admin API | `/v1/admin/*` | Admin token; localhost or Tailscale only | CLI, surfaces |
| Surface adapter | In-process plugin | — | Console cards, an org's approvals system, Telegram |
| Bridge → T3 | C1: `POST <t3>/mcp`. C2: `GET <t3>/api/orchestration/shell`, `GET <t3>/api/orchestration/threads/:id/bounded` | OAuth bearer (C1); session bearer (C2) | Kernel |

---

## 4. Data model

The sketch below is SQLite. Ids are ULID text, times are UTC ISO strings, and `*_json` columns are text.

```sql
-- config
config_revisions(id PK, unit, hash, body_json, status /*applied|rejected|superseded*/, error, applied_at, applied_by)

-- org
seats(id PK, title, brands_json, reports_to, class /*reader|actor|presenter|operator*/, profile_id,
      status /*starting|active|paused|retiring|retired*/, config_rev,
      template_id /*work seats: the template seat*/, work_id /*work seats: the goal, project or job*/)
  -- partial unique: (template_id, work_id) WHERE status <> 'retired'
seat_bindings(seat_id, generation, environment_id, project_id, thread_id, kind /*seat|worker*/, parent_thread_id,
              pinned, opened_at, closed_at, close_reason, items_at_close, PRIMARY KEY(seat_id, generation, thread_id))
  -- partial unique: one open kind='seat' row per seat_id

-- work
work_items(id PK, kind /*goal|project|task|job*/, brand, title, owner_seat, parent_id,
           status /*open|active|waiting|done|blocked|cancelled*/, acceptance_json,
           next_mover_kind /*run|timer|decision|human|work|external|none*/, next_mover_ref, due_at,
           record_ref, created_by, created_at, closed_at, outcome_json)

-- flow
events(id PK, source, type, key, brand, subject_json, payload_json, occurred_at, received_at, UNIQUE(source, key))
wakes(id PK, seat_id, status /*pending|admitted|blocked|dispatched|confirmed|done|failed|expired|cancelled*/,
      event_ids_json, work_id, priority, settle /*required|optional*/, not_before, attempts,
      created_at, dispatched_at, run_id)
  -- partial unique: seat_id WHERE status IN ('pending','admitted','blocked')
gate_receipts(id PK, wake_id, seat_id, work_id, gate, condition_hash, detail, first_at, last_at, count, open)
  -- unique open row per (seat_id, work_id, gate, condition_hash)
runs(id PK, seat_id, wake_id, binding_generation, thread_id, t3_run_id, origin /*dispatched|observed|nudge*/,
     delivery /*started|queued|steered*/,
     status /*dispatched|starting|running|waiting|held|completed|failed|interrupted|cancelled|lost*/,
     failure_kind, failure_code, retry_at, settle_state /*na|unsettled|nudged1|nudged2|settled|blocked*/,
     usage_json, dispatched_at, started_at, ended_at)
settles(id PK, run_id, wake_id, seat_id, work_id, kind /*complete|block|defer|progress|ack*/, summary,
        next_mover_json, evidence_json, created_at)

-- time
timers(id PK, owner /*system|seat:<id>*/, kind /*cron|once|interval*/, spec, tz, emits_json,
       catch_up /*skip|once*/, catch_up_window_s, next_fire_at, last_fire_at, status /*active|paused|done*/,
       created_by_run)
timer_fires(timer_id, fire_at, claimed_at, event_id, PRIMARY KEY(timer_id, fire_at))
expectation_windows(expectation_id, window_start, deadline, met_event_id, missed_event_id,
                    PRIMARY KEY(expectation_id, window_start))

-- governance
decisions(id PK, type, kind /*decide|assist*/, brand, subject_ref, content_hash, content_ref, options_json,
          recommendation, requested_by_seat, presenter_seat, decider /*human|seat:<id>*/,
          status /*draft|presented|decided|superseded|expired|withdrawn*/, result_json, decided_by,
          decided_at, expires_at, surface_ref)
standing_rules(id PK, from_decision, decision_type, scope_json, limits_json, uses, last_used_at,
               expires_at, revoked_at)
grants(id PK, actor /*seat:<id>|script:<id>*/, op_pattern, constraints_json, revision,
       source /*config|decision:<id>*/, expires_at, revoked_at)

-- resources and money
leases(name PK, holder /*seat:<id>|script:<id>|NULL*/, fencing_token INTEGER, acquired_at, renewed_at,
       expires_at, meta_json)
lease_events(id PK, name, kind /*acquire|renew|release|expire|deny*/, holder, token, at)
receipts(id PK, op, actor, run_id, operation_id UNIQUE, status /*in_progress|ok|failed|uncertain*/,
         request_digest, response_digest, lease_token, decision_id, started_at, ended_at)
ledger(id PK, kind /*tokens|runs|usd|inr|sends|minutes|calls*/, amount, unit,
       cost_status /*reported|estimated|unpriced*/, actor, brand, run_id, op, budget_ids_json,
       idempotency_key UNIQUE, at)
budget_windows(budget_id, window_start, used, reserved, state /*ok|warn|hold*/,
               PRIMARY KEY(budget_id, window_start))

-- operations
engine_health(target PK /*instance:<id>|gateway:<id>*/, state /*ok|degraded|held|down*/, reason,
              held_until, updated_at)
pauses(id PK, scope /*global|brand:<id>|seat:<id>|integration:<id>*/, reason, set_by, set_at, cleared_at)
audit(id PK, actor, action, target, detail_json, at)
```

**Retention:**
- Events: 180 days; payloads are trimmed to digests after 30.
- Gate receipts: closed rows are pruned after 30 days.
- Runs, settles, receipts, ledger, decisions and audit: kept, since they are small.

---

## 5. Lifecycles

### 5.1 One event, end to end (an inbound customer message)

1. A webhook relay posts `msg.inbound` with key = the provider's message id. Duplicates are dropped.
2. The router matches `msg.inbound → chief`. It attaches the event to work "conversation `<record ref>`", creating it if absent, with priority `high` and settle `required`.
3. If the chief has an open wake, the event id is appended. Otherwise a wake is created. A 30 s coalesce window batches bursts.
4. Admission runs G0–G7 (§6.3). All pass.
5. The dispatcher builds the packet and calls `t3_thread_send(queue, key = wake id)`. The result is `delivery: started`, and the run is recorded as `starting`.
6. The watcher sees the run move to running. The wake becomes `confirmed`.
7. The seat calls `company_context` and `events_get`, drafts a reply, and calls `act msg.send`. The broker checks the grant, the line's daily send budget, consent, the template rule and quiet hours, writes the receipt, then sends. The seat calls `settle complete`.
8. The watcher sees the run complete. The settler finds the settle, closes the wake, and writes usage to the ledger (C2 bounded read).
9. If no settle arrives: nudge twice, then block the work item as `unsettled` and notify the presenter.

### 5.2 Wake states

```
pending ─► blocked ⇄ pending ─► admitted ─► dispatched ─► confirmed ─► done
                                               │              └──► failed ─► pending (not_before, if retryable)
                                               └─► (held) ─► Needs-me 3 min ─► alert 20 min ─► presenter 40 min
pending/blocked ─► expired (route TTL) · cancelled (pause clears it, or the seat is retired)
```

### 5.3 Run states

| T3 status | Kernel status |
|---|---|
| preparing, queued, starting | `starting` |
| running | `running` |
| waiting (a question or approval is pending) | `waiting` |
| completed, failed, interrupted, cancelled | same |
| rolled_back | `cancelled` |

There are three kernel-only statuses:
- `dispatched`: sent, with no T3 run id seen yet.
- `held`: queued behind a held queue.
- `lost`: the outcome is unknown after a kernel restart, until it is reconciled.

**Settle sub-state** (only for wakes that require a settle): `unsettled → nudged1 → nudged2 → blocked`, or `settled` at any point.

### 5.4 Work items and next movers

- **Statuses:** `open → active` (a run holds it) `→ waiting` (with a next mover) `→ done | blocked | cancelled`.
- **Next-mover kinds:** `run`, `timer` (timer id), `decision` (decision id), `human` (Needs-me id), `work` (blocked on another item), `external` (an expected event type plus a deadline). `none` is a violation unless the item is closed.
- **Rules:**
  - `settle(defer|block)` must name a next mover.
  - The stuck sweep runs every 5 min. It flags `none`, as well as dangling references such as an expired timer or a decided decision with no follow-up wake. Each work item gets at most one open recovery item, routed to its owner's presenter.
- **Who may create work for whom:** a seat may create work for itself and its direct reports. For anyone else it uses `work request`, which goes to that seat's presenter.

### 5.5 Decisions

`draft → presented → decided(option) | superseded (subject hash changed) | expired | withdrawn`.
- "Approve and always allow" writes the standing rule in the **same transaction**, no wider than the type's `max_scope`.
- `decision.decided` is emitted and routed back to the requesting seat.
- Needs-me items (`kind: assist`) skip the presenter and go straight to the surface.

### 5.6 Leases

`free → held (token n+1) → renewed … → released | expired (reaper) → free`.
- Every acquire increments the token.
- Protected broker operations pass the token. A stale token returns `lease_lost`.
- Preconditions are checked at acquire time.

### 5.7 Bindings and rotation

`active (gen n) → rotating → closed`, with gen n+1 becoming active.
- **Triggers:** items ≥ `max_items` (default 8,000; a long-lived production coordination thread failed near 13,000 items), age ≥ `max_age_days`, provider context overflow, or a manual request.
- Rotation starts only when the binding has no active run. The algorithm is in §7.6.

### 5.8 Timers

`scheduled → due → claimed` (a compare-and-set insert into `timer_fires`) `→ event emitted`.
- **Catch-up after downtime:** `skip` (emits `timer.missed`) or `once` within `catch_up_window_s`.
- One-shot timers end in `done`.
- Seat-owned timers count toward a per-seat cap, default 20. This replaces agents creating self-deleting one-off T3 schedules as reminders.

### 5.9 Work seats

A work seat is a seat that exists for one goal, project or job. It gives that work item its own thread, the way the Marketing OS gives every goal and project an owner thread, with two changes learned from running it: the thread rotates, and the seat wakes only when something needs it.

`starting → active ⇄ rotating → retiring → retired`. Reopening the work item starts the seat again with a new generation.

- **Template.** A seat with `per_work: {kind, owners, max_active, close_decision}` is a template, not a seat. The kernel creates one instance for each open work item of that kind whose owner is in `owners` (any owner if omitted). An instance:
  - has the id `<template>.<work id>`;
  - takes the template's profile, class, wake settings, rotation and doctrine;
  - gets its own windows for the template's budgets;
  - reports to the work item's owner seat.
- **Start.** When a matching work item opens, the kernel creates the instance and launches its thread with a brief: the item's acceptance, its parent, its owner, budgets and doctrine links. It pins the thread and binds generation 1. The item's next mover becomes the seat.
- **Authority.** An instance may create work for its owner seat's direct reports, within its work item's subtree, and uses `work request` for anyone else. It cannot close its own item. It proposes close-out with `decide`, using the `close_decision` type pinned to its outcome summary; without one, the owner seat closes the item.
- **Wakes.**
  - Route each child's `work.done` to the seat with `delivery: passive`, so completions arrive as context.
  - Wake it on `work.children_done` (every child done or cancelled), `work.blocked`, `work.stuck`, its own timers, decisions, and people messaging it.
  - Why: the Marketing OS woke owners on every child notice, and in a measured two-day sample that coordination took most of its model spend. Paperclip wakes a parent only when all its children finish.
- **Rotation.** As for any seat (§7.6). A project can outlive many threads. The Marketing OS's owner threads never rotated, so each coordination run reread millions of cached tokens.
- **Close-out.** When the item is done or cancelled, the kernel holds admission, waits for any active run, writes the seat's last settle into the item's outcome, settles and archives the thread, and retires the instance.
- **Reopen.** Reopening the item reactivates the instance with a new generation. The brief carries the previous outcome.
- **Cap.** With `max_active` instances open, a new matching item gets no seat. Its owner seat owns it directly, and the kernel writes a gate receipt (`work_seat_cap`). The oldest waiting item gets a seat when one frees.

---

## 6. The admission pipeline

### 6.1 Ingest
- **Checks:** source auth, a known event type, payload ≤16 KB (larger content stays at the source and is referenced in `subject`). Secret-shaped strings are redacted. A brand is assigned from the payload or the source's default. The event is then inserted on (source, key).
- **File tailers** keep byte offsets per file and handle file rotation. A mapping in `sources.yaml` turns each ndjson line into an event. Script-based setups often already write the append-only logs they need, so shadow mode can start without changing any script.
- **Record events** arrive the same way, from the SoR outbox.

### 6.2 Route and coalesce
- **Matching:** the first matching route wins unless it sets `fanout: true`. A target is one of:
  - a seat id;
  - `owner_of: <subject field>`;
  - a built-in resolver: `brand_head`, `job_seat`, `presenter_of`, or `work_seat`. `work_seat` picks the work seat of the event's work item, or of its nearest ancestor that has one; if none has one, the item's owner seat.
- **Work rule:** `attach` (find open work by record ref), `create` (kind plus title template), or none.
- **Coalescing:** one open wake per seat. New events append to it, and its priority becomes the maximum. A per-seat `coalesce_window_s` batches bursts. At most `max_events` per packet (default 20); the rest wait for the next wake.
- **During an active run:** new events attach to the seat's next wake, which is sent when the run ends. Steering is opt-in per route (`delivery: steer`), for urgent stops only.
- **Passive delivery:** a route with `delivery: passive` attaches its events to the seat's next wake as context but never creates a wake by itself.
- **Assist routes:** a route with `to: {assist: <type>}` raises a Needs-me item directly and wakes no seat. Examples: a credential about to expire, a held queue.
- **Pacing:** `seat.wake.min_interval_s` sets the minimum time between two wakes of the same seat. For example: at most one coordination turn a minute.

### 6.3 Gates, in fixed order

| Gate | Blocks when | Re-evaluated on |
|---|---|---|
| G0 paused | Any pause matches the seat, its brand, or global | Pause cleared |
| G1 seat | The seat is not active or has no open binding | Config apply, rebind |
| G2 capacity | The binding has an active run (dispatched or observed), or the provider's concurrency cap is reached | Run end |
| G3 engine | The profile's instance or gateway is `held` or `down` | Health change, `held_until` |
| G4 thread | The thread is archived, its queue is held, or a runtime request (question or approval) is pending | Watcher change |
| G5 budget | A compute budget on the seat or brand is at hold | Window roll, override decision |
| G6 preconditions | Any predicate on the seat or route is false | The predicate's trigger, or every 60 s |
| G7 leases | A required lease is held by someone else, or its precondition fails | Lease release |

- **Receipts:** a blocked gate writes one receipt per (seat, work, gate, condition hash) and bumps its counter on repeats.
- **Leases taken at G7** go into the packet. They are released on settle, at run end, or on explicit release.
- **Predicates are built-in kinds, with no general expression language:**
  - `time_window`, `quiet_hours`, `file_exists`, `file_fresh`, `disk_free`;
  - `event_seen` (type, filter, within);
  - `lease_free`, `budget_left`, `health_ok`;
  - `record_query` (a named query through the record adapter);
  - `command`: an argv run as the kernel user with a timeout, where exit 0 means true. This is the escape hatch.

### 6.4 Dispatch
- **Capacity:** per-provider caps (for example at most 4 Claude and 3 Codex runs at once) and a global cap. Order: priority, then oldest wake.
- **The packet** is at most 2,000 characters and holds references only:

```
[t3dot wake w_01JC… · seat chief · gen 5 · brand acme]
Events (3): msg.inbound e_812, e_815 · form.submitted e_820
Work: t_311 "Conversation <ref>" (next mover: you)
Leases: none · Budgets: line main sends 61/100 today
Do: handle per kb://playbooks/inbound
Pull details with company_context and events_get. End with settle(wake=w_01JC…, kind=…).
```

- **Send:** `t3_thread_send {threadId, message, mode:"queue", clientRequestId:"wake:<wakeId>:<attempt>"}`.
- **An uncertain send** (timeout, or the connection dropped) is never re-sent blindly. The same `clientRequestId` gives a deterministic message id, so the kernel looks that message up before retrying.
- `delivery: started` → the run is `starting`.
- `delivery: queued` → check the shell. If the thread has an active run, the wake will start after it. If not, the queue is held: the run becomes `held` and goes to the escalation path (§6.5).

### 6.5 Confirm and escalate
- A run is confirmed when the watcher sees it starting or running. Claude can take 30–60 s to come up.
- Not started after 3 min, or held: a Needs-me item goes to the surface ("seat X's queue is held; open its thread once").
- 20 min: alert channel.
- 40 min: a presenter decision to cancel or redirect.

### 6.6 Watch
- **Every 5 s:** `GET /api/orchestration/shell` with C2 (header `x-t3-orchestration-protocol: 2`). For each bound thread and each observed child, diff:
  - `status`, `latestRunId`, `latestRunCompletedAt`, `activeRunId`;
  - `lastErrorClass`, `lastErrorCode`, `usageLimitResetAt`;
  - `pendingRuntimeRequest`, `itemCount`.
- **Detect completion from `latestRunId` / `latestRunCompletedAt`,** not from status alone. The shell keeps only the latest state per thread.
- **Emits:** `run.started`, `run.completed`, `run.failed`, `run.waiting`, `thread.held`, `thread.oversize`, `t3.down`, `t3.up`.
- **Fallback without C2:** loop `t3_thread_wait` per in-flight run in slices of ≤60 s, plus `t3_thread_read {limit:1, runLimit:5}` for pending counts.
- **Upgrade path:** a WS `subscribeShell` push stream, once proven.

### 6.7 Settle and nudge
- Each route sets `settle: required | optional`. For optional (FYI) events, a completed run counts as the ack.
- **Required but missing:**
  1. Nudge 1 right after completion.
  2. Nudge 2 after 10 min.
  3. Then block the work item as `blocked: unsettled` and inform the presenter.
- Nudges are runs too (origin `nudge`) and count against budgets.
- A settle normally arrives during the run. Late settles are accepted until the block.

### 6.8 Failure kinds

| Kind | Detected from | Action | Counts as an attempt |
|---|---|---|---|
| `quota` | Shell `lastErrorClass = usage_limit`, or the quota regex; reset time from `usageLimitResetAt` or parsed text | Engine `held` until the reset; the wake returns to pending with `not_before` | No |
| `transient` | `provider_error` / `transport_error` with 429/503/529, or the transient regex | Retry at 1, 5 and 15 min (3 max). Three strikes on one gateway within 30 min mark the gateway `degraded` | Yes |
| `auth` | `permission_error`, or sign-in failure text | Engine `down`; Needs-me | No |
| `context` | Overflow code or text | Rotate the binding; retry once | Yes |
| `stall` | `waiting` on a question or approval for more than 5 min | Needs-me. Questions can be answered with `t3_pending_request`; approvals need C2 over WS | — |
| `silent` | `running` with no `itemCount` change: suspicious at 5 min, critical at 15 | Alert. Interrupt at 30 min if the seat's policy allows | — |
| `unknown` | Anything else | Retry once, then block with the error text | Yes |

Engine health is tracked **per provider instance and per gateway**, because one gateway may front both Claude and Codex.

### 6.9 Observed runs and restarts
- **Observed runs:** the kernel records runs it did not dispatch with origin `observed`. Examples: a human typing in a seat thread, T3's own "continue where you left off," or a seat's delegated child. They occupy capacity (G2) and need no settle.
- **Kernel restart:**
  1. Load the open runs.
  2. Take a shell snapshot.
  3. Reconcile each run as completed, failed or still running. Mark a run `lost` only if the thread shows no such run.
  4. Never re-send a wake whose run may still be live.
- **T3 restart:** T3 cancels unfinished runs and may auto-continue them. The kernel waits on the resulting observed runs. It re-dispatches a wake only if its run ended `cancelled` with no continuation within 5 min.

### 6.10 Cost control
- Each seat has `max_wakes_per_day` and compute budgets (tokens and runs per day). Going over triggers a G5 hold and a presenter notice.
- A settle `ack` with no effects counts as a no-op. Each seat's daily no-op rate is shown on the health page; no-op runs are common in coordination-heavy setups, so they are measured from day one.

---

## 7. The T3 bridge

### 7.1 Credentials

| | What | How to get it | Lifetime | Used for |
|---|---|---|---|---|
| **C1** | MCP OAuth bearer | Headless OAuth with a pairing code, approved once. The access level must be ≥ the highest seat runtime mode the kernel drives. Smallest safe choice: `approval-required` C1 with seat profiles using `--permission-mode dontAsk` and an allow list, once the contract suite proves `dontAsk` never prompts under T3. Until then, `auto` or `full-access`. Record the level in `environments[].credentials.c1_access`; the validator rejects profiles above it | 30 days, with no refresh. Re-authorize at day 25; a monitor emits `t3.credential_expiring` | Launch, send, read, wait, interrupt, queue, pending, organize |
| **C2** | Session bearer | On the T3 host: `t3 auth session issue --scope orchestration:read --scope orchestration:operate --scope diagnostics:read [--scope providers:manage] --ttl 3650d --label t3dot-kernel --token-only` | Up to the TTL | Shell, bounded thread reads, quota windows, profile upserts |

Both live in the kernel's secret store (mode 0600, kernel user), never in the config repo.

### 7.2 Calls

| Purpose | Call | Credential |
|---|---|---|
| Catalog | `orchestrator_capabilities`, `t3_project_list` | C1 |
| Seat thread | `t3_thread_launch {projectId, title, modelSelection:{instanceId, model}, runtimeMode, workspaceStrategy, message, clientRequestId}`, then `t3_thread_organize {action:"pin"}` | C1 |
| Wake or nudge | `t3_thread_send {threadId, message, mode:"queue", clientRequestId}` | C1 |
| Run detail | `t3_thread_read {threadId, limit:1, runLimit:5}` (never the default read on big threads) | C1 |
| Wait (fallback) | `t3_thread_wait {threadId, runId, timeoutMs ≤60000}` | C1 |
| Status of everything | `GET /api/orchestration/shell` | C2 |
| Failure text | `t3_thread_read {view:"activity", afterPosition:itemCount-60, limit:60}` | C1 |
| Usage | `GET /api/orchestration/threads/:id/bounded` → the run's provider turns → `turnTokenUsage` | C2 |
| Questions | `t3_pending_request {action:"list"\|"read"\|"respond"}` | C1 |
| Stop | `t3_thread_interrupt {threadId, runId, reason}`. The kernel never passes `stop:true`, because that holds the queue, and only a human can release a hold | C1 |
| Queue hygiene | `t3_queue {action:"list"\|"cancel"}` | C1 |
| Quota windows | WS `server.getConfig` → `providers[].usageLimits` | C2 |
| Profiles | WS `server.updateSettings {providerInstanceMutation:{operation:"upsert", …}}`, or editing `settings.json` | C2 + `providers:manage` |
| Rotation | Launch plus `t3_thread_organize {action:"archive"}` on the old thread | C1 |

### 7.3 Seat profiles (T3 provider instances)

- **One instance per standing seat,** id `seat-<seat>`. Every seat on one provider shares the same `homePath`, which keeps native resume working.
- **Claude instance:**
  - `config.launchArgs`: `--settings /abs/profiles/<seat>/settings.json --append-system-prompt-file /abs/profiles/<seat>/DOCTRINE.md`
  - `config.idleCompaction: "off"`, so the resume dialog never blocks an unattended wake
  - `environment: [{name: "T3DOT_SEAT_TOKEN", value: {secretRef}, sensitive: true}]`
- **Codex instance:**
  - `config.launchArgs`: `-c mcp_servers.company.url=http://127.0.0.1:8890/mcp -c mcp_servers.company.bearer_token_env_var=T3DOT_SEAT_TOKEN`
  - `AGENTS.md` in the seat's project carries the doctrine.
  - Codex runs one app-server per instance. Seats on Codex cost one app-server each.
- **Company MCP declaration for Claude.** One server entry, `company`, whose headers send `Authorization: Bearer ${T3DOT_SEAT_TOKEN}` and `X-T3-Thread: ${T3CODE_THREAD_ID}`. Three candidate placements, to be chosen by the M2 contract test because each depends on CLI behavior that is unverified:
  - (a) `--mcp-config /abs/company-mcp.json` in `launchArgs`;
  - (b) a user-scope entry in the shared Claude home;
  - (c) a project `.mcp.json`, pre-approved with `enabledMcpjsonServers` in the seat's settings file.
- **The settings file** holds `permissions.deny` for the T3 tools the posture forbids (§11), the company server approval, and, for the confined posture, a `sandbox` block.
- **File rules:** absolute paths only. Files are owned by the kernel user and readable but not writable by the T3 user. Relative paths resolve against the thread's cwd, where the agent could rewrite them.
- **Changing a profile closes the instance's live sessions**. Apply changes at rotation, or while the seat is idle with admission held.
- **Ephemeral threads** (job threads, delegates) run on shared `worker-claude` / `worker-codex` profiles. They are registered as `kind: worker` bindings under their seat and identify by thread id.

### 7.4 Seat threads
- **Launch on the seat instance from the start.** `t3_thread_configure` later is a provider switch with a transcript handoff.
- **Pin the thread.** Unpinned threads auto-settle after 3 idle days, and settled threads skip restart continuation and limit recovery.
- **Project:** the seat's working project, either a repository or a workspace directory.
- **Human chat:** `seat.human_chat: true` lets humans message the thread directly; those runs are observed. That suits an owner-facing chief seat; a bridge-mode org usually sets it to false.
- **Launch idle, then send.** When the kernel must record a binding before the first turn starts (for example, a kernel with write-once bindings), it launches the thread with no message, records the binding, and then sends.
- **Binding models:**
  - `per_seat` (the t3dot default): one long-lived thread per seat, rotated.
  - `per_conversation` (typical in bridge mode): one T3 thread per goal, project or task conversation, recorded by the org's runner. Closed conversations' threads are archived 7 days after close, to keep the shell small.
  - Work seats (§5.9) bind `per_seat` for the life of their work item: one thread at a time, rotated, and closed when the item closes.

### 7.5 Held queues and pending requests
- **Detecting holds:** MCP cannot see `queueHeld`. A thread that has queued runs but no `activeRunId` in the shell is treated as held. Gate G4 checks this before a send, and §6.4 re-checks after a `queued` delivery.
- **Releasing holds:** only a human send from web or mobile, or a cleanly completed run, releases one. The kernel raises a Needs-me item: "open seat X and send 'resume'."
- **Pending questions** (for example Claude's resume dialog, if `idleCompaction` is not off) may be answered through `t3_pending_request` when policy allows.
- **Permission approvals** need C2 over WS. Avoid them by running seats in modes that never prompt.

### 7.6 Rotation
1. Wait until there is no active run, then hold admission for the seat. **Children:** a delegated child reports to the thread that created it, so a rotation would strand its completion.
   - Wait for live children to finish, up to a limit.
   - Re-create standing children (long-lived delegates) from the new generation, with their briefs and STATE.
   - Record any child that is still running as `kind: worker` under the new binding, so the watcher keeps tracking it.
2. Build a STATE brief of at most 20k characters:
   - the doctrine hash;
   - open work with next movers;
   - held leases;
   - pending decisions;
   - the last 10 settles;
   - `kb://` links.
3. `t3_thread_launch {projectId, title:"<seat> · gen n+1", modelSelection:{instanceId:"seat-<seat>", model}, runtimeMode, message:<brief>, clientRequestId:"rotate:<seat>:<n+1>"}`.
4. Pin the new thread and rebind the seat. Delete any T3 schedules bound to the old thread, because archive leaves them behind. Then settle and archive the old thread.
5. Release admission and emit `seat.rotated`.

**Never fork a thread to rotate it**: a fork keeps every item and the full context.

### 7.7 Usage capture
- After each terminal run, the bridge reads the run's provider turns through the C2 bounded read and writes `turnTokenUsage` to the ledger as tokens.
- Cost is `estimated` from a rate card, or `unpriced` on subscription gateways, which report $0.

### 7.8 Gaps, workarounds and upstream patches

| Gap | Workaround now | Upstream patch |
|---|---|---|
| MCP runs have no failure class or usage | C2 shell plus bounded read | #1 Thread reads report failure and usage (~120 LOC) |
| `t3_thread_wait` ignores pending requests | Check `pendingRequestCount` between slices | #2 |
| No wait across many threads | Shell poll | #3 |
| No outbound events | Shell poll | #4 Lifecycle webhooks. #22595 was closed unmerged; get maintainer buy-in first |
| No per-thread instructions or MCP servers | One instance per seat | #5 (~200–300 LOC) |
| Thread identity for company servers | Seat token plus a `T3CODE_THREAD_ID` header (Claude) | #6 Signed thread headers on declared servers. Codex shells already get `T3CODE_THREAD_ID` (#28604); its MCP calls don't |
| Held queues are invisible and can't be released over MCP | Detect via C2; Needs-me | New: `queueHeldCount` on reads, plus `t3_queue {action:"resume"}` |
| An idle send ignores usage limits | Gate G3 | — |

### 7.9 Version pinning and contract tests
- Pin the T3 version per environment.
- Before upgrading T3, run the bridge contract suite against a scratch T3 home using the free `Replay (dev)` provider. It covers: launch, send, delivery values, shell diffing, held queue, pending request, restart continuation, and rotation.

---

## 8. Company MCP (the agent-facing surface)

### 8.1 Identity
- **Credentials:** the Bearer is the seat token from the seat instance's environment. Claude seats also send `X-T3-Thread` from `${T3CODE_THREAD_ID}`.
- **Check:** the thread must be the seat's open binding or a registered worker under it. Anything else is rejected.
- **Codex seats:** since T3 Code #28604, Codex shell commands get `T3CODE_THREAD_ID`, but MCP calls from a Codex thread see only the instance's environment. With one instance per seat, the identity is the seat.
- **Strength:**
  - "Honest agent" while seats and the kernel share an OS user, since a full-access agent could read another seat's token.
  - "Confined" once the kernel runs as its own user (M7) and seat tokens are the only secrets agents can see.

### 8.2 Tools

Eight tools, kept small because Codex pays for every tool schema on each request:

```ts
company_context(): { seat, brands, binding: {gen, thread}, wake?: {id, events: Summary[]}, work: WorkBrief[≤20],
                     leases: {name, token, expires}[], budgets: {id, left, window}[], decisions: DecisionBrief[], links: string[] }
events_get({ ids: string[≤20] }): { events: {id, type, brand, occurred_at, subject, payload}[] }
work({ action: "create"|"update"|"request"|"get"|"list", id?, kind?, title?, owner?, parent?, acceptance?, status?,
       next_mover?: NextMover, record_ref? }): WorkItem | WorkItem[]
settle({ wake: string, kind: "complete"|"block"|"defer"|"progress"|"ack", summary: string≤2000,
         next_mover?: NextMover, evidence?: string[] }): { ok: true, work_status }
decide({ type, subject_ref, content?: string≤8000, content_ref?, options: {id, label}[], recommendation? }
       | { status: decisionId }): { id, status, result? }
act({ op: string, params: object, operation_id: string, lease_token?: number }):
       { receipt: string, status: "ok"|"failed"|"uncertain", result?: object }
timer({ action: "set"|"cancel"|"list", at?: ISO, cron?: string, note?: string, id? }): Timer | Timer[]
lease({ action: "acquire"|"renew"|"release", name: string }): { name, token?, expires? }
// NextMover = {kind:"timer", at} | {kind:"decision", id} | {kind:"human", ask} | {kind:"work", id}
//           | {kind:"external", event_type, by}
```

There is also a `company_help({topic})` tool for short docs, so instructions don't bloat the tool list.

### 8.3 Errors

Typed error codes:
- `not_authorized`, `grant_missing`, `budget_hold`, `lease_lost`, `paused`, `invalid`, `not_found`;
- `decision_required`, which carries a draft decision id;
- `uncertain_retry_blocked`.

---

## 9. Governance

### 9.1 Decision types, floors, delegation
- **Each decision type sets:**
  - presenter;
  - deciders (human, or seats with limits);
  - `pin` (whether a content hash is required);
  - expiry;
  - `always_allow` (allowed, and the maximum scope);
  - `floor` (true means only a human may decide; it is never delegated and never covered by a standing rule).
- **Floors are per company.** Typical floors: price quotes, sending deliverables to clients, moving or committing money, contracts, deletions, and new outbound campaigns.
- **Delegated approvers are first-class.** In practice lead agents end up approving other agents' work, sometimes including customer-facing messages. t3dot makes that explicit and bounded instead of accidental.
- **Two lanes**:
  - Decisions, curated by the presenter.
  - Needs-me (`kind: assist`: logins, 2FA, held queues, permission prompts), sent straight to the surface.

### 9.2 Standing rules
- A standing rule can only be created by a decision where the human picked "always allow."
- Its scope is at most the type's `max_scope`. Limits are a count per day and an amount.
- It is revocable, and its stats are shown, for example "14 of 14 approved unchanged".

### 9.3 The broker pipeline (`act`)

1. Pause check.
2. Grant check for (actor, op), with constraints: audience, templates, `must_not_match`, quiet-hours predicate, cooldown, `max_per_run`, expiry.
3. Decision check. If the op `requires_decision`, a matching standing rule or a decided decision whose pinned hash equals the params digest must exist. Otherwise return `decision_required`.
4. Reserve the budgets.
5. Check the lease token, if the op is protected.
6. Run adapter hooks, for example `can_contact` through the record adapter.
7. Write receipt `in_progress`. The `operation_id` is unique.
8. Call the adapter.
9. Set the receipt to `ok`, `failed` or `uncertain`. Write the ledger row and turn the budget reservation into usage.

**Grants** are revisioned rows. The initial set comes from config. Later changes go through a `grant_change` decision. This replaces hand-edited grant files, which have no history and no approval path.

**Browser-driven effects** (for example posting to Instagram through T3's browser) can't be brokered call by call. They are controlled by three things together:
- the lease on the browser profile;
- a `post.intent` act that records the intent and spends the budget before posting;
- settle evidence (the post URL), audited afterwards.

Posting seats open T3's persistent browser profile (`preview_open` with `profileId: "default"`). Without a profile, an agent tab gets a throwaway context, and its logins are gone.

### 9.4 Budgets
- **Kinds:** rate (a count), money (a currency amount), compute (tokens or runs), balance (a prepaid amount that refills only by event), gauge (a configured level, such as an ad platform's daily budget setting).
- **Windows:** `run`, `minute`, `hour`, `day` (company timezone), `utc_day`, `rolling_24h`, `week`, `month`, `lifetime`.
- **Scopes:** seat, brand, line (for example one WhatsApp number), integration, company.
- **Thresholds:** `warn` at 0.8 notifies the presenter. `hold` at 1.0 blocks admission and the broker. An override needs a decision.
- **Subscription providers report $0**, so compute budgets count tokens and runs; dollars apply only where something is priced.

### 9.5 Leases
- Each lease is configured with a name, an exclusive mode, a TTL, a renewal interval, allowed holders (seats or scripts), preconditions, and the op patterns it protects.
- Protected ops require the current fencing token. This fixes ad-hoc lock files, which two runs can take over at once and which carry no token.

### 9.6 Pause
- Set it with `t3dot pause --scope <scope> --reason …`, or with a watched file mapped to a scope. For example, `~/.acme/HALT` maps to a global pause.
- A pause stops admission, and the broker refuses writes from seats and scripts alike. A HALT file that every script must remember to check is easy to miss; routing writes through the broker makes the pause real.

### 9.7 Reader/actor separation
- A seat with `class: reader` cannot hold outbound-messaging write grants.
- A reader drafts. Then a decision or standing rule approves, and an actor seat or a deterministic sender executes.
- This implements the "Rule of Two": a session that reads untrusted inbound content does not also send.

### 9.8 Config change control
- **Source of truth:** a git repository.
- **Apply:** `t3dot config apply` validates, stores one revision per unit, and applies atomically. A failing unit keeps its last-known-good revision and raises a notice.
- **Rollback:** re-apply an older revision through the same path.
- With `change_control: decided`, changes to doctrine, grants or policy need a `policy_change` decision.

---

## 10. Records, knowledge, workspaces

- **Record adapter interface:** `get(ref)`, `query(name, params)` for predicates, `subscribe()` from the outbox into events, and `act` ops. Only owner seats may write, following the system of record's single-writer rule.
- **KB → doctrine:**
  - KB pages carry `applies_to: [seats]` in their frontmatter.
  - `t3dot doctrine build` renders one `DOCTRINE.md` per seat in a stable order, with a hash.
  - A change updates the profile at the next rotation.
- **Workspaces:**
  - Seats work in their T3 projects. Per-job threads can work in a per-client folder such as `clients/<client>/<project>/`.
  - If a broker runs Git for agents, seats may need real clones instead of T3 worktrees, because a worktree's `.git` is a file, not a directory.
- **Files as views:** the kernel generates `roles.json`, `schedules.md` and `health.md`. That makes it the single writer of files that today have several.

---

## 11. Security model

| Threat | Control | Residual risk |
|---|---|---|
| An agent reads broker credentials | The kernel runs as its own OS user, with secrets in 0700 storage. T3 instance env holds only seat tokens | Until M7, an honest-agent model |
| An agent calls a provider API directly | No reachable credentials (after M7); egress rules in the confined posture | Browser sessions in T3 profiles stay usable by seats that hold the lease |
| Prompt injection from inbound customer messages causes sends | Reader/actor separation; template grants; `must_not_match`; pinned decisions for anything that isn't a template | Template content itself |
| A seat spawns ungoverned threads through T3 tools | The profile's `permissions.deny` covers forbidden `mcp__t3-code__*` tools; observed children are recorded | Standard posture allows `delegate_task` for workers |
| Spoofed identity on the company MCP | Seat token plus thread cross-check | Same OS user until M7 |
| Kernel compromise | Bind to localhost; admin over Tailscale only; audit log; C1/C2 in the secret store | The kernel holds C1, often at full-access, so it is the crown jewel |
| Duplicate effects after crashes | Unique `operation_id` receipts; `uncertain` blocks blind retries | Adapters that can't report outcomes |
| Spoofed event sources | HMAC per HTTP source; tailed files owned by their writers | — |
| A seat rewrites its own permissions or hooks. T3 never sets Claude's `settingSources`, so project-tier `.claude/settings.json`, `CLAUDE.md` and `.mcp.json` in the cwd all load | Confined posture: those files are owned by another user and immutable; `disableAllHooks`; `enableAllProjectMcpServers: false`; security settings in the flag-tier `--settings` file | Precedence of `disableAllHooks` over planted hooks is unverified; the contract suite tests it |

**Postures:**
- **Standard** (seats that need a real desktop: logged-in browser sessions, CAD tools, cluster CLIs, the open web):
  - Claude in full-access with open network.
  - External effects are controlled at the broker.
  - Secrets move to the kernel user in M7.
- **Confined** (seats that must never see integration secrets):
  - T3 runs as a dedicated `t3agents` user that cannot read the kernel's or broker's configuration, secrets, or other seats' workspaces.
  - Firewall owner-match rules (for example nftables) block host services and private address ranges.
  - Claude's `sandbox` block is a second layer.
  - Codex seats have no unattended confined mode in T3 today: in `auto` mode, Codex's auto-reviewer can approve escalations. They rely on OS-user confinement, or stay on the org's own runner.

---

## 12. Human surfaces and alerts

- **Surface adapter interface:** `present(item)`, `withdraw(id)`, and `results()` (a poll or a callback). Implementations:

  | Adapter | For | Notes |
  |---|---|---|
  | `console_cards` | An owner console the org already uses | Writes cards in the console's own format, adding the pinned hash and always-allow fields |
  | `approvals_api` | An org's existing approvals system | Presents and reads decisions through that system's API |
  | `telegram` | An optional second channel | A plain bot with no AI: inline Approve / Reject / Snooze buttons for pinned decisions, plus failure alerts |
  | `t3_thread` | Fallback | Posts a compact card into a designated human-facing thread |

- **Alert policy:**
  - Failures only, deduplicated by key.
  - Critical-only overnight, per company quiet hours.
  - Channels in order: surface card, then Telegram, then email.
  - Kernel alerts never go out on the messaging line customers use.
- **Chat** stays in the T3 apps, unchanged.

---

## 13. Operations

| Topic | Plan |
|---|---|
| Install | macOS: kernel as a LaunchDaemon with `UserName t3dot`; T3 as `t3 service install` (a LaunchAgent, which runs only while the user is logged in). Linux: kernel as a systemd unit; T3 as a user unit plus `t3 service protect` |
| Health | `GET /healthz` (process), `GET /v1/admin/health` (T3 up, gateways, held queues, stuck items, budgets, credential expiry, commit SHA) |
| Metrics | Wakes/day, no-op rate, dispatch→start p50/p90, unsettled rate, nudges, gate blocks by gate, stuck items, failures by kind, tokens and runs per seat, sends per line, receipts uncertain, rotations |
| Backups | `sqlite3 .backup` every 15 min to local storage, plus daily off-host to the company's backup target; config is in git |
| Upgrades | Kernel migrations are forward-only and run at start. T3 upgrades are gated by the contract suite (§7.9) |
| Runbooks | T3 down → admission blocks, sentinel alerts, nothing is lost. Gateway down → engine held, scripts keep running. Held queue → Needs-me. Stuck work → a recovery item. Lease stuck → reaper at TTL, or `t3dot lease release --force` with audit. Budget hold → override decision. Bad config → last-known-good plus notice. Credential expiring → re-pair C1 at day 25 |

---

## 14. Testing and verification

| Layer | What | How |
|---|---|---|
| Unit and property | State machines (§5), gates, coalescing, predicates, broker pipeline, budget windows | Fake clock, in-memory SQLite. Invariants I1–I16 as properties |
| Contract | The bridge against real T3 | Scratch T3 home with the `Replay (dev)` provider: launch, send, delivery, shell diffs, held queue, pending request, restart continuation, rotation |
| Shadow replay | Routing and gates against reality | Replay recorded ndjson streams and T3 run history; compare would-wake with actual runs (M1) |
| Chaos | Recovery | Kill T3 mid-run; inject a 529 storm; restart the kernel with live runs; race two lease acquires; corrupt one config unit |
| Security | I13 and posture | Plant secret-shaped strings in events; check packets and logs. Run the confined posture against a file-read probe |

---

## 15. Build plan

### 15.1 Milestones (the t3dot kernel)

| # | Milestone | Deliverables | Acceptance | Size |
|---|---|---|---|---|
| M0 | Skeleton | Store, config loader plus validator, CLI, revisions | The example and every adopter config validate; `config apply` and `rollback` work | S |
| M1 | Shadow | Ingress (file tail, HTTP), router, admission evaluating only, receipts, watcher (C2), would-wake log, daily shadow report | 7 days with ≥95% of real seat actions matched by a would-wake within 2 min, and no unknown event types for 3 days | M |
| M2 | Live dispatch, one seat | Bridge C1 plus profiles, dispatcher, confirm, company MCP (context, events_get, settle), nudge, failure kinds, engine health | 7 days live: dispatch→start p90 ≤2 min and max ≤10 min (one real desk measured p90 ≈12 min and max ≈3 h before this design); 0 lost wakes | M |
| M3 | Time and resources | Timers, expectations, leases with fencing, seat timers | No silent skips (every skip is a `timer.missed` event); heartbeat runs at 0 after 3 clean sentinel days | M |
| M4 | Broker | Grants, budgets, receipts, pause through the broker, the scripts' broker API | One send budget per line enforced across all senders; pause stops 100% of brokered writes | L |
| M5 | Governance and money | Decision types, surface adapters, standing rules, ledger, compute budgets, automatic rotation, work seats | Decisions pinned and superseded correctly; budget holds fire; rotation under 2 min of seat downtime; a project's work seat starts with the project and retires at close-out | M |
| M6 | Records and knowledge | Record adapter (outbox events, `record_query`), doctrine build | Kernel writes no business records; doctrine changes land at rotation | M |
| M7 | OS-user split | Kernel user, secret move, profile files ownership | File-read probe from a seat cannot read any broker secret | S–M |

### 15.2 Sequencing rules
- **Shadow before live** (M1 before M2) and one seat before many.
- **Delete what each milestone replaces only after it has run clean:** polling monitors after M2, timer heartbeats and watchdog runs after M3, prompt-enforced caps after M4.
- **Contract tests gate every T3 upgrade.**

### 15.3 What a bridge-mode org adopts

1. **The Bridge,** behind a seat-level `executor: native | t3` axis (or one per engine). A T3 runner implements the org's own runner interface: start or resume a conversation, steer, stop, and report usage and a typed outcome.
2. **Typed failure kinds and engine health,** as in §6.8.
3. **A ledger row per run,** never silently dropped.
4. **Gate receipts and the next-mover sweep** wherever its scheduler skips work.
5. **Resource leases with fencing** for shared resources such as a browser.
6. **Expectations,** replacing LLM oversight polling with deterministic checks and change-only wakes.

Lessons from designing a real bridge-mode adoption:
- **Per-run tool tokens.** A kernel that gives each run a fresh tool endpoint and token can't pass them through T3's static provider config. A per-seat MCP gateway works today: it identifies the calling thread (seat token plus `T3CODE_THREAD_ID` on Claude), resolves the conversation's single live run, and re-checks that run's lease on every call. Upstream patch #6 would make the thread identity tamper-proof.
- **System text.** T3 has no per-thread instructions yet, so the org's developer text goes in as the thread's first message, followed by deltas. A small static preamble in the profile says that this text takes precedence.
- **Restart continuation off.** Set `continueThreadsAfterServerUpdate: false` on the environment, so T3 never starts turns the org's kernel didn't claim.
- **Real clones for broker Git.** If the broker runs Git for agents, seats work in real clones, not T3 worktrees.
- **Cross-machine wakes.** To wake a thread on another T3 environment, a webhook scheduled task bound to that thread is the smallest way in: it can only enqueue a templated prompt into that one thread. Sign the body, and send only ids and counts, never agent-written prose.

---

## 16. Open questions

| # | Question | Proposal |
|---|---|---|
| Q1 | Ship the Bridge as its own MIT package that other agent kernels can depend on? | Yes |
| Q2 | SQLite for the kernel? | Yes; Postgres only if the kernel ever becomes multi-process |
| Q3 | Should the kernel own all time, with T3 schedules becoming kernel timers? | Yes; adopters move their schedules once, at a natural cut-over |
| Q4 | Which T3 upstream improvements to propose first? | #1 (failure and usage on thread reads), #2 (wait returns on pending requests), #6 (thread identity for company MCP servers). Ask the T3 maintainers before opening PRs, as their contribution policy requires |
| Q5 | A Telegram bot as the second channel? | Yes: plain, no AI, with decision buttons |
| Q6 | Reorganise an org's seats before adopting? | No. Shadow the current org first; changing seats later is a config change |

---

## 17. Changelog and backlog

**v2.2 (3 Nov 2026).** Work seats: a goal, project or job can have its own seat and thread, the way the Marketing OS gives every goal and project an owner thread, but rotated, and woken only when it matters.

| Change | Where |
|---|---|
| Work seats: seat templates with `per_work`, one instance per open goal, project or job, each with its own rotated thread; retired at close-out, started again on reopen | §1, §5.9, schema, validator |
| Resolver `work_seat`, which falls back to the item's owner seat | §6.2, schema |
| Built-in events `work.done` and `work.children_done` | CONFIG, validator |
| Invariant I17, and `seats.template_id` and `seats.work_id` | §2, §4 |

**v2.1 (2 Nov 2026).** Writing complete configurations for two real organisations against v2 showed what the format couldn't express. v2.1 adopted the additive items below. The schema stayed backward-compatible, and both configurations, plus `examples/minimal`, validate with 0 errors and 0 warnings.

| Change | Where |
|---|---|
| Predicate `negate` | schema, CONFIG |
| Route `to: {assist}` raises a Needs-me item without waking a seat | §6.2, validator |
| Route `delivery: passive`; `seat.wake.min_interval_s` | §6.2 |
| Seat `executor` per engine; `binding_model: per_seat \| per_conversation`; `profile` optional for retired seats | §7.4, schema |
| `environment:<id>` actors, so a machine can hold a line lease; lease `max_hold_s` and `release_by` | schema |
| Budget kinds `balance` and `gauge`; windows `minute` and `lifetime`; `scope.per` for per-subject cooldowns | schema |
| Grant `max_calls_total`, `args_allow`, `mode: read \| write` | schema; the Rule of Two check skips read-only grants |
| Source `map.each` (fan-out) and `map.hash` (personal data replaced by refs at ingress) | schema |
| Pause file `ops: writes \| all` and `expires_from_content` | schema |
| Timer `starts_at` / `ends_at`; built-in `seat.timer_due`, implicitly routed to the owning seat | schema, validator |
| `credentials.c1_access` (the validator rejects profiles above it); `credentials.webhook` | §7.1, validator |
| Sandbox `deny_write`, `allow_read`, `deny_env`; profile `model_options` | schema |
| `kernel.store` (free text for Postgres-backed kernels); monitor kind `record_query`; script status `retired` | schema |
| Surface adapter kind `approvals_api`, for an org's existing approvals system | schema, §12 |
| Uncertain sends resolved by message-id lookup; the kernel never passes `stop:true`; launch idle, then send | §6.4, §7.2, §7.4 |
| Rotation handles child threads | §7.6 |
| Threat row: project-tier settings loading | §11 |
| The coverage check counts timers and `owner_of`/resolver routes; built-in events may be redeclared for descriptions | validator |

**Backlog** (not adopted; decide during M1–M3):

| Item | Why it waits |
|---|---|
| Filter operators (`not`, `startsWith`, `present`) | Needs a small, well-defined matcher spec; until then use predicates |
| Calendar-driven timer payloads (for example a posting calendar) | Better solved by moving the calendar into config than by reading a runbook |
| Per-occurrence expectations ("each video cross-posted within 12 h") | Needs `for_each` semantics and state per occurrence |
| Profile fallback chains (model A, then model B) | Conflicts with engine-health holds; revisit only if holds hurt |
| Different native tool limits per thread kind in one seat instance | Needs upstream patch #5, or a second instance per seat |
| A database-row pause source for bridge-mode kernels | Bridge-mode kernels keep their own pause; only needed if one adopts kernel pauses |

---

## Appendix A. T3 Code facts this design relies on

Checked at upstream `main` `e6e2ab05cc` (1 Nov 2026). Paths are in [T3 Code](https://github.com/pingdotgg/t3code) (MIT, © T3 Tools, Inc.). Most of these are internal behaviour, not a stable API, so the contract suite (§7.9) re-checks them before every T3 upgrade.

| Fact | Where | Used in |
|---|---|---|
| External agents call T3 at `POST /mcp`, signed in with OAuth (PKCE; approved in a browser or with a pairing code). Sessions last 30 days, with no refresh token | `apps/server/src/mcp/McpHttpServer.ts`, `apps/server/src/auth/McpOAuth.ts`, `apps/server/src/auth/EnvironmentAuth.ts` (`MCP_CLIENT_SESSION_TTL`) | §7.1 (C1) |
| An MCP OAuth session is refused by every other endpoint ("MCP client sessions are only accepted by the MCP endpoint") | `apps/server/src/auth/EnvironmentAuth.ts` (`rejectMcpClientAudience`) | §7.1 (C2) |
| A long-lived bearer for the HTTP and WebSocket APIs is issued on the host with `t3 auth session issue` | `apps/server/src/cli/auth.ts` (`sessionIssueCommand`) | §7.1 (C2) |
| An OAuth client has no calling thread, so thread-scoped tools (`delegate_task`, `create_threads`, binding a schedule to "this thread") are refused | `apps/server/src/mcp/McpToolAccess.ts`, `apps/server/src/mcp/McpInvocationContext.ts` | §7.3 |
| `t3_thread_send` reports `delivery: started \| queued \| steered \| restarted`; a `clientRequestId` gives deterministic ids | `packages/contracts/src/orchestratorMcp.ts`, `apps/server/src/orchestration-v2/ThreadManagementService.ts`, `apps/server/src/mcp/OrchestratorMcpService.ts` | §6.4 |
| Queued runs can be **held** after a stop or a failure. A user send from web or mobile releases them, and so does a cleanly completed run (for agent and scheduled messages). MCP can't see the flag | `packages/contracts/src/orchestrationV2.ts` (`queueHeld`), `apps/server/src/orchestration-v2/Orchestrator.ts` (`releaseUnattendedHolds`) | §6.3 (G4), §7.5 |
| A usage limit holds queued runs, but a send to an idle thread starts anyway | `apps/server/src/orchestration-v2/Orchestrator.ts` (`usageLimitHoldsQueue`) | §6.3 (G3) |
| `t3_thread_wait` returns only when a run ends, after at most 60 minutes | `apps/server/src/mcp/OrchestratorMcpService.ts` (`MAX_WAIT_TIMEOUT_MS`) | §6.6 |
| The thread shell carries `lastErrorClass`, `usageLimitResetAt` and pending-request state; `GET /api/orchestration/shell` returns it | `packages/contracts/src/orchestrationV2.ts`, `packages/shared/src/orchestrationV2ThreadError.ts`, `packages/contracts/src/environmentHttp.ts` | §6.6, §6.8 |
| Per-turn token usage (`turnTokenUsage`) is stored but not returned by MCP thread reads | `packages/contracts/src/orchestrationV2.ts` | §7.7 |
| Provider instances take an `environment` (with secret references), a `homePath` and `launchArgs`; Claude honours `--append-system-prompt-file`, `--settings` and `--permission-mode` in them | `packages/contracts/src/providerInstance.ts`, `packages/contracts/src/settings.ts`, `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts` | §7.3 |
| Claude processes get `T3CODE_THREAD_ID` in their environment. Codex shells get it too (#28604), but Codex MCP calls see only the instance's environment | `apps/server/src/preview/PortScanner.ts` (`AGENT_THREAD_ENV`), `ClaudeAdapterV2.ts`, `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts` | §8.1 |
| An old Claude session can ask "compact before continuing?", which becomes a pending question unless the instance sets `idleCompaction: "off"` | `ClaudeAdapterV2.ts` (`resume_return`) | §7.3 |
| Runtime modes map to Claude permission modes and to Codex sandbox and approval policies. In `auto`, Codex's auto-reviewer can approve escalations | `ClaudeAdapterV2.ts`, `CodexAdapterV2.ts` | §11 |
| After a server restart, T3 continues interrupted runs itself (`continueThreadsAfterServerUpdate`, on by default) | `apps/server/src/orchestration-v2/RestartContinuation.ts`, `packages/contracts/src/settings.ts` | §6.9, §15.3 |
| Idle threads auto-settle after 3 days unless pinned | `packages/contracts/src/settings.ts` (`DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS`), `apps/server/src/orchestration-v2/ThreadSettlementService.ts` | §7.4 |
| Webhook scheduled tasks answer at `/api/hooks/<id>/<token>` on the local listener, without T3 Connect | `packages/contracts/src/environmentHttp.ts`, `apps/server/src/scheduledTasks/webhookRoute.ts` | §15.3 |
| Headless browser profiles persist under `<state>/server-browser/profiles`; an agent tab opened with no profile gets a throwaway context | `apps/server/src/preview/ServerBrowser.ts` | §9.3 |
