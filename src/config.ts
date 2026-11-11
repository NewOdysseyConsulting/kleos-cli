/**
 * Where the API key lives: a JSON file in the OS config directory, readable by the owner only. Never in the
 * working directory, never in the repository. KLEOS_CONFIG_DIR moves it (CI, tests); KLEOS_API_KEY in the
 * environment wins over the file.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Env = Record<string, string | undefined>;

export type Config = {
	api_key: string;
	/** Set when the key was validated against a different server than app.getkleos.ai. */
	api_url?: string;
	saved_at: string;
};

export const DEFAULT_API_URL = "https://app.getkleos.ai";

/** The OS convention for per-user configuration: XDG on Linux, Application Support on macOS, APPDATA on Windows. */
export function configDir(env: Env = process.env, platform: NodeJS.Platform = process.platform): string {
	if (env.KLEOS_CONFIG_DIR) return env.KLEOS_CONFIG_DIR;
	const home = env.HOME || env.USERPROFILE || homedir();
	if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "kleos");
	if (platform === "darwin") return join(home, "Library", "Application Support", "kleos");
	return join(env.XDG_CONFIG_HOME || join(home, ".config"), "kleos");
}

export interface ConfigStore {
	readonly path: string;
	load(): Config | null;
	save(config: Config): void;
	clear(): boolean;
}

export class FileStore implements ConfigStore {
	readonly path: string;
	constructor(dir: string) {
		this.path = join(dir, "config.json");
	}
	load(): Config | null {
		if (!existsSync(this.path)) return null;
		try {
			const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<Config>;
			if (typeof parsed.api_key !== "string" || !parsed.api_key) return null;
			return { api_key: parsed.api_key, api_url: parsed.api_url, saved_at: parsed.saved_at ?? "" };
		} catch {
			return null;
		}
	}
	save(config: Config): void {
		const dir = join(this.path, "..");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		writeFileSync(this.path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
		// The mode on writeFileSync only applies to a new file; an existing one keeps its bits.
		try {
			chmodSync(this.path, 0o600);
		} catch {
			/* Windows has no POSIX bits; the directory is already the user's own. */
		}
	}
	clear(): boolean {
		if (!existsSync(this.path)) return false;
		rmSync(this.path);
		return true;
	}
}

/** An in-memory store for tests. */
export class MemoryStore implements ConfigStore {
	readonly path = "<memory>";
	private config: Config | null = null;
	constructor(initial: Config | null = null) {
		this.config = initial;
	}
	load() {
		return this.config;
	}
	save(config: Config) {
		this.config = config;
	}
	clear() {
		const had = this.config !== null;
		this.config = null;
		return had;
	}
}

export type Credentials = { key: string; apiUrl: string; source: "env" | "file" };

/** The key to use: the environment first, then the saved file. Null when neither has one. */
export function credentials(env: Env, store: ConfigStore): Credentials | null {
	const apiUrlFromEnv = env.KLEOS_API_URL?.replace(/\/+$/, "");
	if (env.KLEOS_API_KEY) return { key: env.KLEOS_API_KEY, apiUrl: apiUrlFromEnv || DEFAULT_API_URL, source: "env" };
	const saved = store.load();
	if (!saved) return null;
	return { key: saved.api_key, apiUrl: apiUrlFromEnv || saved.api_url || DEFAULT_API_URL, source: "file" };
}
