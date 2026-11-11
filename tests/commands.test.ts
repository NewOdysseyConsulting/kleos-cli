import assert from "node:assert/strict";
import { test } from "node:test";
import { apiError, BUSINESS, cli, list, OTHER } from "./harness.js";

const POST = {
	object: "post",
	id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	product_id: BUSINESS.id,
	channel: "linkedin",
	status: "pending_approval",
	hook: "Three invoices, one afternoon",
	body: "How a two-person studio got paid on time.",
	hashtags: ["smallbusiness"],
	cta: null,
	destination_url: null,
	topic: "getting paid on time",
	scheduled_at: "2026-11-12T09:00:00.000Z",
	published_at: null,
	external_url: null,
	qa_passed: true,
	rejection_reason: null,
	created_at: "2026-11-10T00:00:00.000Z",
	updated_at: "2026-11-10T00:00:00.000Z",
};

const products = { path: "/v1/products", body: list([BUSINESS, OTHER]) };
const oneProduct = { path: "/v1/products", body: list([BUSINESS]) };

test("businesses lists every page and prints a table or JSON", async () => {
	const r = await cli(["businesses"], {
		routes: [{ path: "/v1/products", reply: (req) => (req.query.cursor === "page2" ? list([OTHER]) : list([BUSINESS], "page2")) }],
	});
	assert.equal(r.code, 0, r.stderr);
	assert.equal(r.requests.length, 2);
	assert.equal(r.requests[1].query.cursor, "page2");
	assert.match(r.stdout, /ID\s+NAME\s+WEBSITE\s+AUTOPILOT/);
	assert.match(r.stdout, /Fold Studio\s+foldstudio\.com\s+drafts/);
	assert.match(r.stdout, /Second Brand\s+second\.example\s+drafts, publishes/);

	const j = await cli(["--json", "businesses"], { routes: [products] });
	assert.equal(j.json().data.length, 2);
	assert.equal(j.json().data[0].id, BUSINESS.id);
});

test("--business resolves a name, a domain or an id", async () => {
	const byName = await cli(["posts", "list", "--business", "second brand"], { routes: [products, { path: "/v1/posts", body: list([]) }] });
	assert.equal(byName.code, 0, byName.stderr);
	assert.equal(byName.requests[1].query.product_id, OTHER.id);

	const byDomain = await cli(["posts", "list", "-b", "foldstudio.com"], { routes: [products, { path: "/v1/posts", body: list([]) }] });
	assert.equal(byDomain.requests[1].query.product_id, BUSINESS.id);

	const byId = await cli(["posts", "list", "-b", OTHER.id], { routes: [{ path: `/v1/products/${OTHER.id}`, body: OTHER }, { path: "/v1/posts", body: list([]) }] });
	assert.equal(byId.requests[0].path, `/v1/products/${OTHER.id}`);
	assert.equal(byId.requests[1].query.product_id, OTHER.id);

	const missing = await cli(["posts", "list", "-b", "Nobody"], { routes: [products] });
	assert.equal(missing.code, 1);
	assert.match(missing.stderr, /No business called "Nobody"\. Yours: Fold Studio \(.*\), Second Brand/);
});

test("a business is needed when the workspace has more than one, and assumed when it has one", async () => {
	const many = await cli(["results"], { routes: [products] });
	assert.equal(many.code, 1);
	assert.match(many.stderr, /Which business\? Add --business/);

	const one = await cli(["results", "--days", "30"], {
		routes: [oneProduct, { path: `/v1/products/${BUSINESS.id}/attribution`, body: attribution() }],
	});
	assert.equal(one.code, 0, one.stderr);
	assert.equal(one.requests[1].query.days, "30");
	assert.match(one.stdout, /Fold Studio, last 30 days/);
	assert.match(one.stdout, /First touch: 4 leads, 2 deals, 1 won/);
	assert.match(one.stdout, /Launch week/);
});

test("results rejects days outside the API's range before calling it", async () => {
	const r = await cli(["results", "-b", BUSINESS.id, "--days", "3"]);
	assert.equal(r.code, 1);
	assert.equal(r.requests.length, 0);
	assert.match(r.stderr, /--days must be a whole number from 7 to 365/);
});

