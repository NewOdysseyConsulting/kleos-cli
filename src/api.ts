/**
 * A thin client for the Kleos public API (https://app.getkleos.ai/v1/openapi.json). It builds requests, passes the
 * API's own error messages through unchanged, and walks cursor pagination. No retries: the API is idempotent where it
 * matters (Idempotency-Key on the writes) and the person is right there to run the command again.
 */

export type Query = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = {
	query?: Query;
	body?: unknown;
	idempotencyKey?: string;
};

export type ApiErrorBody = {
	error: { type: string; code: string; message: string; request_id: string };
};

export class KleosApiError extends Error {
	readonly status: number;
	readonly type: string;
	readonly code: string;
	readonly requestId: string | null;
	constructor(status: number, error: ApiErrorBody["error"] | null, fallback: string) {
		super(error?.message || fallback);
		this.name = "KleosApiError";
		this.status = status;
		this.type = error?.type ?? "api_error";
		this.code = error?.code ?? `http_${status}`;
		this.requestId = error?.request_id ?? null;
	}
	toJSON() {
		return { type: this.type, code: this.code, message: this.message, request_id: this.requestId, status: this.status };
	}
}

export type Page<T> = { object: "list"; data: T[]; has_more: boolean; next_cursor: string | null };

export type ClientOptions = {
	apiUrl: string;
	key: string;
	fetch: typeof fetch;
	userAgent: string;
};

const isErrorBody = (x: unknown): x is ApiErrorBody =>
	typeof x === "object" && x !== null && typeof (x as ApiErrorBody).error === "object" && typeof (x as ApiErrorBody).error?.message === "string";

export class KleosClient {
	private readonly apiUrl: string;
	private readonly key: string;
	private readonly fetchImpl: typeof fetch;
	private readonly userAgent: string;

	constructor(options: ClientOptions) {
		this.apiUrl = options.apiUrl.replace(/\/+$/, "");
		this.key = options.key;
		this.fetchImpl = options.fetch;
		this.userAgent = options.userAgent;
	}

	/** The full URL for a path and query, with empty query values left out. */
	url(path: string, query?: Query): string {
		const url = new URL(this.apiUrl + path);
		for (const [k, v] of Object.entries(query ?? {})) {
			if (v === undefined || v === null || v === "") continue;
			url.searchParams.set(k, String(v));
		}
		return url.toString();
	}

	async request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, options: RequestOptions = {}): Promise<T> {
		const headers: Record<string, string> = {
			authorization: `Bearer ${this.key}`,
			accept: "application/json",
			"user-agent": this.userAgent,
		};
		let body: string | undefined;
		if (options.body !== undefined) {
			headers["content-type"] = "application/json";
			body = JSON.stringify(options.body);
		}
		if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

		let response: Response;
		try {
			response = await this.fetchImpl(this.url(path, options.query), { method, headers, body });
		} catch (e) {
			const cause = e instanceof Error ? e.message : String(e);
			throw new KleosApiError(0, null, `Couldn't reach ${new URL(this.apiUrl).host}: ${cause}`);
		}

		const text = await response.text();
		let parsed: unknown = null;
		if (text) {
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = null;
			}
		}
		if (!response.ok) {
			const fallback = `Kleos answered ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${parsed === null && text ? `: ${text.slice(0, 200)}` : ""}`;
			throw new KleosApiError(response.status, isErrorBody(parsed) ? parsed.error : null, fallback);
		}
		return parsed as T;
	}

	get<T>(path: string, query?: Query) {
		return this.request<T>("GET", path, { query });
	}

	/** Every page of a list, up to `max` items. */
	async listAll<T>(path: string, query: Query = {}, max = 1000): Promise<T[]> {
		const items: T[] = [];
		let cursor: string | null = null;
		do {
			const page: Page<T> = await this.get<Page<T>>(path, { ...query, limit: Math.min(100, max - items.length), cursor });
			items.push(...page.data);
			cursor = page.has_more ? page.next_cursor : null;
		} while (cursor && items.length < max);
		return items;
	}
}
