/**
 * What's waiting for review, as the app's review queue and the MCP server's list_review_queue see it: posts and
 * newsletters that are pending_approval, validation_failed or needs_revision, and articles that are pending_approval
 * or needs_revision. The API lists one status per call, so this makes one call per kind and status.
 */
import type { Command } from "commander";
import type { KleosClient } from "../api.js";
import { listBusinesses, resolveBusiness } from "../business.js";
import { plural, table, truncate, when } from "../output.js";
import type { Ctx } from "../program.js";
import type { Article, Newsletter, Post, Product } from "../types.js";

export type ReviewState = "ready" | "needs_fix" | "changes_requested";

export type ReviewItem = {
	id: string;
	kind: "post" | "article" | "newsletter";
	business: string;
	business_id: string;
	title: string;
	channel: string | null;
	planned_for: string | null;
	state: ReviewState;
	status: string;
};

const POST_STATUSES = ["pending_approval", "validation_failed", "needs_revision"];
const ARTICLE_STATUSES = ["pending_approval", "needs_revision"];

export const stateOf = (status: string, qaPassed: boolean | null | undefined): ReviewState =>
	status === "needs_revision" ? "changes_requested" : status === "validation_failed" || qaPassed === false ? "needs_fix" : "ready";

const stateLabel: Record<ReviewState, string> = { ready: "ready to approve", needs_fix: "needs a fix", changes_requested: "changes requested" };

export async function reviewQueue(client: KleosClient, businesses: Product[], onlyBusiness: Product | null): Promise<ReviewItem[]> {
	const nameOf = new Map(businesses.map((b) => [b.id, b.name]));
	const product_id = onlyBusiness?.id;
	const items: ReviewItem[] = [];
	for (const status of POST_STATUSES) {
		for (const p of await client.listAll<Post>("/v1/posts", { product_id, status }, 200)) {
			items.push({ id: p.id, kind: "post", business: nameOf.get(p.product_id) ?? p.product_id, business_id: p.product_id, title: p.hook || p.body || p.topic || "(untitled)", channel: p.channel, planned_for: p.scheduled_at, state: stateOf(p.status, p.qa_passed), status: p.status });
		}
	}
	for (const status of ARTICLE_STATUSES) {
		for (const a of await client.listAll<Article>("/v1/articles", { product_id, status }, 200)) {
			items.push({ id: a.id, kind: "article", business: nameOf.get(a.product_id) ?? a.product_id, business_id: a.product_id, title: a.title, channel: "blog", planned_for: null, state: stateOf(a.status, null), status: a.status });
		}
	}
	for (const status of POST_STATUSES) {
		for (const n of await client.listAll<Newsletter>("/v1/newsletters", { product_id, status }, 200)) {
			items.push({ id: n.id, kind: "newsletter", business: nameOf.get(n.product_id) ?? n.product_id, business_id: n.product_id, title: n.subject || "(no subject yet)", channel: "newsletter", planned_for: n.scheduled_for, state: stateOf(n.status, null), status: n.status });
		}
	}
	// Soonest first; undated last.
	return items.sort((a, b) => (a.planned_for ?? "9").localeCompare(b.planned_for ?? "9"));
}

export function registerReview(program: Command, ctx: Ctx) {
	program
		.command("review")
		.description("What's waiting for review: posts, articles and newsletters, and whether each can be approved")
		.option("-b, --business <id|name>", "Only this business")
		.action(async (opts: { business?: string }) => {
			const client = ctx.client();
			const businesses = await listBusinesses(client);
			const only = opts.business ? await resolveBusiness(client, opts.business) : null;
			const items = await reviewQueue(client, businesses, only);
			const ready = items.filter((i) => i.state === "ready").length;
			const attention = items.length - ready;
			ctx.emit({ counts: { waiting: items.length, ready, needs_attention: attention }, items }, () => {
				const where = only ? only.name : "your workspace";
				if (!items.length) return `Nothing is waiting for review in ${where}.`;
				const head = `${plural(items.length, "draft")} waiting in ${where}: ${ready} ready to approve, ${attention} needing a fix or changes.`;
				const rows = table(items, [
					{ key: "kind", label: "Kind", value: (i) => i.kind },
					{ key: "id", label: "Id", value: (i) => i.id },
					{ key: "business", label: "Business", value: (i) => i.business, width: 24 },
					{ key: "channel", label: "Channel", value: (i) => i.channel },
					{ key: "planned", label: "Planned", value: (i) => when(i.planned_for) },
					{ key: "state", label: "State", value: (i) => stateLabel[i.state] },
					{ key: "title", label: "Title", value: (i) => truncate(i.title, 50), width: 50 },
				]);
				const tail = items.some((i) => i.kind === "post" && i.state === "ready")
					? "Approve a post: kleos posts approve <id>. Articles and newsletters are approved in Kleos (the API has no approve call for them yet)."
					: "Fixes and approvals for articles and newsletters happen in Kleos.";
				return `${head}\n\n${rows}\n\n${tail}`;
			});
		});
}