test("posts list builds the query from the flags and --all walks the pages", async () => {
	const r = await cli(["posts", "list", "--status", "approved", "--channel", "x", "--limit", "5"], { routes: [{ path: "/v1/posts", body: list([POST]) }] });
	assert.equal(r.code, 0, r.stderr);
	assert.deepEqual(r.requests[0].query, { status: "approved", channel: "x", limit: "5" });
	assert.match(r.stdout, /waiting for review\s+linkedin\s+2026-11-12 \d\d:\d\d\s+Three invoices/);

	const all = await cli(["posts", "list", "--all"], { routes: [{ path: "/v1/posts", reply: (req) => (req.query.cursor ? list([POST]) : list([POST], "c2")) }] });
	assert.equal(all.requests.length, 2);
	assert.equal(all.requests[0].query.limit, "100");

	const bad = await cli(["posts", "list", "--limit", "500"]);
	assert.equal(bad.code, 1);
	assert.equal(bad.requests.length, 0);
});

test("posts draft posts the topic with an Idempotency-Key and says the draft waits for review", async () => {
	const r = await cli(["posts", "draft", "-b", "Fold Studio", "--topic", "late invoices", "--at", "2026-11-20T09:30:00Z"], {
		routes: [products, { method: "POST", path: "/v1/posts", status: 202, body: { object: "post_request", slot_id: "s1", product_id: BUSINESS.id, topic: "late invoices", status: "queued" } }],
	});
	assert.equal(r.code, 0, r.stderr);
	const post = r.requests[1];
	assert.equal(post.method, "POST");
	assert.deepEqual(post.body, { product_id: BUSINESS.id, topic: "late invoices", scheduled_at: "2026-11-20T09:30:00.000Z" });
	assert.match(post.headers["idempotency-key"], /^kleos-cli-[0-9a-f-]{36}$/);
	assert.equal(post.headers["content-type"], "application/json");
	assert.match(r.stdout, /Queued a draft about "late invoices" for Fold Studio/);
	assert.match(r.stdout, /waits for review/);
});

test("posts draft --slot drafts a planned slot and ignores --at; no topic and no slot is refused", async () => {
	const r = await cli(["posts", "draft", "-b", BUSINESS.id, "--slot", "slot-1", "--at", "2026-11-20"], {
		routes: [{ path: `/v1/products/${BUSINESS.id}`, body: BUSINESS }, { method: "POST", path: "/v1/posts", status: 202, body: { object: "post_request", slot_id: "slot-1", product_id: BUSINESS.id, topic: "", status: "queued" } }],
	});
	assert.equal(r.code, 0, r.stderr);
	assert.deepEqual(r.requests[1].body, { product_id: BUSINESS.id, topic: "", slot_id: "slot-1" });

	const none = await cli(["posts", "draft", "-b", BUSINESS.id]);
	assert.equal(none.code, 1);
	assert.equal(none.requests.length, 0);
	assert.match(none.stderr, /--topic/);
});

test("posts draft --wait polls the slot and prints the finished draft", async () => {
	const slot = { object: "calendar_slot", id: "s1", product_id: BUSINESS.id, channel: "linkedin", scheduled_at: POST.scheduled_at, topic: "late invoices", pillar: null, format: null, status: "planned", post_id: null as string | null, created_at: "" };
	const r = await cli(["--json", "posts", "draft", "-b", BUSINESS.id, "--topic", "late invoices", "--wait", "30"], {
		routes: [
			{ path: `/v1/products/${BUSINESS.id}`, body: BUSINESS },
			{ method: "POST", path: "/v1/posts", status: 202, body: { object: "post_request", slot_id: "s1", product_id: BUSINESS.id, topic: "late invoices", status: "queued" } },
			{ path: "/v1/calendar/slots/s1", reply: (_req, nth) => (nth < 2 ? slot : { ...slot, post_id: POST.id }) },
			{ path: `/v1/posts/${POST.id}`, body: POST },
		],
	});
	assert.equal(r.code, 0, r.stderr);
	assert.equal(r.requests.filter((q) => q.path === "/v1/calendar/slots/s1").length, 3);
	assert.equal(r.json().post.id, POST.id);
	assert.equal(r.json().slot_id, "s1");
});

test("posts approve sends the comment and explains what happens next from the API's answer", async () => {
	const scheduled = await cli(["posts", "approve", POST.id, "--comment", "Good to go"], {
		routes: [{ method: "POST", path: `/v1/posts/${POST.id}/approve`, body: { object: "post_approval", post: { ...POST, status: "scheduled" }, publishing: { scheduled: true, target: "LinkedIn page", at: POST.scheduled_at, note: null } } }],
	});
	assert.equal(scheduled.code, 0, scheduled.stderr);
	assert.deepEqual(scheduled.requests[0].body, { comment: "Good to go" });
	assert.ok(scheduled.requests[0].headers["idempotency-key"]);
	assert.match(scheduled.stdout, /Approved post .*Status: scheduled\. Auto-publish is on, so Kleos scheduled it on LinkedIn page/);

	const held = await cli(["posts", "approve", POST.id], {
		routes: [{ method: "POST", path: `/v1/posts/${POST.id}/approve`, body: { object: "post_approval", post: { ...POST, status: "approved" }, publishing: { scheduled: false, target: null, at: null, note: "auto-publish is off" } } }],
	});
	assert.deepEqual(held.requests[0].body, {});
	assert.match(held.stdout, /stays approved for someone to publish from Kleos \(auto-publish is off\)/);
});

