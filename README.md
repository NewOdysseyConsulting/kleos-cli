# kleos

[Kleos](https://getkleos.ai) from the terminal. Kleos plans, writes and checks a small business's marketing: social
posts, blog articles, newsletters, and a weekly read on whether AI assistants name the business. This CLI talks to the
[Kleos public API](https://getkleos.ai/agents) with your workspace's API key, so you (or a script, a cron job, a CI
step) can list your businesses, ask for drafts, see what's waiting for review, approve posts, record what went live,
and read results and AI visibility without opening the app.

Nothing here publishes on its own. Asking for a draft queues a draft that waits for review; `approve` and `record` are
explicit commands you run; after an approval the business's own Autopilot settings decide whether Kleos schedules it,
exactly as in the app. The same rules, plan limits and credits apply as when you click in Kleos.

## Install

Node 20 or newer.

```sh
npm i -g kleos
kleos --help
```

Or without installing: `npx kleos businesses`.

## Sign in

Create an API key in Kleos under **Settings → API** (https://app.getkleos.ai/settings/api; admins and owners, on the
Growth and Pro plans). A **read** key can read; a **write** key can also ask for drafts, approve posts and record what
went live.

```sh
kleos login                # asks for the key, hidden as you type
kleos login --key kleos_…  # or pass it
kleos logout               # removes it from this computer
```

The key is checked with one read of your businesses and kept in your user config folder, readable only by you:
`~/Library/Application Support/kleos/config.json` on macOS, `~/.config/kleos/config.json` on Linux (or under
`$XDG_CONFIG_HOME`), `%APPDATA%\kleos\config.json` on Windows. It is never written to the current directory.

For CI and scripts, set `KLEOS_API_KEY` instead; it wins over the saved key. `KLEOS_CONFIG_DIR` moves the config
folder.

## Commands

Every command takes `--json` for machine-readable output (one JSON document on stdout; errors come back as JSON too,
with the API's own `type`, `code`, `message` and `request_id`). Exit code 0 on success, 1 on any error.

Where a command is about one business, `--business` (`-b`) takes the business's id or its exact name (or website).
With one business in the workspace you can leave it out.

### `kleos businesses`

The businesses in the workspace, with their ids and Autopilot settings.

```sh
kleos businesses
kleos businesses --json | jq '.data[].name'
```

### `kleos posts list`

Posts, newest first. Filters: `--business`, `--status` (for example `pending_approval`, `approved`, `scheduled`,
`published`), `--channel` (for example `linkedin`, `x`), `--limit` (1 to 100), `--all` for every page.

```sh
kleos posts list -b "Fold Studio" --status scheduled
kleos posts list --channel linkedin --all --json
```

### `kleos posts get <id>`

One post in full: status, channel, planned time, hook, body, call to action and hashtags.

### `kleos posts draft`

Ask Kleos to write a post. It goes through Kleos's writer and checks, then waits for review like any other draft.
Uses one post from the plan's allowance.

```sh
kleos posts draft -b "Fold Studio" --topic "why we invoice the day we finish"
kleos posts draft -b "Fold Studio" --topic "late invoices" --at "2026-11-20 09:30"   # when it's due; default tomorrow
kleos posts draft -b "Fold Studio" --slot <calendar slot id>                          # draft a planned slot instead
kleos posts draft -b "Fold Studio" --topic "late invoices" --wait                     # wait (up to 180 s) and print it
```

### `kleos posts approve <id>`

Approve a post waiting for review, with the same checks as the app: a post the checks flagged can't be approved until
it's fixed. If the business has auto-publish on, Kleos schedules it on the connected channel and the command says so;
otherwise it stays approved for someone to publish from Kleos.

```sh
kleos posts approve 3f2a… --comment "Good to go"
```

### `kleos posts record <id> <url>`

Tell Kleos a post went out through another tool, with its live https address (as **Record as published** does in the
app). Approved, scheduled or failed posts only. `kleos posts publish-record` is the same command.

```sh
kleos posts record 3f2a… https://www.linkedin.com/posts/…
```

### `kleos articles list`, `kleos articles get <id>`, `kleos articles record <id> <url>`

Articles, newest first (`--business`, `--status`, `--limit`, `--all`); one article with its text as Markdown; and
recording an approved article as live on your site.

```sh
kleos articles list -b "Fold Studio" --status approved
kleos articles get 9c1d… --json | jq -r .body_md > article.md
kleos articles record 9c1d… https://foldstudio.com/blog/get-paid-on-time
```

### `kleos review`

What's waiting for review across posts, articles and newsletters, soonest first, and whether each is ready to approve,
needs a fix, or has changes requested. `--business` narrows it to one business.

```sh
kleos review
kleos review -b "Fold Studio" --json | jq '.counts'
```

### `kleos results`

What a business's content did: sessions, key events, leads, deals and revenue traced to Kleos content, first touch and
latest touch side by side, by campaign, theme and piece. `--days` from 7 to 365 (default 90). Attributed, not proven
causal.

```sh
kleos results -b "Fold Studio" --days 30
```

### `kleos visibility`

Whether AI assistants (ChatGPT, Google AI Mode, Perplexity and the others on the plan) name, recommend and cite the
business when asked its buyers' questions. Shows the latest finished run's summary and the recent runs; `--results`
lists every question and assistant; `--run <id>` picks a run.

```sh
kleos visibility -b "Fold Studio"
kleos visibility -b "Fold Studio" --results --json
```

Kleos runs a check every week. Starting one from the CLI isn't in the public API yet; start one from
**Results → AI visibility** in Kleos.

### `kleos usage`

What the workspace has used this billing period against its plan.

### `kleos api <method> <path>`

Any endpoint in the API, with the saved key, for the ones without a command of their own (campaigns, growth
suggestions, webhooks, knowledge sources, automations, newsletters). Always prints JSON. `--data` takes a JSON body;
`--query key=value` adds query parameters. The full list: https://app.getkleos.ai/v1/openapi.json.

```sh
kleos api GET /v1/webhooks
kleos api GET /v1/recommendations --query status=proposed
kleos api POST /v1/webhooks --data '{"url":"https://example.com/kleos","events":["post.published"]}'
```

## JSON output

```sh
kleos --json review
```

```json
{
  "counts": { "waiting": 2, "ready": 1, "needs_attention": 1 },
  "items": [
    { "id": "…", "kind": "post", "business": "Fold Studio", "business_id": "…", "title": "Three invoices, one afternoon", "channel": "linkedin", "planned_for": "2026-11-12T09:00:00.000Z", "state": "ready", "status": "pending_approval" }
  ]
}
```

List commands return the API's own objects under `data`; single-object commands return the object itself. An error:

```json
{ "error": { "type": "conflict_error", "code": "needs_fix", "message": "This post can't be approved while it needs a fix.", "request_id": "req_…", "status": 409 } }
```

## Errors and limits

The API's own messages are shown as they are, with the request id to quote to support. Each key gets 60 requests a
minute; `kleos review` makes up to eight. A write key is needed for `posts draft`, `posts approve`, `posts record` and
`articles record`.

## Not in the public API yet

Writing a post in your own words, scheduling an approved post, asking for an article draft, approving an article or
newsletter, recording a lead, and starting an AI visibility run. Do those in Kleos, or through the
[Kleos MCP server](https://getkleos.ai/agents), which has them as tools (`create_post`, `schedule_post`,
`draft_article`, `approve_draft`, `check_ai_visibility`).

## More

- Docs for agents and the API: https://getkleos.ai/agents
- The MCP server (same workspace, same rules, for Claude, ChatGPT, Cursor and any MCP client): https://app.getkleos.ai/mcp
- OpenAPI: https://app.getkleos.ai/v1/openapi.json
- Issues: https://github.com/NewOdysseyConsulting/kleos-cli/issues, or support@getkleos.ai

## Developing

```sh
npm install
npm run typecheck   # tsc
npm test            # unit tests against a stubbed fetch (node:test via tsx)
npm run smoke       # builds, then runs the binary with --help
npm run build       # dist/
```

MIT.
