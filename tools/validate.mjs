#!/usr/bin/env node
// Validates a t3dot company config directory: JSON Schema (blueprint/schema.json) plus cross-references.
// Usage: node tools/validate.mjs <config-dir>   (or: npm run validate -- <config-dir>)
// Exit code 1 on errors; warnings alone exit 0.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import AjvModule from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(resolve(here, "../blueprint/schema.json"), "utf8"));

const Ajv = AjvModule.default ?? AjvModule;

// Event types the kernel itself emits; routes and expectations may use them without declaring them.
const BUILTIN_EVENTS = new Set([
  "run.started", "run.completed", "run.failed", "run.waiting", "run.silent",
  "thread.held", "thread.oversize", "t3.down", "t3.up", "t3.credential_expiring",
  "engine.held", "engine.down", "engine.ok", "timer.missed", "expectation.missed",
  "work.stuck", "work.blocked", "work.requested", "work.done", "work.children_done", "decision.decided", "decision.expired",
  "budget.warn", "budget.hold", "lease.expired", "lease.denied", "seat.rotated",
  "config.rejected", "receipt.uncertain", "seat.timer_due",
]);

const dir = resolve(process.argv[2] ?? ".");
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function yamlFiles(d) {
  const out = [];
  for (const name of readdirSync(d).sort()) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const p = join(d, name);
    if (statSync(p).isDirectory()) out.push(...yamlFiles(p));
    else if (/\.ya?ml$/.test(name)) out.push(p);
  }
  return out;
}