test("approving a draft the checks flagged passes the API's refusal through", async () => {
	const r = await cli(["posts", "approve", POST.id], { routes: [apiError(409, "conflict_error", "needs_fix", "This post can't be approved while it needs a fix.")] });
	assert.equal(r.code, 1);
	assert.equal(r.stderr, "Error: This post can't be approved while it needs a fix. (request req_123)");
	const j = await cli(["--json", "posts", "approve", POST.id], { routes: [apiError(409, "conflict_error", "needs_fix", "This post can't be approved while it needs a fix.")] });
	assert.equal(j.code, 1);
	assert.equal(j.json().error.code, "needs_fix");
	assert.equal(j.json().error.request_id, "req_123");
	assert.equal(j.json().error.status, 409);
});

test("posts record (and its publish-record alias) PATCHes the live address", async () => {
	const r = await cli(["posts", "publish-record", POST.id, "https://linkedin.com/posts/123"], {
		routes: [{ method: "PATCH", path: `/v1/posts/${POST.id}`, body: { ...POST, status: "published", external_url: "https://linkedin.com/posts/123" } }],
	});
	assert.equal(r.code, 0, r.stderr);
	assert.deepEqual(r.requests[0].body, { external_url: "https://linkedin.com/posts/123" });
	assert.match(r.stdout, /Recorded post .* as published at https:\/\/linkedin\.com\/posts\/123/);
});

