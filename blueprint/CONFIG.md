# t3dot configuration reference

A company's configuration is a directory of YAML files kept in git.
- **Loading:** the validator and the kernel read every `*.yaml` file under the directory, skipping names that start with `.` or `_`. Files are merged by top-level key; arrays from different files are concatenated.
- **Validation:** `blueprint/schema.json` checks the shape, and `tools/validate.mjs` checks cross-references and the safety rules listed at the end.

```
node tools/validate.mjs <config-dir>     # exit 1 on errors; warnings alone exit 0
```

- **Example:** `examples/minimal/company.yaml` is the smallest complete config.

## Conventions

| Thing | Format | Example |
|---|---|---|
| Ids | lowercase slug, ≤64 chars, may contain `.` `_` `-` | `chief`, `price.quote` |
| Event types | dotted lowercase | `wa.inbound`, `slot.due` |
| Integration ops | dotted lowercase; grant and budget patterns may use `*` | `wa.send`, `meta.ads.*` |
| Lease names | slug that may contain `:` | `browser:meta`, `line:main` |
| Actors | `seat:<id>`, `script:<id>`, or `environment:<id>` (a machine, e.g. the host that owns a phone line) | `script:autoreply` |
| Secrets | `secret:<name>`, resolved from the kernel's secret store. **Never put values in config** | `secret:t3/mcp` |
| Paths | absolute wherever security matters (profiles) | `/opt/t3dot/profiles/chief/settings.json` |
| `status` | `existing` (works today), `missing` (should exist and doesn't), `planned`, `retired` | |
| `replaces` | free text naming what today's system does instead, for migration tracking | `T3 schedule "daily post 15:55"` |
| `notes` | allowed on almost every object | |

## Modes

- **`company.mode: full`:** the t3dot kernel runs everything here.
- **`company.mode: bridge`:** the org keeps its own kernel and uses only the Bridge.
  - `company`, `profiles` and `seats` are live inputs to the Bridge (environments, provider instances, seat→thread bindings, `seats[].executor`).
  - The other sections are optional and *descriptive*. They show how the org's own kernel maps onto the neutral model, and they are validated the same way.

## Files and fields

### `company`
| Field | Meaning |
|---|---|
| `id`, `name`, `timezone`, `mode` | Identity. `timezone` is the default for timers and quiet hours |
| `brands[]` | `{id, name}`. Brand is a dimension on seats, events, budgets and the ledger |
| `environments[]` | One per T3 server: `{id, label, host, t3_url, t3_version, os_user, credentials:{mcp, session}, settings}`. `credentials.mcp` is C1 (MCP OAuth) and `credentials.session` is C2 (session bearer); see blueprint §7.1. `credentials.c1_access` records the level C1 was approved at, and profiles above it are rejected. `credentials.webhook` is the HMAC secret for an inbound webhook task. `settings` records T3 settings the bridge expects, such as `continueThreadsAfterServerUpdate` |
| `kernel` | `{listen, os_user, db_path, store, change_control: direct\|decided}`. `store` is free text for kernels not on SQLite (bridge mode) |
| `concurrency` | `{global, per_provider:{claudeAgent, codex}}`, enforced by gate G2 |
| `quiet_hours` | `{start, end, applies_to}` |
| `pause_files[]` | `{path, scope, ops, expires_from_content}`. The file's existence sets a pause for `global`, `brand:<id>`, `seat:<id>` or `integration:<id>`. `ops: writes` (default) stops admission and brokered writes; `ops: all` stops reads too. `expires_from_content` reads `resume_after=<ISO>` from the file |
| `presenter` | Default presenter seat |
| `floors[]` | Decision type ids only a human may decide. Each must set `floor: true` |
| `rotation_defaults` | `{max_items, max_age_days}` |
| `adapters[]` | Surface adapters: `{id, kind: console_cards\|approvals_api\|telegram\|t3_thread\|email, settings}` |
| `surfaces` | `{decisions: adapter, assist: adapter, alerts: [adapters]}` |
| `scripts[]` | Deterministic actors that call the broker API: `{id, description, path}` |

### `profiles[]`: T3 provider instances
| Field | Meaning |
|---|---|
| `id`, `kind` | `seat-<seat>` for a standing seat; `worker-*` for shared ephemeral threads |
| `driver` | `claudeAgent` or `codex` |
| `environment` | `company.environments[].id` |
| `posture` | `standard` or `confined` (blueprint §11) |
| `model`, `runtime_mode` | Defaults when launching seat threads. `runtime_mode` must be ≤ the kernel's C1 access level |
| `idle_compaction` | Claude only. Use `off` for seats so the resume dialog never blocks a wake |
| `home` | Shared provider home. Use the same value for every seat of a driver to keep native resume |
| `doctrine_file`, `settings_file`, `launch_args` | Absolute paths; files owned by the kernel user |
| `env[]` | `{name, secret}`, for example `T3DOT_SEAT_TOKEN` |
| `t3_tools` | `{allow[], deny[]}`: T3 MCP tools the posture permits inside the thread |
| `sandbox` | Confined posture: `{enabled, network: open\|proxy\|allowlist\|off, allowed_domains, proxy_port, deny_read, allow_read, allow_write, deny_write, deny_env, os_user}` |
| `model_options` | Provider model options, e.g. `{effort: high}` |

### `seats[]`
| Field | Meaning |
|---|---|
| `id`, `title`, `brands[]`, `reports_to` | Org chart; no cycles allowed |
| `class` | `reader` (may not hold outbound write grants), `actor`, `presenter` (curates decisions), `operator` (system work) |
| `profile` | `profiles[].id`. Optional when `status: retired` |
| `status` | `active`, `paused`, `retired`, `planned` |
| `executor` | Bridge mode only: `t3` or `native`, or per engine: `{claudeAgent: t3, codex: native}` |
| `binding_model` | `per_seat` (default; one long-lived rotated thread) or `per_conversation` (one T3 thread per goal, project or task; typical in bridge mode) |
| `per_work` | Makes this entry a work-seat template: `{kind: goal\|project\|job, owners, max_active, close_decision}`. The kernel creates one seat per open work item of that kind (blueprint §5.9). Instances report to the item's owner seat, so a template has `reports_to: null` and no `binding`. Budgets that name the template apply to each instance separately |
| `project` | `{project_id, path}`: the T3 project the seat thread runs in |
| `human_chat` | Whether humans message the seat thread directly. Those runs are observed |
| `capacity` | Max concurrent kernel-dispatched runs. Default 1 (one thread) |
| `wake` | `{coalesce_window_s, max_events, max_wakes_per_day, ttl_s, min_interval_s}` |
| `rotation` | Overrides `rotation_defaults` |
| `doctrine[]` | KB refs rendered into the profile's doctrine file |
| `budgets[]`, `predicates[]` | Seat-level gates (G5 and G6) |
| `binding` | Current thread at adoption time: `{thread_id, generation, items}` |
| `replaces[]` | Today's threads or roles this seat absorbs |

#### Work seats: a thread per project

A seat with `per_work` is a template. This one gives each project the chief owns its own seat and thread. The routes wake it when all of a project's children finish, or one is blocked or stuck, and pass each child's completion as context only:

```yaml
seats:
  - id: project-lead
    title: Project lead
    brands: [acme]
    reports_to: null          # each instance reports to its project's owner
    class: actor
    profile: seat-project
    status: active
    per_work: { kind: project, owners: [chief], max_active: 3, close_decision: project.close }
    rotation: { max_items: 6000 }

routes:
  - { id: child-done, on: { type: work.done }, to: { resolver: work_seat }, delivery: passive, settle: optional }
  - { id: children-done, on: { type: work.children_done }, to: { resolver: work_seat }, settle: required }
  - { id: child-stuck, on: { type: [work.blocked, work.stuck] }, to: { resolver: work_seat }, settle: required }
```

### `events[]`
| Field | Meaning |
|---|---|
| `type`, `description`, `priority`, `pii` | `pii`: `none`, `refs` (only pointers), or `contains` (payload holds personal data; trimmed at 30 days) |
| `brand` | A brand id, or `payload` / `any` / `source` |
| `sources[]` | Source ids that emit it |
| `payload` | `{field: type}`: small fields only. Content stays at the source |
| `routing` | `routed` (default; a route must exist) or `informational` (recorded for expectations and audit) |

These **built-in kernel events** may be routed without being declared:
- `run.started`, `run.completed`, `run.failed`, `run.waiting`, `run.silent`
- `seat.timer_due`: emitted by seat-owned timers and implicitly routed to the owning seat
- `thread.held`, `thread.oversize`
- `t3.down`, `t3.up`, `t3.credential_expiring`
- `engine.held`, `engine.down`, `engine.ok`
- `timer.missed`, `expectation.missed`
- `work.stuck`, `work.blocked`, `work.requested`
- `work.done` (a work item reached done) and `work.children_done` (every child of a work item is done or cancelled)
- `decision.decided`, `decision.expired`
- `budget.warn`, `budget.hold`
- `lease.expired`, `lease.denied`
- `seat.rotated`, `config.rejected`, `receipt.uncertain`

### `sources[]`
| Field | Meaning |
|---|---|
| `kind` | `http` (needs `auth.hmac_secret`), `file_tail` (needs `path`, `format`), `record_outbox`, `timer`, `monitor`, `t3_watch`, `mcp` |
| `map[]` | Turns lines or bodies into events: `{when:{field: value}, type, key, brand, subject:{name: "$.path"}, each, hash}`. **The first matching entry wins.** `key` is the idempotency key expression. `each: "$.items[*]"` emits one event per element. `hash: [paths]` replaces those payload fields with salted refs at ingress (PII) |
| `owner` | Who writes the source |

### `routes[]`
| Field | Meaning |
|---|---|
| `on` | `{type: one or a list, filter: {field: value}}` |
| `to` | Exactly one of `{seat}`, `{owner_of: <subject field>}`, `{resolver: brand_head\|job_seat\|presenter_of\|work_seat}`, `{assist: <assist decision type>}`. `assist` raises a Needs-me item and wakes no seat |
| `work` | `{attach: <subject field>}` or `{create:{kind, title}}` |
| `settle` | `required` (nudge twice, then block) or `optional` (completion counts as ack) |
| `delivery` | `queue` (default), `steer` (urgent stops only), or `passive` (attach as context to the seat's next wake; never wake on its own) |
| `priority`, `ttl_s`, `fanout` | — |
| `predicates[]`, `leases[]`, `budgets[]` | Extra gates for this route (G6, G7, G5) |

### `predicates[]`
`{id, kind, params, negate, description}`. `negate: true` inverts the result, e.g. "no `post.published` in the last 10 min".

| Kind | Params |
|---|---|
| `time_window` | `{tz?, allow: ["HH:MM-HH:MM"], days?: [0-6]}` |
| `quiet_hours` | `{invert?: bool}`: uses `company.quiet_hours` |
| `file_exists` / `file_fresh` | `{path, max_age_s?}` |
| `disk_free` | `{path, min_gib}` |
| `event_seen` | `{type, filter?, within_s}` |
| `lease_free` | `{name}` |
| `budget_left` | `{budget, min}` |
| `health_ok` | `{target}` |
| `record_query` | `{query, expect}`: a named query through the record adapter |
| `command` | `{argv: [...], timeout_s}`: runs as the kernel user, where exit 0 means true. The escape hatch |

### `leases[]`
`{name, description, ttl_s, renew_s, holders: [actor], preconditions: [predicate], protects: [op pattern], scope: machine|company, max_hold_s, release_by: ["HH:MM"]}`.
- Protected ops must present the current fencing token.
- A holder past `max_hold_s` or a `release_by` time is told to release, then expired.

### `budgets[]`
| Field | Meaning |
|---|---|
| `kind`, `unit` | `rate` (a count, e.g. `sends`), `money` (`inr`, `usd`), `compute` (`tokens`, `runs`), `balance` (a prepaid amount that refills only by event, e.g. DataForSEO credit), `gauge` (a configured level, not cumulative use, e.g. Meta's daily budget setting) |
| `window` | `run`, `minute`, `hour`, `day`, `utc_day`, `rolling_24h`, `week`, `month`, `lifetime` |
| `limit`, `warn_at` | Warn defaults to 0.8; hold at 1.0 |
| `scope` | One of `{seat}`, `{brand}`, `{line}` (a sender identity: phone line or mailbox), `{integration}`, `{company: true}`. Add `per: <subject field>` to split it per value; that is how per-lead or per-object cooldowns are written |
| `applies_to` | `{ops, routes, seats, actors}`: what spends from it |
| `on_hold` | `{notify: seat, override_decision: decision type}` |
| `unpriced` | Compute only: `count`, `ignore`, `hold` |

### `timers[]`
`{id, owner: system|seat:<id>, schedule: {cron | at | every_s}, tz, starts_at, ends_at, emits: {type, brand, payload}, catch_up: {mode: skip|once, window_s}, enabled, replaces}`.
- A timer only emits an event. Gates decide whether anyone wakes.
- Seats can also create their own timers at runtime with the `timer` tool.

### `expectations[]`
`{id, description, brand, window: {cron, tz}, deadline_s, must_see: {type, filter, count}, on_miss: {emit, route_to}}`. Each window opens on `cron`. If `count` matching events haven't arrived within `deadline_s`, `on_miss.emit` fires.

### `decisions[]`: decision types
| Field | Meaning |
|---|---|
| `kind` | `decide` (presenter-curated) or `assist` (Needs-me: logins, 2FA, held queues; goes straight to the surface) |
| `presenter` | Seat id or `none` |
| `deciders[]` | `{who: human \| seat:<id>, limits}`: delegated approvers are allowed unless `floor` |
| `pin` | Require a content hash; a changed subject supersedes the decision |
| `always_allow` | `{allowed, max_scope}`: whether "approve and always allow" may create a standing rule |
| `floor` | Only a human decides; never delegated; never standing |
| `expires_s`, `surface`, `payload` | — |

### `grants[]`
`{id, actor, ops: [pattern], constraints: {templates, audience, must_not_match, max_per_run, max_calls_total, args_allow, mode, budgets, predicates, cooldown_s, expires_at, requires_decision, lease}}`.
- `mode: read` restricts a wildcard to read ops, so a read-only wildcard can't grant writes by accident.
- `args_allow` lists allowed argument values per parameter. These are the initial revision. In the kernel, later changes go through a `grant_change` decision.

### `integrations[]`
`{id, kind, credentials: [secret], ops: [{name, mode: read|write, outbound, idempotent, protected_by}]}`.
- `outbound: true` marks ops that message people outside the company.
- Browser-driven effects are modelled as an intent op (e.g. `post.intent`) protected by the browser lease (blueprint §9.3).

### `monitors[]`
`{id, kind: sentinel|stuck_sweep|expectations|held_queue_scan|rotation_check|lease_reaper|budget_rollup|credential_expiry|record_query|command, every_s, params, emits}`.

**Implicit routes:**
- `decision.decided` and `decision.expired` go back to the requesting seat.
- `seat.timer_due` goes to the timer's owner.
- Don't add routes for these unless you want an extra recipient.

## What the validator enforces beyond the schema

| Rule | Why |
|---|---|
| Every reference resolves: seats, profiles, environments, brands, predicates, leases, budgets, decision types, adapters, scripts, sources, event types | No dangling config |
| No reporting cycles | Authority must terminate |
| `company.floors` entries exist and set `floor: true`. Floor decisions have only human deciders and no standing rules | Floors can't be delegated |
| A `reader` seat may not hold a grant on an `outbound` write op, unless the grant sets `mode: read` | Rule of Two (blueprint §9.7) |
| A `per_work` template has `reports_to: null` and no `binding`; its `owners` and `close_decision` resolve | Instances get their owner and thread at runtime |
| A route to `work_seat` with no `per_work` template is a warning | Its events would always go to the owner seat |
| A profile's `runtime_mode` may not exceed its environment's `credentials.c1_access` | The kernel can't drive threads above its own C1 ceiling |
| `to: {assist}` names a decision type of kind `assist` | Needs-me items have their own lane |
| Op patterns in grants, budgets and leases match at least one declared op (warning) | Catch typos that would silently grant nothing |
| Ops are unique across integrations; `protected_by` names a lease | One enforcement point per op |
| Full mode warns on: routed events with no route; timer events with no route or expectation; active seats that no route, timer, `owner_of`/resolver route or human chat can reach; a missing `kernel` block | Coverage |
| Seat profiles on Claude without `idle_compaction: off` (warning) | Unattended wakes would stall on the resume dialog |
