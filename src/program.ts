/**
 * The command tree. Everything the commands need from the outside world (fetch, the config store, the terminal,
 * the clock) comes in through Deps, so the tests run the real commands against a stubbed fetch.
 *
 * Rules, same as the MCP server: nothing here publishes on its own. Asking for a draft queues a draft that waits for
 * review; `approve` and `record` are explicit commands, and after approval the business's own Autopilot settings
 * decide whether Kleos schedules it. The CLI adds no gate, confirmation or rule the API doesn't have, and the API's
 * own error messages are shown as they are.
 */
import { Command, CommanderError } from "commander";
import { KleosApiError, KleosClient } from "./api.js";
import { credentials, DEFAULT_API_URL, type ConfigStore, type Env } from "./config.js";
import { CliError } from "./errors.js";
import { registerApi } from "./commands/api.js";
import { registerArticles } from "./commands/articles.js";
import { registerBusinesses } from "./commands/businesses.js";
import { registerLogin } from "./commands/login.js";
import { registerPosts } from "./commands/posts.js";
import { registerResults } from "./commands/results.js";
import { registerReview } from "./commands/review.js";
import { registerUsage } from "./commands/usage.js";
import { registerVisibility } from "./commands/visibility.js";

export type Deps = {
	fetch: typeof fetch;
	store: ConfigStore;
	env: Env;
	/** A line to stdout. */
	out: (line: string) => void;
	/** A line to stderr. */
	err: (line: string) => void;
	/** Asks the person a question on the terminal; hidden keeps what they type off the screen. */
	prompt: (question: string, options: { hidden: boolean }) => Promise<string>;
	isTTY: boolean;
	sleep: (ms: number) => Promise<void>;
	now: () => Date;
	version: string;
};

export type Ctx = {
	deps: Deps;
	json: () => boolean;
	/** A client for the saved key (or KLEOS_API_KEY). Throws when there is none. */
	client: () => KleosClient;
	/** Prints `data` as JSON under --json, otherwise the text `human` builds. */
	emit: (data: unknown, human: () => string) => void;
	userAgent: string;
};

export const DOCS_URL = "https://getkleos.ai/agents";
export const API_KEYS_URL = "https://app.getkleos.ai/settings/api";

export function buildProgram(deps: Deps): Command {
	const program = new Command("kleos");
	program
		.description("Kleos from the terminal. Lists your businesses, asks for drafts, shows what's waiting for review, approves posts, records what went live, and reads results and AI visibility.")
		.version(deps.version, "-v, --version", "Print the version")
		.option("--json", "Machine-readable output: one JSON document on stdout, errors as JSON too")
		.addHelpText("after", `\nSign in once with \`kleos login\` (keys: ${API_KEYS_URL}). Docs: ${DOCS_URL}`)
		.exitOverride()
		.configureOutput({ writeOut: (s) => deps.out(s.replace(/\n$/, "")), writeErr: (s) => deps.err(s.replace(/\n$/, "")) })
		.showHelpAfterError("(add --help for usage)");

	const userAgent = `kleos-cli/${deps.version} node/${process.versions.node}`;
	const ctx: Ctx = {
		deps,
		userAgent,
		json: () => Boolean(program.opts().json),
		client: () => {
			const creds = credentials(deps.env, deps.store);
			if (!creds) throw new CliError(`Not signed in. Run \`kleos login\` with an API key from ${API_KEYS_URL}, or set KLEOS_API_KEY.`, "not_signed_in");
			return new KleosClient({ apiUrl: creds.apiUrl, key: creds.key, fetch: deps.fetch, userAgent });
		},
		emit: (data, human) => deps.out(ctx.json() ? JSON.stringify(data, null, 2) : human()),
	};

	registerLogin(program, ctx);
	registerBusinesses(program, ctx);
	registerPosts(program, ctx);
	registerArticles(program, ctx);
	registerReview(program, ctx);
	registerResults(program, ctx);
	registerVisibility(program, ctx);
	registerUsage(program, ctx);
	registerApi(program, ctx);
	return program;
}

/** Runs the CLI for an argv (without node and the script) and returns the exit code. Never calls process.exit. */
export async function run(deps: Deps, argv: string[]): Promise<number> {
	const program = buildProgram(deps);
	try {
		await program.parseAsync(argv, { from: "user" });
		return 0;
	} catch (e) {
		if (e instanceof CommanderError) {
			// Help and --version exit 0 through here; usage errors have already been printed by commander.
			return e.exitCode;
		}
		const json = Boolean(program.opts().json);
		if (e instanceof KleosApiError) {
			const hint = e.status === 401 ? ` Run \`kleos login\` with a current key from ${API_KEYS_URL}.` : e.status === 429 ? " Each key gets 60 requests a minute; try again shortly." : "";
			if (json) deps.out(JSON.stringify({ error: e.toJSON() }, null, 2));
			else deps.err(`Error: ${e.message}${hint}${e.requestId ? ` (request ${e.requestId})` : ""}`);
			return 1;
		}
		if (e instanceof CliError) {
			if (json) deps.out(JSON.stringify({ error: e.toJSON() }, null, 2));
			else deps.err(`Error: ${e.message}`);
			return 1;
		}
		const message = e instanceof Error ? e.message : String(e);
		if (json) deps.out(JSON.stringify({ error: { type: "cli_error", code: "unexpected", message } }, null, 2));
		else deps.err(`Error: ${message}`);
		return 1;
	}
}

export { DEFAULT_API_URL };