test("posts get prints the post in full", async () => {
	const r = await cli(["posts", "get", POST.id], { routes: [{ path: `/v1/posts/${POST.id}`, body: POST }] });
	assert.equal(r.code, 0, r.stderr);
	assert.match(r.stdout, /Status: waiting for review\nChannel: linkedin\nTopic: getting paid on time/);
	assert.match(r.stdout, /Three invoices, one afternoon\nHow a two-person studio got paid on time\.\n#smallbusiness$/);
});

test("articles list, get and record", async () => {
	const article = { object: "article", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", product_id: BUSINESS.id, title: "How to get paid on time", slug: null, status: "approved", primary_keyword: "late invoices", meta_title: null, meta_description: null, external_url: null, published_at: null, created_at: "2026-11-10T00:00:00.000Z", updated_at: "2026-11-10T00:00:00.000Z" };
	const listed = await cli(["articles", "list", "--status", "approved"], { routes: [{ path: "/v1/articles", body: list([article]) }] });
	assert.equal(listed.code, 0, listed.stderr);
	assert.deepEqual(listed.requests[0].query, { status: "approved", limit: "25" });
	assert.match(listed.stdout, /approved\s+2026-11-10 \d\d:\d\d\s+How to get paid on time\s+late invoices/);

	const got = await cli(["articles", "get", article.id], { routes: [{ path: `/v1/articles/${article.id}`, body: { ...article, body_md: "# Getting paid\n\nSend the invoice the day you finish.", faq: [{ question: "When?", answer: "Same day." }] } }] });
	assert.match(got.stdout, /Title: How to get paid on time\nSearch phrase: late invoices\n\n# Getting paid\n\nSend the invoice the day you finish\.\n\nFAQ\nQ: When\?\nA: Same day\./);

	const recorded = await cli(["articles", "record", article.id, "https://foldstudio.com/blog/get-paid"], {
		routes: [{ method: "PATCH", path: `/v1/articles/${article.id}`, body: { ...article, status: "published", external_url: "https://foldstudio.com/blog/get-paid", body_md: null, faq: [] } }],
	});
	assert.deepEqual(recorded.requests[0].body, { external_url: "https://foldstudio.com/blog/get-paid" });
	assert.match(recorded.stdout, /Recorded article .* as published at https:\/\/foldstudio\.com\/blog\/get-paid/);
});

test("review gathers the waiting drafts across kinds and statuses and says which can be approved", async () => {
	const flagged = { ...POST, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", status: "validation_failed", qa_passed: false, hook: "Flagged one", scheduled_at: "2026-11-13T09:00:00.000Z" };
	const changes = { ...POST, id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", status: "needs_revision", product_id: OTHER.id, hook: "Needs changes", scheduled_at: "2026-11-11T09:00:00.000Z" };
	const article = { object: "article", id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", product_id: BUSINESS.id, title: "An article waiting", slug: null, status: "pending_approval", primary_keyword: null, meta_title: null, meta_description: null, external_url: null, published_at: null, created_at: "", updated_at: "" };
	const r = await cli(["review"], {
		routes: [
			products,
			{ path: "/v1/posts", reply: (req) => list(req.query.status === "pending_approval" ? [POST] : req.query.status === "validation_failed" ? [flagged] : [changes]) },
			{ path: "/v1/articles", reply: (req) => list(req.query.status === "pending_approval" ? [article] : []) },
			{ path: "/v1/newsletters", body: list([]) },
		],
	});
	assert.equal(r.code, 0, r.stderr);
	const statuses = r.requests.filter((q) => q.path === "/v1/posts").map((q) => q.query.status);
	assert.deepEqual(statuses, ["pending_approval", "validation_failed", "needs_revision"]);
	assert.deepEqual(r.requests.filter((q) => q.path === "/v1/articles").map((q) => q.query.status), ["pending_approval", "needs_revision"]);
	assert.equal(r.requests.filter((q) => q.path === "/v1/newsletters").length, 3);
	assert.match(r.stdout, /4 drafts waiting in your workspace: 2 ready to approve, 2 needing a fix or changes\./);
	// Soonest first, undated (the article) last.
	const order = r.stdout.split("\n").filter((l) => /^(post|article)\s/.test(l)).map((l) => l.split(/\s{2,}/)[1]);
	assert.deepEqual(order, [changes.id, POST.id, flagged.id, article.id]);
	assert.match(r.stdout, /Second Brand\s+linkedin\s+2026-11-11 \d\d:\d\d\s+changes requested\s+Needs changes/);
	assert.match(r.stdout, /needs a fix\s+Flagged one/);
	assert.match(r.stdout, /Approve a post: kleos posts approve <id>/);

	const j = await cli(["--json", "review", "-b", "Fold Studio"], {
		routes: [products, { path: "/v1/posts", body: list([]) }, { path: "/v1/articles", body: list([]) }, { path: "/v1/newsletters", body: list([]) }],
	});
	assert.deepEqual(j.json(), { counts: { waiting: 0, ready: 0, needs_attention: 0 }, items: [] });
	assert.ok(j.requests.filter((q) => q.path !== "/v1/products").every((q) => q.query.product_id === BUSINESS.id));
});

test("visibility shows the latest finished run's summary and, with --results, each answer", async () => {
	const run = { object: "geo_run", id: "r2", product_id: BUSINESS.id, question_set: "weekly", status: "completed", trigger: "scheduled", total: 20, completed: 20, started_at: "2026-11-09T00:00:00.000Z", finished_at: "2026-11-09T00:10:00.000Z", created_at: "2026-11-09T00:00:00.000Z" };
	const running = { ...run, id: "r3", status: "running", completed: 4, finished_at: null };
	const detail = { ...run, summary: { checked: 19, failed: 1, mentioned: 5, recommended: 2, cited: 1, competitors: [{ name: "Rival Co", count: 7 }] } };
	const result = { object: "geo_result", id: "g1", run_id: "r2", question: "Best invoicing tool for studios?", engine: "chatgpt", mentioned: true, recommended: false, cited: false, competitors_mentioned: ["Rival Co"], cited_domains: [], error: null, tested_at: "" };
	const r = await cli(["visibility", "-b", BUSINESS.id, "--results"], {
		routes: [
			{ path: `/v1/products/${BUSINESS.id}`, body: BUSINESS },
			{ path: "/v1/geo/runs", body: list([running, run]) },
			{ path: "/v1/geo/runs/r2", body: detail },
			{ path: "/v1/geo/runs/r2/results", body: list([result]) },
		],
	});
	assert.equal(r.code, 0, r.stderr);
	assert.equal(r.requests[1].query.product_id, BUSINESS.id);
	assert.match(r.stdout, /Named in 5 of 19 answers \(26%\); recommended in 2 \(11%\); cited in 1 \(5%\)\./);
	assert.match(r.stdout, /Competitors the assistants named most: Rival Co \(7\)\./);
	assert.match(r.stdout, /chatgpt\s+yes\s+no\s+no\s+Best invoicing tool for studios\?/);
	assert.match(r.stdout, /r3\s+running/);
	assert.match(r.stdout, /Starting a run isn't in the public API yet/);

	const chosen = await cli(["--json", "visibility", "-b", BUSINESS.id, "--run", "r1"], {
		routes: [{ path: `/v1/products/${BUSINESS.id}`, body: BUSINESS }, { path: "/v1/geo/runs", body: list([run]) }, { path: "/v1/geo/runs/r1", body: { ...detail, id: "r1" } }],
	});
	assert.equal(chosen.json().run.id, "r1");
	assert.equal(chosen.json().results, null);
});

test("usage prints the plan's allowances", async () => {
	const r = await cli(["usage"], {
		routes: [{ path: "/v1/usage", body: { object: "usage", plan: { id: "growth", name: "Growth" }, mode: "paid", period_start: "2026-11-01T00:00:00.000Z", resets_on: "2026-12-01T00:00:00.000Z", metrics: [{ metric: "posts", label: "Social posts", allowance: 60, used: 12, overage: 0 }] } }],
	});
	assert.equal(r.code, 0, r.stderr);
	assert.match(r.stdout, /Plan: Growth \(paid\)/);
	assert.match(r.stdout, /Social posts\s+12\s+60/);
});

test("api calls any endpoint with a body and query, and always prints JSON", async () => {
	const r = await cli(["api", "post", "/v1/webhooks", "--data", '{"url":"https://example.com/hook"}', "-q", "a=1", "b=two"], {
		routes: [{ method: "POST", path: "/v1/webhooks", status: 201, body: { object: "webhook_endpoint", id: "w1" } }],
	});
	assert.equal(r.code, 0, r.stderr);
	assert.equal(r.requests[0].method, "POST");
	assert.deepEqual(r.requests[0].query, { a: "1", b: "two" });
	assert.deepEqual(r.requests[0].body, { url: "https://example.com/hook" });
	assert.ok(r.requests[0].headers["idempotency-key"]);
	assert.deepEqual(r.json(), { object: "webhook_endpoint", id: "w1" });

	const bad = await cli(["api", "PUT", "/v1/webhooks"]);
	assert.equal(bad.code, 1);
	assert.match(bad.stderr, /Method must be one of GET, POST, PATCH, DELETE/);
	const badJson = await cli(["api", "POST", "/v1/webhooks", "--data", "{nope"]);
	assert.match(badJson.stderr, /--data must be valid JSON/);
});

test("a non-JSON answer and an unreachable server become plain errors", async () => {
	const html = await cli(["usage"], { routes: [{ path: "/v1/usage", status: 502, text: "<html>Bad gateway</html>" }] });
	assert.equal(html.code, 1);
	assert.match(html.stderr, /Error: Kleos answered 502[^\n]*Bad gateway/);
	assert.doesNotMatch(html.stderr, /request /);

	const r429 = await cli(["usage"], { routes: [apiError(429, "rate_limit_error", "rate_limited", "Too many requests.")] });
	assert.match(r429.stderr, /Too many requests\. Each key gets 60 requests a minute/);
});

test("--help exits 0 and names every command", async () => {
	const r = await cli(["--help"]);
	assert.equal(r.code, 0);
	for (const name of ["login", "logout", "businesses", "posts", "articles", "review", "results", "visibility", "usage", "api"]) assert.match(r.stdout, new RegExp(`^\\s+${name}\\b`, "m"));
	assert.match(r.stdout, /settings\/api/);
	const unknown = await cli(["nothing"]);
	assert.equal(unknown.code, 1);
	assert.match(unknown.stderr, /unknown command 'nothing'/);
});

function attribution() {
	const touch = { leads: 4, deals: 2, won: 1, won_revenue: 1200, open_value: 800 };
	const row = { key: "launch", label: "Launch week", pieces: 6, sessions: 300, engaged_sessions: 120, key_events: 9, revenue: 1200, first_touch: touch, last_touch: touch };
	return {
		object: "attribution_summary",
		product_id: BUSINESS.id,
		from: "2026-10-12",
		to: "2026-11-11",
		currency: "GBP",
		totals: { sessions: 300, engaged_sessions: 120, key_events: 9, revenue: 1200, first_touch: touch, last_touch: touch },
		campaigns: [row],
		pillars: [],
		top_pieces: [{ ...row, code: "k1", entity_type: "post", entity_id: BUSINESS.id, campaign: "launch", pillar: null, medium: "social" }],
		unmatched: { leads: 1, deals: 0 },
		sources: { tagging: true, ga4: true, hubspot: false, webhook_endpoints: 1, leads_stored: 5, deals_stored: 2 },
	};
}
