import type { Command } from "commander";
import { table, when } from "../output.js";
import type { Ctx } from "../program.js";
import type { Usage } from "../types.js";

export function registerUsage(program: Command, ctx: Ctx) {
	program
		.command("usage")
		.description("What the workspace has used this billing period against its plan")
		.action(async () => {
			const usage = await ctx.client().get<Usage>("/v1/usage");
			ctx.emit(usage, () =>
				[
					`Plan: ${usage.plan.name} (${usage.mode}). Period from ${when(usage.period_start)}, resets ${when(usage.resets_on)}.`,
					"",
					table(usage.metrics, [
						{ key: "label", label: "Allowance", value: (m) => m.label },
						{ key: "used", label: "Used", value: (m) => m.used },
						{ key: "allowance", label: "Of", value: (m) => m.allowance },
						{ key: "overage", label: "Beyond", value: (m) => (m.overage ? m.overage : "") },
					]),
				].join("\n"),
			);
		});
}
