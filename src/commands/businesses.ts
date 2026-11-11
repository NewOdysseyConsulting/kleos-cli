import type { Command } from "commander";
import { listBusinesses } from "../business.js";
import { table } from "../output.js";
import type { Ctx } from "../program.js";
import type { Product } from "../types.js";

export function autopilot(b: Product): string {
	const on = [b.auto_draft && "drafts", b.auto_approve && "approves", b.auto_publish && "publishes"].filter(Boolean);
	return on.length ? on.join(", ") : "off";
}

export function registerBusinesses(program: Command, ctx: Ctx) {
	program
		.command("businesses")
		.description("List the businesses in the workspace (use the id or the exact name with --business)")
		.action(async () => {
			const businesses = await listBusinesses(ctx.client());
			ctx.emit({ object: "list", data: businesses }, () =>
				businesses.length
					? table(businesses, [
							{ key: "id", label: "Id", value: (b) => b.id },
							{ key: "name", label: "Name", value: (b) => b.name },
							{ key: "domain", label: "Website", value: (b) => b.domain },
							{ key: "autopilot", label: "Autopilot", value: autopilot },
						])
					: "No businesses yet. Add one in Kleos.",
			);
		});
}
