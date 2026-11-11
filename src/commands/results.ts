import type { Command } from "commander";
import { resolveBusiness } from "../business.js";
import { CliError } from "../errors.js";
import { money, table, truncate } from "../output.js";
import type { Ctx } from "../program.js";
import type { AttributionRow, AttributionSummary } from "../types.js";

function rowsTable(rows: AttributionRow[], label: string, currency: string | null): string {
	return table(rows, [
		{ key: "label", label, value: (r) => truncate(r.label, 44), width: 44 },
		{ key: "pieces", label: "Pieces", value: (r) => r.pieces },
		{ key: "sessions", label: "Sessions", value: (r) => r.sessions },
		{ key: "engaged", label: "Engaged", value: (r) => r.engaged_sessions },
		{ key: "events", label: "Key events", value: (r) => r.key_events },
		{ key: "leads", label: "Leads (first/last)", value: (r) => `${r.first_touch.leads}/${r.last_touch.leads}` },
		{ key: "won", label: "Won (first/last)", value: (r) => `${r.first_touch.won}/${r.last_touch.won}` },
		{ key: "revenue", label: "Revenue", value: (r) => money(r.revenue, currency) },
	]);
}

export function resultsText(name: string, s: AttributionSummary, days: number): string {
	const t = s.totals;
	const sources = [s.sources.tagging && "link tagging", s.sources.ga4 && "GA4", s.sources.hubspot && "HubSpot", s.sources.webhook_endpoints > 0 && `${s.sources.webhook_endpoints} webhook endpoint${s.sources.webhook_endpoints === 1 ? "" : "s"}`].filter(Boolean);
	const lines = [
		`${name}, last ${days} days (${s.from} to ${s.to}). Attributed to Kleos content, not proven causal.`,
		`Sources: ${sources.length ? sources.join(", ") : "none connected yet"}; ${s.sources.leads_stored} leads and ${s.sources.deals_stored} deals stored.`,
		"",
		`Sessions ${t.sessions.toLocaleString("en-US")} (${t.engaged_sessions.toLocaleString("en-US")} engaged), key events ${t.key_events.toLocaleString("en-US")}, revenue ${money(t.revenue, s.currency)}.`,
		`First touch: ${t.first_touch.leads} leads, ${t.first_touch.deals} deals, ${t.first_touch.won} won (${money(t.first_touch.won_revenue, s.currency)} won, ${money(t.first_touch.open_value, s.currency)} open).`,
		`Latest touch: ${t.last_touch.leads} leads, ${t.last_touch.deals} deals, ${t.last_touch.won} won (${money(t.last_touch.won_revenue, s.currency)} won, ${money(t.last_touch.open_value, s.currency)} open).`,
		s.unmatched.leads || s.unmatched.deals ? `Not matched to any piece: ${s.unmatched.leads} leads, ${s.unmatched.deals} deals.` : "",
	];
	if (s.campaigns.length) lines.push("", rowsTable(s.campaigns, "Campaign", s.currency));
	if (s.pillars.length) lines.push("", rowsTable(s.pillars, "Theme", s.currency));
	if (s.top_pieces.length) lines.push("", rowsTable(s.top_pieces.slice(0, 10), "Top pieces", s.currency));
	return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n").trimEnd();
}

export function registerResults(program: Command, ctx: Ctx) {
	program
		.command("results")
		.description("What a business's content did: sessions, leads, deals and revenue traced to Kleos content")
		.option("-b, --business <id|name>", "The business (optional when the workspace has one)")
		.option("--days <n>", "How far back, 7 to 365 (default 90)")
		.action(async (opts: { business?: string; days?: string }) => {
			const days = opts.days === undefined ? 90 : Number(opts.days);
			if (!Number.isInteger(days) || days < 7 || days > 365) throw new CliError("--days must be a whole number from 7 to 365.", "bad_days");
			const client = ctx.client();
			const business = await resolveBusiness(client, opts.business);
			const summary = await client.get<AttributionSummary>(`/v1/products/${business.id}/attribution`, { days });
			ctx.emit(summary, () => resultsText(business.name, summary, days));
		});
}
