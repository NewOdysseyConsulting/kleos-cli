/** Runs the real command tree against a stubbed fetch and captures what it sent and printed. */
import { MemoryStore, type Config, type ConfigStore } from "../src/config.js";
import { run, type Deps } from "../src/program.js";

export type Recorded = { method: string; url: string; path: string; query: Record<string, string>; headers: Record<string, string>; body: unknown };

export type Route = {
	method?: string;
	/** A path (exact) or a regular expression matched against the path. */
	path: string | RegExp;
	status?: number;
	body?: unknown;
	/** Builds the body from the request; wins over `body`. */
	reply?: (req: Recorded, nth: number) => unknown;
	text?: string;
};

export type Fixture = {
	routes?: Route[];
	store?: ConfigStore;
	env?: Record<string, string | undefined>;
	promptAnswer?: string;
	isTTY?: boolean;
	now?: Date;
};

export const KEY = "kleos_test_key_123";

export const BUSINESS = {
	object: "product",
	id: "11111111-1111-4111-8111-111111111111",
	name: "Fold Studio",
	domain: "foldstudio.com",
	category: null,
	positioning: null,
	description: null,
	target_markets: ["GB"],
	default_language: "en",
	auto_draft: true,
	auto_approve: false,
	auto_publish: false,
	created_at: "2026-01-01T00:00:00.000Z",
};

export const OTHER = { ...BUSINESS, id: "22222222-2222-4222-8222-222222222222", name: "Second Brand", domain: "second.example", auto_publish: true };

export const list = (data: unknown[], next: string | null = null) => ({ object: "list", data, has_more: next !== null, next_cursor: next });

/** Any request gets this error. */
export const apiError = (status: number, type: string, code: string, message: string): Route => ({
	method: "*",
	path: /.*/,
	status,
	body: { error: { type, code, message, request_id: "req_123" } },
});

export function signedIn(): ConfigStore {
	const config: Config = { api_key: KEY, saved_at: "2026-11-01T00:00:00.000Z" };
	return new MemoryStore(config);
}

export async function cli(argv: string[], fixture: Fixture = {}) {
	const requests: Recorded[] = [];
	const stdout: string[] = [];
	const stderr: string[] = [];
	const counts = new Map<Route, number>();
	const routes = fixture.routes ?? [];

	const fetchStub: typeof fetch = async (input, init) => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
		const headers: Record<string, string> = {};
		for (const [k, v] of Object.entries((init?.headers as Record<string, string>) ?? {})) headers[k.toLowerCase()] = v;
		const req: Recorded = {
			method: init?.method ?? "GET",
			url: url.toString(),
			path: url.pathname,
			query: Object.fromEntries(url.searchParams.entries()),
			headers,
			body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
		};
		requests.push(req);
		const route = routes.find((r) => ((r.method ?? "GET") === "*" || (r.method ?? "GET") === req.method) && (typeof r.path === "string" ? r.path === req.path : r.path.test(req.path)));
		if (!route) return new Response(JSON.stringify({ error: { type: "not_found_error", code: "unstubbed", message: `No stub for ${req.method} ${req.path}`, request_id: "req_x" } }), { status: 404, headers: { "content-type": "application/json" } });
		const nth = counts.get(route) ?? 0;
		counts.set(route, nth + 1);
		const body = route.reply ? route.reply(req, nth) : route.body;
		const text = route.text ?? (body === undefined ? "" : JSON.stringify(body));
		return new Response(text, { status: route.status ?? 200, headers: { "content-type": route.text ? "text/plain" : "application/json" } });
	};

	const deps: Deps = {
		fetch: fetchStub,
		store: fixture.store ?? signedIn(),
		env: fixture.env ?? {},
		out: (l) => stdout.push(l),
		err: (l) => stderr.push(l),
		prompt: async () => fixture.promptAnswer ?? "",
		isTTY: fixture.isTTY ?? true,
		sleep: async () => {},
		now: () => fixture.now ?? new Date("2026-11-11T10:00:00.000Z"),
		version: "0.0.0-test",
	};
	const code = await run(deps, argv);
	const out = stdout.join("\n");
	return { code, stdout: out, stderr: stderr.join("\n"), requests, json: () => JSON.parse(out) as any, store: deps.store };
}
