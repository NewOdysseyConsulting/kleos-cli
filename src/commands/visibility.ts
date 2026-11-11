import type { Command } from "commander";
import { resolveBusiness } from "../business.js";
import { table, truncate, when } from "../output.js";
import type { Ctx } from "../program.js";
import type { GeoResult, GeoRun, GeoRunDetail } from "../types.js";

export function runSummary(run: GeoRunDetail): string {
	const s = run.summary;
	const pct = (n: number) => (s.checked ? `${Math.round((100 * n) / s.checked)}%` : "–");
	const competitors = s.competitors.slice(0, 5).map((c) => `${c.name} (${c.count})`).join(", ");
	return [
		`Run ${run.id}: ${run.status}${run.finished_at ? `, finished ${when(run.finished_at)}` : run.started_at ? `, started ${when(run.started_at)}` : ""} (${run.completed}/${run.total} checks${s.failed ? `, ${s.failed} failed` : ""}).`,
		`Named in ${s.mentioned} of ${s.checked} answers (${pct(s.mentioned)}); recommended in ${s.recommended} (${pct(s.recommended)}); cited in ${s.cited} (${pct(s.cited)}).`,
		competitors ? `Competitors the assistants named most: ${competitors}.` : "",
	].filter(Boolean).join("\n");
}

export function registerVisibility(program: Command, ctx: Ctx) {
	program
		.command("visibility")
		.description("Whether AI assistants name and cite a business when asked its buyers' questions (latest runs)")
		.option("-b, --business <id|name>", "The business (optional when the workspace has one)")
		.option("--run <id>", "A particular run instead of the latest finished one")
		.option("--results", "Also list each question and assistant's answer for that run")
		.option("--limit <n>", "How many runs to list (default 10)")
		.action(async (opts: { business?: string; run?: string; results?: boolean; limit?: string }) => {
			const client = ctx.client();
			const business = await resolveBusiness(client, opts.business);
			const limit = Math.min(100, Math.max(1, Number(opts.limit ?? 10) || 10));
			const runs = (await client.get<{ data: GeoRun[] }>("/v1/geo/runs", { product_id: business.id, limit })).data;
			const chosenId = opts.run ?? runs.find((r) => r.status === "completed")?.id ?? runs[0]?.id ?? null;
			const detail = chosenId ? await client.get<GeoRunDetail>(`/v1/geo/runs/${chosenId}`) : null;
			const results = detail && opts.results ? await client.listAll<GeoResult>(`/v1/geo/runs/${detail.id}/results`, {}, 500) : null;

			ctx.emit({ business: { id: business.id, name: business.name }, runs, run: detail, results }, () => {
				if (!runs.length && !detail) return `${business.name} has no AI visibility runs yet. Kleos runs one every week; start one sooner from Results → AI visibility in Kleos (the API can't start a run yet).`;
				const parts: string[] = [];
				if (detail) parts.push(`${business.name}\n${runSummary(detail)}`);
				if (results) {
					parts.push(
						results.length
							? table(results, [
									{ key: "engine", label: "Assistant", value: (r) => r.engine ?? "" },
									{ key: "mentioned", label: "Named", value: (r) => (r.error ? "error" : r.mentioned) },
									{ key: "recommended", label: "Recommended", value: (r) => (r.error ? "" : r.recommended) },
									{ key: "cited", label: "Cited", value: (r) => (r.error ? "" : r.cited) },
									{ key: "question", label: "Question", value: (r) => truncate(r.question, 70), width: 70 },
								])
							: "No results for that run.",
					);
				}
				if (runs.length) {
					parts.push(
						`Runs (newest first)\n` +
							table(runs, [
								{ key: "id", label: "Id", value: (r) => r.id },
								{ key: "status", label: "Status", value: (r) => r.status },
								{ key: "when", label: "When", value: (r) => when(r.finished_at ?? r.started_at ?? r.created_at) },
								{ key: "checks", label: "Checks", value: (r) => `${r.completed}/${r.total}` },
								{ key: "trigger", label: "Started by", value: (r) => (r.trigger === "scheduled" ? "schedule" : r.trigger === "manual" ? "someone" : r.trigger ?? "") },
							]),
					);
				}
				parts.push("Starting a run isn't in the public API yet; Kleos runs one each week, or start one in Results → AI visibility.");
				return parts.join("\n\n");
			});
		});
}