const bundle = {};
for (const file of yamlFiles(dir)) {
  let doc;
  try {
    doc = YAML.parse(readFileSync(file, "utf8"));
  } catch (e) {
    err(`${relative(dir, file)}: YAML parse error: ${e.message}`);
    continue;
  }
  for (const [key, value] of Object.entries(doc ?? {})) {
    if (!(key in bundle)) bundle[key] = value;
    else if (Array.isArray(bundle[key]) && Array.isArray(value)) bundle[key].push(...value);
    else err(`${relative(dir, file)}: top-level key "${key}" appears in more than one file`);
  }
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);
if (!validateSchema(bundle)) {
  for (const e of validateSchema.errors) {
    err(`schema ${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
  }
}

const B = bundle;
const list = (k) => (Array.isArray(B[k]) ? B[k] : []);
const company = B.company ?? {};
const full = company.mode === "full";

function indexBy(arr, key, label) {
  const m = new Map();
  for (const x of arr) {
    const k = x?.[key];
    if (k === undefined) continue;
    if (m.has(k)) err(`${label}: duplicate ${key} "${k}"`);
    m.set(k, x);
  }
  return m;
}
const brands = indexBy(company.brands ?? [], "id", "company.brands");
const envs = indexBy(company.environments ?? [], "id", "company.environments");
const adapters = indexBy(company.adapters ?? [], "id", "company.adapters");
const scripts = indexBy(company.scripts ?? [], "id", "company.scripts");
const profiles = indexBy(list("profiles"), "id", "profiles");
const seats = indexBy(list("seats"), "id", "seats");
const events = indexBy(list("events"), "type", "events");
const sources = indexBy(list("sources"), "id", "sources");
const routes = indexBy(list("routes"), "id", "routes");
const predicates = indexBy(list("predicates"), "id", "predicates");
const leases = indexBy(list("leases"), "name", "leases");
const budgets = indexBy(list("budgets"), "id", "budgets");
indexBy(list("timers"), "id", "timers");
indexBy(list("expectations"), "id", "expectations");
const decisions = indexBy(list("decisions"), "id", "decisions");
indexBy(list("grants").filter((g) => g.id), "id", "grants");
const integrations = indexBy(list("integrations"), "id", "integrations");
indexBy(list("monitors"), "id", "monitors");

const ops = new Map();
for (const integ of list("integrations")) {
  for (const op of integ.ops ?? []) {
    if (ops.has(op.name)) err(`integrations: op "${op.name}" defined twice`);
    ops.set(op.name, { ...op, integration: integ.id });
    if (op.protected_by && !leases.has(op.protected_by)) err(`integrations.${integ.id}: op ${op.name} protected_by unknown lease "${op.protected_by}"`);
  }
}
const globRe = (p) => new RegExp(`^${p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
const opsMatching = (pattern) => [...ops.keys()].filter((name) => globRe(pattern).test(name));

const knownEvent = (t) => events.has(t) || BUILTIN_EVENTS.has(t);
const need = (cond, msg) => { if (!cond) err(msg); };
const needSeat = (id, where) => need(seats.has(id), `${where}: unknown seat "${id}"`);
const needBrand = (id, where) => need(brands.has(id), `${where}: unknown brand "${id}"`);
const needPred = (id, where) => need(predicates.has(id), `${where}: unknown predicate "${id}"`);
const needBudget = (id, where) => need(budgets.has(id), `${where}: unknown budget "${id}"`);
const needLease = (id, where) => need(leases.has(id), `${where}: unknown lease "${id}"`);
const needDecision = (id, where) => need(decisions.has(id), `${where}: unknown decision type "${id}"`);
const needEvent = (t, where) => need(knownEvent(t), `${where}: unknown event type "${t}"`);
function needActor(ref, where) {
  const [kind, id] = ref.split(":");
  if (kind === "seat") needSeat(id, where);
  else if (kind === "environment") need(envs.has(id), `${where}: unknown environment "${id}"`);
  else if (kind === "script" && scripts.size > 0) need(scripts.has(id), `${where}: unknown script "${id}"`);
  else if (kind === "script") warn(`${where}: script "${id}" used but company.scripts is empty`);
}
function needScope(scope, where) {
  const [kind, id] = scope.split(":");
  if (kind === "brand") needBrand(id, where);
  if (kind === "seat") needSeat(id, where);
  if (kind === "integration") need(integrations.has(id), `${where}: unknown integration "${id}"`);
}

// company
for (const env of company.environments ?? []) if (!env.credentials) warn(`company.environments.${env.id}: no credentials refs`);
if (company.presenter) needSeat(company.presenter, "company.presenter");
for (const pf of company.pause_files ?? []) needScope(pf.scope, `company.pause_files ${pf.path}`);
for (const [k, v] of Object.entries(company.surfaces ?? {})) {
  for (const id of Array.isArray(v) ? v : [v]) need(adapters.has(id), `company.surfaces.${k}: unknown adapter "${id}"`);
}
for (const f of company.floors ?? []) {
  needDecision(f, "company.floors");
  if (decisions.has(f) && decisions.get(f).floor !== true) err(`company.floors: decision "${f}" must set floor: true`);
}

// profiles
const MODE_RANK = { "approval-required": 0, "auto-accept-edits": 1, auto: 2, "full-access": 3 };
for (const p of list("profiles")) {
  need(envs.has(p.environment), `profiles.${p.id}: unknown environment "${p.environment}"`);
  const c1 = envs.get(p.environment)?.credentials?.c1_access;
  if (c1 && MODE_RANK[p.runtime_mode] > MODE_RANK[c1]) err(`profiles.${p.id}: runtime_mode ${p.runtime_mode} exceeds the environment's C1 access ${c1} (blueprint §7.1)`);
  if (p.posture === "confined" && p.sandbox && (!p.sandbox.deny_read?.length || (p.sandbox.network === "proxy" && !p.sandbox.proxy_port))) warn(`profiles.${p.id}: confined sandbox should set deny_read and, for network: proxy, proxy_port`);
  if (p.driver === "codex" && p.idle_compaction && p.idle_compaction !== "default") warn(`profiles.${p.id}: idle_compaction only applies to Claude`);
  if (p.driver === "claudeAgent" && (p.kind ?? "seat") === "seat" && p.idle_compaction !== "off") warn(`profiles.${p.id}: seat profiles should set idle_compaction: off (blueprint §7.3)`);
  if (p.posture === "confined" && !p.sandbox) warn(`profiles.${p.id}: confined posture without a sandbox block`);
}

// seats
for (const s of list("seats")) {
  for (const b of s.brands ?? []) needBrand(b, `seats.${s.id}.brands`);
  if (s.profile !== undefined) need(profiles.has(s.profile), `seats.${s.id}: unknown profile "${s.profile}"`);
  const executors = typeof s.executor === "object" ? Object.values(s.executor ?? {}) : [s.executor];
  if (!full && executors.includes("t3") && profiles.has(s.profile) && !envs.get(profiles.get(s.profile).environment)?.credentials) warn(`seats.${s.id}: executor t3 but its environment has no credentials`);
  if (s.reports_to) needSeat(s.reports_to, `seats.${s.id}.reports_to`);
  for (const id of s.budgets ?? []) needBudget(id, `seats.${s.id}.budgets`);
  for (const id of s.predicates ?? []) needPred(id, `seats.${s.id}.predicates`);
  if (s.executor && full) warn(`seats.${s.id}: executor is only meaningful in bridge mode`);
  if (s.per_work) {
    for (const o of s.per_work.owners ?? []) needSeat(o, `seats.${s.id}.per_work.owners`);
    if (s.per_work.close_decision) needDecision(s.per_work.close_decision, `seats.${s.id}.per_work.close_decision`);
    if (s.reports_to) err(`seats.${s.id}: a work-seat template has reports_to: null; each instance reports to its work item's owner`);
    if (s.binding) err(`seats.${s.id}: a work-seat template has no binding; instances bind at runtime`);
  }
}
for (const s of list("seats")) {
  const seen = new Set([s.id]);
  let cur = s.reports_to;
  while (cur && seats.has(cur)) {
    if (seen.has(cur)) { err(`seats: reporting cycle through "${s.id}"`); break; }
    seen.add(cur);
    cur = seats.get(cur).reports_to;
  }
}

// events and sources
for (const e of list("events")) {
  for (const id of e.sources ?? []) need(sources.has(id), `events.${e.type}: unknown source "${id}"`);
  if (e.brand && !["payload", "any", "source"].includes(e.brand)) needBrand(e.brand, `events.${e.type}.brand`);
}
for (const src of list("sources")) {
  for (const m of src.map ?? []) needEvent(m.type, `sources.${src.id}.map`);
  if (src.kind === "http" && !src.auth?.hmac_secret) warn(`sources.${src.id}: http source without hmac_secret`);
  if (src.kind === "file_tail" && !src.path) err(`sources.${src.id}: file_tail needs path`);
}

// routes
const routedEvents = new Set();
for (const r of list("routes")) {
  const types = Array.isArray(r.on?.type) ? r.on.type : [r.on?.type];
  for (const t of types) { needEvent(t, `routes.${r.id}.on`); routedEvents.add(t); }
  if (r.to?.assist) {
    needDecision(r.to.assist, `routes.${r.id}.to`);
    if (decisions.get(r.to.assist) && decisions.get(r.to.assist).kind !== "assist") err(`routes.${r.id}.to.assist: decision type "${r.to.assist}" is not kind assist`);
  }
  if (r.to?.seat) {
    needSeat(r.to.seat, `routes.${r.id}.to`);
    const st = seats.get(r.to.seat)?.status;
    if (st === "retired") warn(`routes.${r.id}: targets retired seat "${r.to.seat}"`);
  }
  for (const id of r.predicates ?? []) needPred(id, `routes.${r.id}.predicates`);
  for (const id of r.leases ?? []) needLease(id, `routes.${r.id}.leases`);
  for (const id of r.budgets ?? []) needBudget(id, `routes.${r.id}.budgets`);
}

if (list("routes").some((r) => r.to?.resolver === "work_seat") && !list("seats").some((s) => s.per_work)) {
  warn("routes: work_seat is used but no seat has per_work, so those events always go to the owner seat");
}

// predicates, leases, budgets
for (const l of list("leases")) {
  for (const h of l.holders ?? []) needActor(h, `leases.${l.name}.holders`);
  for (const id of l.preconditions ?? []) needPred(id, `leases.${l.name}.preconditions`);
  for (const p of l.protects ?? []) if (ops.size && opsMatching(p).length === 0) warn(`leases.${l.name}: protects "${p}" matches no integration op`);
}
for (const b of list("budgets")) {
  if (b.scope?.seat) needSeat(b.scope.seat, `budgets.${b.id}.scope`);
  if (b.scope?.brand) needBrand(b.scope.brand, `budgets.${b.id}.scope`);
  if (b.scope?.integration) need(integrations.has(b.scope.integration), `budgets.${b.id}.scope: unknown integration "${b.scope.integration}"`);
  for (const id of b.applies_to?.routes ?? []) need(routes.has(id), `budgets.${b.id}.applies_to: unknown route "${id}"`);
  for (const id of b.applies_to?.seats ?? []) needSeat(id, `budgets.${b.id}.applies_to`);
  for (const a of b.applies_to?.actors ?? []) needActor(a, `budgets.${b.id}.applies_to`);
  for (const p of b.applies_to?.ops ?? []) if (ops.size && opsMatching(p).length === 0) warn(`budgets.${b.id}: op pattern "${p}" matches no integration op`);
  if (b.on_hold?.notify) needSeat(b.on_hold.notify, `budgets.${b.id}.on_hold.notify`);
  if (b.on_hold?.override_decision) needDecision(b.on_hold.override_decision, `budgets.${b.id}.on_hold`);
}

// timers, expectations, monitors
const timerEvents = new Set();
for (const t of list("timers")) {
  needEvent(t.emits?.type, `timers.${t.id}.emits`);
  timerEvents.add(t.emits?.type);
  if (t.emits?.brand) needBrand(t.emits.brand, `timers.${t.id}.emits`);
  if (t.owner?.startsWith("seat:")) needSeat(t.owner.slice(5), `timers.${t.id}.owner`);
}
for (const x of list("expectations")) {
  needEvent(x.must_see?.type, `expectations.${x.id}.must_see`);
  needEvent(x.on_miss?.emit, `expectations.${x.id}.on_miss`);
  if (x.on_miss?.route_to) needSeat(x.on_miss.route_to, `expectations.${x.id}.on_miss`);
  if (x.brand) needBrand(x.brand, `expectations.${x.id}`);
}
for (const m of list("monitors")) for (const t of m.emits ?? []) if (!knownEvent(t)) warn(`monitors.${m.id}: emits undeclared event "${t}"`);

// decisions
for (const d of list("decisions")) {
  if (d.presenter && d.presenter !== "none") needSeat(d.presenter, `decisions.${d.id}.presenter`);
  for (const who of d.deciders ?? []) if (who.who.startsWith("seat:")) needSeat(who.who.slice(5), `decisions.${d.id}.deciders`);
  if (d.surface) need(adapters.has(d.surface), `decisions.${d.id}: unknown surface "${d.surface}"`);
  if (d.floor) {
    if ((d.deciders ?? []).some((x) => x.who !== "human")) err(`decisions.${d.id}: floor decisions may only have human deciders`);
    if (d.always_allow?.allowed) err(`decisions.${d.id}: floor decisions cannot allow standing rules`);
  }
}

// grants
for (const g of list("grants")) {
  const where = `grants.${g.id ?? g.actor}`;
  needActor(g.actor, where);
  const c = g.constraints ?? {};
  for (const id of c.budgets ?? []) needBudget(id, where);
  for (const id of c.predicates ?? []) needPred(id, where);
  if (c.lease) needLease(c.lease, where);
  if (c.requires_decision) needDecision(c.requires_decision, where);
  for (const p of g.ops ?? []) {
    const matched = opsMatching(p);
    if (ops.size && matched.length === 0) warn(`${where}: op pattern "${p}" matches no integration op`);
    const seat = g.actor.startsWith("seat:") ? seats.get(g.actor.slice(5)) : undefined;
    if (seat?.class === "reader" && c.mode !== "read") {
      for (const name of matched) if (ops.get(name)?.outbound && ops.get(name)?.mode === "write") err(`${where}: reader seat "${seat.id}" holds outbound write op "${name}" (Rule of Two)`);
    }
  }
}

// coverage (full mode only)
if (full) {
  for (const e of list("events")) {
    if ((e.routing ?? "routed") === "routed" && !routedEvents.has(e.type)) warn(`events.${e.type}: no route (mark routing: informational if intended)`);
  }
  for (const t of timerEvents) if (t && !routedEvents.has(t) && !list("expectations").some((x) => x.must_see?.type === t)) warn(`timer event "${t}" has no route and no expectation`);
  const targeted = new Set(list("routes").map((r) => r.to?.seat).filter(Boolean));
  for (const t of list("timers")) if (t.owner?.startsWith("seat:")) targeted.add(t.owner.slice(5));
  const ownerRoutes = list("routes").some((r) => r.to?.owner_of || r.to?.resolver);
  for (const s of list("seats")) {
    if (s.status !== "active" || targeted.has(s.id) || s.human_chat) continue;
    if (ownerRoutes) continue; // owner_of / resolver routes can reach any work owner
    warn(`seats.${s.id}: active seat that no route targets and humans can't chat with`);
  }
  if (!company.kernel) warn("company.kernel: missing (listen, os_user, db_path)");
}

const counts = ["profiles", "seats", "events", "sources", "routes", "predicates", "leases", "budgets", "timers", "expectations", "decisions", "grants", "integrations", "monitors"]
  .map((k) => `${k} ${list(k).length}`)
  .join(" · ");
console.log(`t3dot config: ${dir}`);
console.log(`company ${company.id ?? "?"} (mode ${company.mode ?? "?"}) · ${counts}`);
for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
