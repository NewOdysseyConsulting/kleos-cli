import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryStore } from "../src/config.js";
import { apiError, BUSINESS, cli, KEY, list, OTHER } from "./harness.js";

test("login --key checks the key with a read of the businesses and saves it", async () => {
	const store = new MemoryStore();
	const r = await cli(["login", "--key", KEY], { store, routes: [{ path: "/v1/products", body: list([BUSINESS, OTHER]) }] });
	assert.equal(r.code, 0, r.stderr);
	assert.equal(r.requests.length, 1);
	assert.equal(r.requests[0].method, "GET");
	assert.equal(r.requests[0].path, "/v1/products");
	assert.equal(r.requests[0].headers.authorization, `Bearer ${KEY}`);
	assert.match(r.requests[0].headers["user-agent"], /^kleos-cli\/0\.0\.0-test/);
	assert.equal(store.load()?.api_key, KEY);
	assert.equal(store.load()?.api_url, undefined);
	assert.match(r.stdout, /Signed in\. 2 businesses: Fold Studio, Second Brand\./);
});

test("login asks for the key on a terminal and keeps it when the API accepts it", async () => {
	const store = new MemoryStore();
	const r = await cli(["login"], { store, promptAnswer: `  ${KEY}\n`, routes: [{ path: "/v1/products", body: list([BUSINESS]) }] });
	assert.equal(r.code, 0, r.stderr);
	assert.equal(store.load()?.api_key, KEY);
});

test("login without a terminal and without --key explains what to do", async () => {
	const store = new MemoryStore();
	const r = await cli(["login"], { store, isTTY: false });
	assert.equal(r.code, 1);
	assert.equal(r.requests.length, 0);
	assert.match(r.stderr, /--key/);
	assert.equal(store.load(), null);
});

test("login with a bad key passes the API's message through and saves nothing", async () => {
	const store = new MemoryStore();
	const r = await cli(["login", "--key", "kleos_wrong"], { store, routes: [apiError(401, "authentication_error", "invalid_key", "This API key was revoked.")] });
	assert.equal(r.code, 1);
	assert.match(r.stderr, /Error: This API key was revoked\. Run `kleos login`/);
	assert.match(r.stderr, /request req_123/);
	assert.equal(store.load(), null);
});

test("login keeps a non-default API URL from the environment with the key", async () => {
	const store = new MemoryStore();
	const r = await cli(["login", "--key", KEY], { store, env: { KLEOS_API_URL: "http://localhost:3000/" }, routes: [{ path: "/v1/products", body: list([]) }] });
	assert.equal(r.code, 0, r.stderr);
	assert.equal(r.requests[0].url, "http://localhost:3000/v1/products?limit=100");
	assert.equal(store.load()?.api_url, "http://localhost:3000");
});

test("logout removes the saved key", async () => {
	const r = await cli(["logout"]);
	assert.equal(r.code, 0);
	assert.equal(r.store.load(), null);
	assert.match(r.stdout, /Signed out/);
	const again = await cli(["logout"], { store: new MemoryStore() });
	assert.match(again.stdout, /weren't signed in/);
});

test("commands refuse to run without a key, in words and in JSON", async () => {
	const plain = await cli(["businesses"], { store: new MemoryStore() });
	assert.equal(plain.code, 1);
	assert.match(plain.stderr, /Not signed in\. Run `kleos login`/);
	const json = await cli(["--json", "businesses"], { store: new MemoryStore() });
	assert.equal(json.code, 1);
	assert.equal(json.json().error.code, "not_signed_in");
});

test("KLEOS_API_KEY in the environment wins over the saved key", async () => {
	const r = await cli(["businesses"], { env: { KLEOS_API_KEY: "kleos_from_env" }, routes: [{ path: "/v1/products", body: list([BUSINESS]) }] });
	assert.equal(r.code, 0, r.stderr);
	assert.equal(r.requests[0].headers.authorization, "Bearer kleos_from_env");
});
