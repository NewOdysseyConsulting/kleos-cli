import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { resolveBusiness } from "../business.js";
import { CliError } from "../errors.js";
import { parseTime, statusLabel, table, truncate, when } from "../output.js";
import type { Ctx } from "../program.js";
import type { Post, PostApproval, PostRequest, Slot } from "../types.js";

export const idempotencyKey = () => `kleos-cli-${randomUUID()}`;

export function postLine(p: Post): string {
	const head = [
		`Post ${p.id}`,
		`Status: ${statusLabel(p.status)}${p.qa_passed === false ? " (checks flagged it)" : ""}`,
		`Channel: ${p.channel}`,
		p.topic && `Topic: ${p.topic}`,
		p.scheduled_at && `Planned for: ${when(p.scheduled_at)}`,
		p.published_at && `Published: ${when(p.published_at)}${p.external_url ? ` at ${p.external_url}` : ""}`,
		p.rejection_reason && `Reviewer's note: ${p.rejection_reason}`,
	].filter(Boolean);
	const text = [p.hook, p.body, p.cta, p.destination_url, p.hashtags?.length ? p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ") : null].filter(Boolean);
	return [...head, "", ...text].join("\n").trimEnd();
}

const listColumns = [
	{ key: "id", label: "Id", value: (p: Post) => p.id },
	{ key: "status", label: "Status", value: (p: Post) => statusLabel(p.status) },
	{ key: "channel", label: "Channel", value: (p: Post) => p.channel },
	{ key: "when", label: "When", value: (p: Post) => when(p.published_at ?? p.scheduled_at) },
	{ key: "text", label: "Text", value: (p: Post) => truncate(p.hook || p.body || p.topic || "", 60), width: 60 },
];

const limitOf = (v: string | undefined, fallback: number) => {
	if (v === undefined) return fallback;
	const n = Number(v);
	if (!Number.isInteger(n) || n < 1 || n > 100) throw new CliError("--limit must be a whole number from 1 to 100.", "bad_limit");
	return n;
};

export function registerPosts(program: Command, ctx: Ctx) {
	const posts = program.command("posts").description("Social posts: list, read, ask for a draft, approve, record one as published");

	posts
		.command("list")
		.description("List posts, newest first")
		.option("-b, --business <id|name>", "Only this business")
		.option("--status <status>", "Only this status, for example pending_approval, approved, scheduled, published")
		.option("--channel <channel>", "Only this channel, for example linkedin or x")
		.option("--limit <n>", "How many (1 to 100, default 25)")
		.option("--all", "Every page, not just the first")
		.action(async (opts: { business?: string; status?: string; channel?: string; limit?: string; all?: boolean }) => {
			const client = ctx.client();
			const business = opts.business ? await resolveBusiness(client, opts.business) : null;
			const query = { product_id: business?.id, status: opts.status, channel: opts.channel };
			const data = opts.all ? await client.listAll<Post>("/v1/posts", query) : (await client.get<{ data: Post[] }>("/v1/posts", { ...query, limit: limitOf(opts.limit, 25) })).data;
			ctx.emit({ object: "list", data }, () => (data.length ? table(data, listColumns) : "No posts match."));
		});

	posts
		.command("get <id>")
		.description("Show a post in full")
		.action(async (id: string) => {
			const post = await ctx.client().get<Post>(`/v1/posts/${id}`);
			ctx.emit(post, () => postLine(post));
		});

	posts
		.command("draft")
		.description("Ask Kleos to write a post on a topic. The draft waits for review; nothing is published")
		.option("-b, --business <id|name>", "The business (optional when the workspace has one)")
		.option("--topic <text>", "What the post is about (up to 500 characters)")
		.option("--slot <id>", "Draft an existing planned calendar slot instead of adding a new post")
		.option("--at <time>", "When the new post is due (2026-11-20 09:30 or ISO 8601); default tomorrow. Ignored with --slot")
		.option("--wait [seconds]", "Wait for the draft and print it (default 180 seconds)")
		.action(async (opts: { business?: string; topic?: string; slot?: string; at?: string; wait?: string | boolean }) => {
			if (!opts.topic?.trim() && !opts.slot) throw new CliError("Say what the post is about with --topic, or name a planned slot with --slot.", "topic_required");
			const client = ctx.client();
			const business = await resolveBusiness(client, opts.business);
			const body: Record<string, unknown> = { product_id: business.id, topic: opts.topic?.trim() || "" };
			if (opts.slot) body.slot_id = opts.slot;
			else if (opts.at) body.scheduled_at = parseTime(opts.at);
			const queued = await client.request<PostRequest>("POST", "/v1/posts", { body, idempotencyKey: idempotencyKey() });

			if (opts.wait === undefined) {
				ctx.emit(queued, () => `Queued a draft about "${queued.topic}" for ${business.name} (slot ${queued.slot_id}).\nIt waits for review when it's ready: \`kleos review\`, or \`kleos posts draft --wait\` next time to see it here.`);
				return;
			}
			const seconds = opts.wait === true ? 180 : Number(opts.wait);
			if (!Number.isFinite(seconds) || seconds < 1) throw new CliError("--wait takes a number of seconds.", "bad_wait");
			const until = ctx.deps.now().getTime() + seconds * 1000;
			let slot: Slot | null = null;
			while (ctx.deps.now().getTime() < until) {
				slot = await client.get<Slot>(`/v1/calendar/slots/${queued.slot_id}`);
				if (slot.post_id) break;
				await ctx.deps.sleep(5000);
			}
			if (!slot?.post_id) {
				ctx.emit({ ...queued, post: null, waited_seconds: seconds }, () => `Still drafting after ${seconds} seconds. It'll show in \`kleos review\` when it's ready (slot ${queued.slot_id}).`);
				return;
			}
			const post = await client.get<Post>(`/v1/posts/${slot.post_id}`);
			ctx.emit({ ...queued, post }, () => `Drafted for ${business.name}. It's ${statusLabel(post.status)}; approve it with \`kleos posts approve ${post.id}\`.\n\n${postLine(post)}`);
		});

	posts
		.command("approve <id>")
		.description("Approve a post waiting for review (with auto-publish on, Kleos then schedules it, as in the app)")
		.option("--comment <text>", "A note kept with the approval")
		.action(async (id: string, opts: { comment?: string }) => {
			const r = await ctx.client().request<PostApproval>("POST", `/v1/posts/${id}/approve`, { body: opts.comment ? { comment: opts.comment } : {}, idempotencyKey: idempotencyKey() });
			ctx.emit(r, () => {
				const pub = r.publishing;
				const next = pub.scheduled
					? `Auto-publish is on, so Kleos scheduled it${pub.target ? ` on ${pub.target}` : ""}${pub.at ? ` for ${when(pub.at)}` : ""}.`
					: `It stays approved for someone to publish from Kleos${pub.note ? ` (${pub.note})` : ""}.`;
				return `Approved post ${r.post.id}. Status: ${statusLabel(r.post.status)}. ${next}`;
			});
		});

	posts
		.command("record <id> <url>")
		.alias("publish-record")
		.description("Record that an approved post went out elsewhere, with its live https address")
		.action(async (id: string, url: string) => {
			const post = await ctx.client().request<Post>("PATCH", `/v1/posts/${id}`, { body: { external_url: url } });
			ctx.emit(post, () => `Recorded post ${post.id} as published at ${post.external_url}.`);
		});

	posts.addHelpText("after", "\nNone of these publishes anything by itself. Writing a post in your own words and scheduling one are not in the public API yet; do those in Kleos.");
}
