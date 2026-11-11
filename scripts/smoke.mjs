// Smoke test: the built binary starts, prints its help and exits 0. Run after `npm run build`.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const r = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8", env: { ...process.env, KLEOS_CONFIG_DIR: join(dirname(bin), "..", ".smoke-config") } });
const problems = [];
if (r.status !== 0) problems.push(`exit code ${r.status}: ${r.stderr}`);
for (const word of ["Usage: kleos", "login", "businesses", "posts", "review", "results", "visibility"]) if (!r.stdout.includes(word)) problems.push(`help is missing "${word}"`);
const version = spawnSync(process.execPath, [bin, "--version"], { encoding: "utf8" });
if (!/^\d+\.\d+\.\d+/.test(version.stdout.trim())) problems.push(`--version printed "${version.stdout.trim()}"`);
if (problems.length) {
	console.error("Smoke test failed:\n  " + problems.join("\n  "));
	process.exit(1);
}
console.log(`kleos ${version.stdout.trim()} starts and prints its help.`);
