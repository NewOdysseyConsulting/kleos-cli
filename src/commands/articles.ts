import type { Command } from "commander";
import { resolveBusiness } from "../business.js";
import { CliError } from "../errors.js";
import { statusLabel, table, truncate, when } from "../output.js";
import type { Ctx } from "../program.js";
import type { Article, ArticleDetail } from "../types.js";

const columns = [
	{ key: "id", label: "Id", value: (a: Article) => a.id },
	{ key: "status", label: "Status", value: (a: Article) => statusLabel(a.status) },
	{ key: "when", label: "When", value: (a: Article) => when(a.published_at ?? a.updated_at) },
	{ key: "title", label: "Title", value: (a: Article) => truncate(a.title, 60), width: 60 },
	{ key: "keyword", label: "Search phrase", value: (a: Article) => a.primary_keyword, width: 30 },
];

export function articleText(a: ArticleDetail): string {
	const head = [
		`Article ${a.id}`,
		`Status: ${statusLabel(a.status)}`,
		`Title: ${a.title}`,
		a.primary_keyword && `Search phrase: ${a.primary_keyword}`,
		a.meta_description && `Description: ${a.meta_description}`,
		a.published_at && `Published: ${when(a.published_at)}${a.external_url ? ` at ${a.external_url}` : ""}`,
	].filter(Boolean);
	const faq = (a.faq ?? [])
		.map((f) => {
			const q = (f.question ?? f.q) as string | undefined;
			const ans = (f.answer ?? f.a) as string | undefined;
			return q ? `Q: ${q}${ans ? `\nA: ${ans}` : ""}` : null;
		})
		.filter(Boolean);
	return [...head, "", a.body_md ?? "(no text yet)", ...(faq.length ? ["", "FAQ", ...faq] : [])].join("\n").trimEnd();
}

export function registerArticles(program: Command, ctx: Ctx) {
	const articles = program.command("articles").description("Blog articles: list, read, record one as published");

	articles
		.command("list")
		.description("List articles, newest first (without the text)")
		.option("-b, --business <id|name>", "Only this business")
		.option("--status <status>", "Only this status, for example pending_approval, approved, published")
		.option("--limit <n>", "How many (1 to 100, default 25)")
		.option("--all", "Every page, not just the first")
		.action(async (opts: { business?: string; status?: string; limit?: string; all?: boolean }) => {
			const client = ctx.client();
			const business = opts.business ? await resolveBusiness(client, opts.business) : null;
			const query = { product_id: business?.id, status: opts.status };
			const limit = opts.limit === undefined ? 25 : Number(opts.limit);
			if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new CliError("--limit must be a whole number from 1 to 100.", "bad_limit");
			const data = opts.all ? await client.listAll<Article>("/v1/articles", query) : (await client.get<{ data: Article[] }>("/v1/articles", { ...query, limit })).data;
			ctx.emit({ object: "list", data }, () => (data.length ? table(data, columns) : "No articles match."));
		});

	articles
		.command("get <id>")
		.description("Show an article with its text as Markdown")
		.action(async (id: string) => {
			const article = await ctx.client().get<ArticleDetail>(`/v1/articles/${id}`);
			ctx.emit(article, () => articleText(article));
		});

	articles
		.command("record <id> <url>")
		.description("Record that an approved article went live on your site, with its https address")
		.action(async (id: string, url: string) => {
			const article = await ctx.client().request<ArticleDetail>("PATCH", `/v1/articles/${id}`, { body: { external_url: url } });
			ctx.emit(article, () => `Recorded article ${article.id} as published at ${article.external_url}.`);
		});

	articles.addHelpText("after", "\nAsking for an article draft and approving one are not in the public API yet; do those in Kleos (or through the MCP server).");
}
