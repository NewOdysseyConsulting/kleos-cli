import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { KleosApiError, KleosClient } from "../src/api.js";
import { configDir, credentials, FileStore, MemoryStore } from "../src/config.js";
import { parseTime, statusLabel, table, truncate, when } from "../src/output.js";

test("configDir follows each OS's convention and KLEOS_CONFIG_DIR overrides it", () => {
	assert.equal(configDir({ HOME: "/home/a" }, "linux"), "/home/a/.config/kleos");
	assert.equal(configDir({ HOME: "/home/a", XDG_CONFIG_HOME: "/xdg" }, "linux"), "/xdg/kleos");
	assert.equal(configDir({ HOME: "/Users/a" }, "darwin"), "/Users/a/Library/Application Support/kleos");
	assert.equal(configDir({ APPDATA: "C:\\Users\\a\\AppData\\Roaming", HOME: "C:\\Users\\a" }, "win32").endsWith(join("Roaming", "kleos")), true);
	assert.equal(configDir({ KLEOS_CONFIG_DIR: "/elsewhere", HOME: "/home/a" }, "linux"), "/elsewhere");
});

test("FileStore keeps the key in a file only the owner can read", () => {
	const dir = mkdtempSync(join(tmpdir(), "kleos-cli-"));
	try {
		const store = new FileStore(join(dir, "nested"));
		assert.equal(store.load(), null);
		store.save({ api_key: "kleos_abc", saved_at: "2026-11-11T00:00:00.000Z" });
		assert.equal(store.load()?.api_key, "kleos_abc");
		if (process.platform !== "win32") {
			assert.equal(statSync(store.path).mode & 0o777, 0o600);
			assert.equal(statSync(join(dir, "nested")).mode & 0o777, 0o700);
		}
		assert.match(readFileSync(store.path, "utf8"), /"api_key": "kleos_abc"/);
		assert.equal(store.clear(), true);
		assert.equal(store.clear(), false);
		assert.equal(store.load(), null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("credentials prefer the environment and fall back to the file", () => {
	const store = new MemoryStore({ api_key: "kleos_file", api_url: "http://saved", saved_at: "" });
	assert.deepEqual(credentials({}, store), { key: "kleos_file", apiUrl: "http://saved", source: "file" });
	assert.deepEqual(credentials({ KLEOS_API_KEY: "kleos_env" }, store), { key: "kleos_env", apiUrl: "https://app.getkleos.ai", source: "env" });
	assert.deepEqual(credentials({ KLEOS_API_URL: "http://override/" }, store), { key: "kleos_file", apiUrl: "http://override", source: "file" });
	assert.equal(credentials({}, new MemoryStore()), null);
});

test("KleosClient builds URLs without empty query values and sends the headers the API expects", async () => {
	const seen: Array<{ url: string; init: RequestInit }> = [];
	const client = new KleosClient({
		apiUrl: "https://app.getkleos.ai/",
		key: "kleos_k",
		userAgent: "kleos-cli/test",
		fetch: (async (url: string, init: RequestInit) => {
			seen.push({ url, init });
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}) as unknown as typeof fetch,
	});
	assert.equal(client.url("/v1/posts", { product_id: "p", status: undefined, limit: 0, cursor: null, channel: "" }), "https://app.getkleos.ai/v1/posts?product_id=p&limit=0");
	await client.request("POST", "/v1/posts", { body: { topic: "t" }, idempotencyKey: "k1" });
	const h = seen[0].init.headers as Record<string, string>;
	assert.equal(h.authorization, "Bearer kleos_k");
	assert.equal(h["content-type"], "application/json");
	assert.equal(h["idempotency-key"], "k1");
	assert.equal(h["user-agent"], "kleos-cli/test");
	assert.equal(seen[0].init.body, '{"topic":"t"}');
	await client.get("/v1/usage");
	assert.equal((seen[1].init.headers as Record<string, string>)["content-type"], undefined);
	assert.equal(seen[1].init.body, undefined);
});

test("KleosClient turns the API's error body into a KleosApiError with its fields", async () => {
	const client = new KleosClient({
		apiUrl: "https://app.getkleos.ai",
		key: "k",
		userAgent: "t",
		fetch: (async () => new Response(JSON.stringify({ error: { type: "permission_error", code: "read_only_key", message: "A read key can't do that.", request_id: "req_9" } }), { status: 403 })) as unknown as typeof fetch,
	});
	await assert.rejects(client.get("/v1/usage"), (e: unknown) => {
		assert.ok(e instanceof KleosApiError);
		assert.equal(e.message, "A read key can't do that.");
		assert.equal(e.status, 403);
		assert.equal(e.code, "read_only_key");
		assert.equal(e.requestId, "req_9");
		return true;
	});
	const down = new KleosClient({ apiUrl: "https://app.getkleos.ai", key: "k", userAgent: "t", fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
	await assert.rejects(down.get("/v1/usage"), /Couldn't reach app\.getkleos\.ai: fetch failed/);
});

test("listAll follows next_cursor and stops at max", async () => {
	const calls: string[] = [];
	const client = new KleosClient({
		apiUrl: "https://app.getkleos.ai",
		key: "k",
		userAgent: "t",
		fetch: (async (url: string) => {
			calls.push(url);
			const cursor = new URL(url).searchParams.get("cursor");
			const page = cursor === "b" ? { data: [3], has_more: false, next_cursor: null } : cursor === "a" ? { data: [2], has_more: true, next_cursor: "b" } : { data: [1], has_more: true, next_cursor: "a" };
			return new Response(JSON.stringify({ object: "list", ...page }));
		}) as unknown as typeof fetch,
	});
	assert.deepEqual(await client.listAll("/v1/posts", { status: "x" }), [1, 2, 3]);
	assert.equal(calls.length, 3);
	assert.match(calls[1], /cursor=a/);
	assert.deepEqual(await client.listAll("/v1/posts", {}, 2), [1, 2]);
});

test("output helpers", () => {
	assert.equal(truncate("abcdef", 4), "abc…");
	assert.equal(truncate("abc", 4), "abc");
	assert.equal(when(null), "");
	assert.match(when("2026-11-11T10:05:00.000Z"), /^2026-11-1\d \d\d:05$/);
	assert.equal(statusLabel("pending_approval"), "waiting for review");
	assert.equal(statusLabel("publish_failed"), "failed to publish");
	assert.equal(statusLabel("scheduled"), "scheduled");
	assert.equal(table([], [{ key: "a", label: "A", value: () => 1 }]), "");
	assert.equal(table([{ a: 1, b: "x y" }], [{ key: "a", label: "A", value: (r) => r.a }, { key: "b", label: "Long label", value: (r) => r.b }]), "A  LONG LABEL\n1  x y");
	assert.equal(parseTime("2026-11-20T09:30:00Z"), "2026-11-20T09:30:00.000Z");
	assert.equal(new Date(parseTime("2026-11-20 09:30")).getHours(), 9);
	assert.equal(new Date(parseTime("2026-11-20")).getHours(), 9);
	assert.throws(() => parseTime("next tuesday"), /isn't a time I understand/);
});
