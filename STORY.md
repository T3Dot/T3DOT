# The story behind T3DOT

*Sunil Dhaker · November 2026*

## Always-on agent teams

At Fretron, I've been building an internal tool, the Agentic Marketing OS. It's an always-on system: a small team of AI agents that works toward goals people set, every day, without waiting to be asked.
- **The team:** a chief of staff coordinates, while a strategist, a writer, a website agent and a revenue agent do the work.
- **The work:** they research, draft, open pull requests and hand tasks to each other.

It's autonomous, but not unsupervised:
- **People keep the important calls.** They set the goals and decide anything about money, contracts, messages to customers and strategy.
- **The agents bring a person two kinds of things:** decisions they've already researched, with options and a recommendation, and small unblockers only a person can do, like a login or a phone code.
- **The rest of the time,** they get on with the work.

Outside Fretron, I run the same kind of always-on setup for BuildRun and for a personal side project. Their agents live directly in T3 Code threads, held together by scripts, schedules and prompts.

## The hard part is the harness

Getting agents to do useful work was the easy part. Keeping a team of them running, day after day, was not.

Every run goes through a harness: the code that starts an agent, gives it the right context and tools, keeps its session alive, steers it, stops it, and recovers when something breaks. The Marketing OS had Claude Code and Codex behind one adapter interface, and the two don't share a lifecycle:

- Claude Code resumes a session from a file on disk. Codex resumes a thread inside its app server.
- Each takes a new message mid-turn differently, and the harness has to know whether the message joined the running turn or started a new one.
- Stopping cleanly means letting tool calls that are already running finish first.
- A session that can't be resumed has to be handed off to a fresh one without losing its place.
- Rate limits arrive as free text, so the harness reads prose to decide between "retry in a minute" and "wait until 3 pm".
- Then there are accounts: several subscriptions pooled together, and work moved to another account when one runs out.

Each of these has edge cases, and the edge cases interact. None of it is what the system is for.

## T3 Code had already solved it

All this time, I'd been using T3 Code for my own coding, and the BuildRun and side-project agents ran on it. Over the last six months I've watched it grow into something remarkably solid. At some point I realised it had already solved nearly everything I was rebuilding for the Marketing OS, and solved it better:

- one orchestration layer over Claude Code, Codex, Cursor, OpenCode and more;
- several accounts per provider, with a thread able to move between compatible accounts;
- handoffs that carry a conversation across providers, restarts and forks;
- usage limits tracked down to the window that ran out, with a way to resume when it resets;
- runs that pick up again after a server restart;
- a checkpoint at the end of every turn, and a queue for each thread;
- apps for the web, desktop and phone, so I can look in on any agent from anywhere.

Everything I had built into the Marketing OS's harness, T3 Code had, plus the parts I hadn't got to yet.

That changed the question. If T3 Code is the engine, which part is actually mine? Not the runner, but the company around it:
- who's on the team;
- what wakes whom;
- what each agent may do on its own;
- what needs a person;
- what it all costs.

Across these setups, I had already seen what getting that layer wrong looks like:
- **Polling that found nothing.** At Fretron, one agent checked on the others every 30 minutes. On the T3 Code setups, a heartbeat woke the lead agent every 15 minutes. Most of those runs said some version of "nothing has changed".
- **Coordination that cost more than the work.** In a two-day sample of the Marketing OS's model spend, most of it went on coordination: agents waking each other to talk about the work instead of doing it.
- **Wakes that went missing.** The webhook that woke the lead agent on the T3 Code setups died quietly. Messages then waited for the next heartbeat, sometimes for hours.
- **Threads that grew until they broke.** A lead agent's thread got so long that it failed, and its replacement was heading the same way.
- **Rules that lived only in prompts.** Send caps were waived under pressure, and some scripts never checked the stop file.

## Then I found Paperclip

When I went looking for anyone else building that layer, I found Paperclip. Reading its README was strange: an org chart, goals, budgets, approvals, agents that wake up and get to work. It had the same shape as the Marketing OS, arrived at separately. I'd started before I knew it existed.

The coincidence was useful. When two systems built apart end up looking alike, you can see which parts are essential. So I studied Paperclip closely, side by side with the Marketing OS, and carried a few of its ideas over:

- **A next mover for everything.** Paperclip's rule is never to leave work where nobody is responsible for the next move.
  - In T3DOT, every open item names what moves it next: a run, a timer, a person or a decision.
  - A sweep flags anything without one. One project in the Marketing OS once sat in a queue for more than a day before anyone noticed.
- **A receipt for every wake that didn't happen,** saying which check stopped it.
- **Typed failures.** "Quota used up until 3 pm" is not a passing rate limit, so wait it out instead of burning retries.
- **A ledger that fails closed,** so spending stops at a limit instead of being discovered later.
- **"Approve and always allow":** one decision that becomes a bounded rule you can revoke.

Some ideas I left out on purpose:
- **Self-assigned work.** In Paperclip, agents check out their own issues. In T3DOT, a configured route decides who works on what.
- **Direct wakes.** In Paperclip, comments, assignments and status changes can wake an agent directly. In T3DOT, every wake passes the same gates.
- **An alert feed.** People get decisions, not a stream of alerts.

## So I decided to build it

T3DOT is a small company layer that runs beside T3 Code. T3 Code runs the agents. For each one, T3DOT:
- decides when it should act and checks that it's allowed to;
- sends the wake into its thread;
- watches the run and makes sure it ends with a declared outcome.

It also holds the budgets, the leases on shared things like a logged-in browser, and the decisions people make, each pinned to exactly what was approved.

It has two modes, one for each kind of setup I run:
- **Full mode** is the control plane for agents that already live in T3 Code threads, like the ones I run for BuildRun and my side project.
- **Bridge mode** is for a team with its own agent kernel, like the Marketing OS at Fretron. The team keeps its kernel and uses T3DOT's bridge to run its agents on T3 Code.

It talks to T3 Code through its MCP and HTTP interfaces; there's no fork. It doesn't contain any of the Marketing OS's code; it carries what building and running these systems taught me. The [glossary](blueprint/GLOSSARY.md) maps T3DOT's terms to the ones in the Marketing OS and in Paperclip.

## The name

T3, because T3 Code is the backbone. DOT, because the .bot domain I wanted was already taken.

---

T3DOT is a proposal for now: a design, a configuration schema and a validator. If you run agents all day and any of this sounds familiar, I'd like to hear how you handle it. [Open an issue](https://github.com/T3Dot/T3Dot/issues).

*T3DOT is an independent project, not affiliated with T3 Tools, Inc. See [NOTICE.md](NOTICE.md).*
