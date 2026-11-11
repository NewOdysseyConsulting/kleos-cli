import type { Command } from "commander";
import { KleosClient } from "../api.js";
import { listBusinesses } from "../business.js";
import { DEFAULT_API_URL } from "../config.js";
import { CliError } from "../errors.js";
import { plural } from "../output.js";
import { API_KEYS_URL, type Ctx } from "../program.js";

export function registerLogin(program: Command, ctx: Ctx) {
	program
		.command("login")
		.description("Save a Kleos API key on this computer (asks for it, or takes --key)")
		.option("--key <key>", "The API key (kleos_…) from Settings → API in Kleos; otherwise you are asked for it")
		.addHelpText("after", `\nKeys are created at ${API_KEYS_URL} (admins and owners). The key is checked with a read of your businesses and kept in your user config folder, never in the current directory.`)
		.action(async (opts: { key?: string }) => {
			const { deps } = ctx;
			let key = opts.key?.trim();
			if (!key) {
				if (!deps.isTTY) throw new CliError("Pass the key with --key, or run `kleos login` in a terminal to be asked for it.", "key_required");
				key = (await deps.prompt(`Paste your Kleos API key (from ${API_KEYS_URL}): `, { hidden: true })).trim();
			}
			if (!key) throw new CliError("No key given.", "key_required");
			const apiUrl = (deps.env.KLEOS_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
			// There is no GET /me in the API, so the cheapest authenticated read is the business list.
			const client = new KleosClient({ apiUrl, key, fetch: deps.fetch, userAgent: ctx.userAgent });
			const businesses = await listBusinesses(client);
			deps.store.save({ api_key: key, ...(apiUrl !== DEFAULT_API_URL ? { api_url: apiUrl } : {}), saved_at: deps.now().toISOString() });
			ctx.emit(
				{ ok: true, config_path: deps.store.path, api_url: apiUrl, businesses: businesses.map((b) => ({ id: b.id, name: b.name })) },
				() =>
					`Signed in. ${plural(businesses.length, "business", "businesses")}${businesses.length ? `: ${businesses.map((b) => b.name).join(", ")}` : ""}.\n` +
					`Key saved to ${deps.store.path}. Run \`kleos logout\` to remove it.`,
			);
		});

	program
		.command("logout")
		.description("Remove the saved API key from this computer")
		.action(async () => {
			const removed = ctx.deps.store.clear();
			ctx.emit({ ok: true, removed, config_path: ctx.deps.store.path }, () => (removed ? `Signed out. Removed ${ctx.deps.store.path}.` : "You weren't signed in on this computer."));
		});
}
