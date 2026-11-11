/**
 * The escape hatch: any call in the API, with the saved key, for the endpoints that don't have a command of their
 * own (campaigns, growth suggestions, webhooks, knowledge sources, automations, newsletters).
 */
import type { Command } from "commander";
import { CliError } from "../errors.js";
import { idempotencyKey } from "./posts.js";
import type { Ctx } from "../program.js";

const METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

export function registerApi(program: Command, ctx: Ctx) {
	program
		.command("api <method> <path>")
		.description("Call any endpoint directly, for example: kleos api GET /v1/webhooks (always prints JSON)")
		.option("-d, --data <json>", "A JSON body for POST and PATCH")
		.option("-q, --query <key=value...>", "Query parameters")
		.addHelpText("after", "\nEvery endpoint is listed at https://app.getkleos.ai/v1/openapi.json. Each run sends a fresh Idempotency-Key on POST, so running the same POST twice does the work twice.")
		.action(async (methodArg: string, path: string, opts: { data?: string; query?: string[] }) => {
			const method = methodArg.toUpperCase() as Method;
			if (!METHODS.includes(method)) throw new CliError(`Method must be one of ${METHODS.join(", ")}.`, "bad_method");
			if (!path.startsWith("/")) throw new CliError("The path starts with /, for example /v1/webhooks.", "bad_path");
			let body: unknown;
			if (opts.data !== undefined) {
				try {
					body = JSON.parse(opts.data);
				} catch {
					throw new CliError("--data must be valid JSON.", "bad_json");
				}
			}
			const query: Record<string, string> = {};
			for (const pair of opts.query ?? []) {
				const i = pair.indexOf("=");
				if (i < 1) throw new CliError(`Query parameters look like key=value, not "${pair}".`, "bad_query");
				query[pair.slice(0, i)] = pair.slice(i + 1);
			}
			const result = await ctx.client().request<unknown>(method, path, { query, body, ...(method === "POST" ? { idempotencyKey: idempotencyKey() } : {}) });
			ctx.deps.out(JSON.stringify(result ?? null, null, 2));
		});
}
