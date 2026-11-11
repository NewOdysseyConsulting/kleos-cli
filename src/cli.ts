#!/usr/bin/env node
/** The `kleos` binary: wires the real world into ./program and exits with its code. */
import { createRequire } from "node:module";
import { configDir, FileStore } from "./config.js";
import { run } from "./program.js";
import { ask } from "./prompt.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const code = await run(
	{
		fetch: globalThis.fetch,
		store: new FileStore(configDir()),
		env: process.env,
		out: (line) => process.stdout.write(line + "\n"),
		err: (line) => process.stderr.write(line + "\n"),
		prompt: ask,
		isTTY: Boolean(process.stdin.isTTY),
		sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
		now: () => new Date(),
		version,
	},
	process.argv.slice(2),
);
process.exitCode = code;
