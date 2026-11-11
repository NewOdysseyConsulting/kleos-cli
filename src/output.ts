/** Plain-text output helpers: aligned tables, short times, trimmed text. No colour, no dependencies. */

export type Column<T> = { key: string; label: string; value: (row: T) => unknown; width?: number };

const WIDTH = 120;

export function table<T>(rows: T[], columns: Column<T>[]): string {
	if (!rows.length) return "";
	const cells = rows.map((r) => columns.map((c) => cell(c.value(r), c.width)));
	const widths = columns.map((c, i) => Math.max(c.label.length, ...cells.map((line) => line[i].length)));
	const line = (parts: string[]) => parts.map((p, i) => (i === parts.length - 1 ? p : p.padEnd(widths[i]))).join("  ").trimEnd();
	return [line(columns.map((c) => c.label.toUpperCase())), ...cells.map(line)].join("\n");
}

function cell(v: unknown, width?: number): string {
	const s = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
	return truncate(s.replace(/\s+/g, " ").trim(), width ?? WIDTH);
}

export function truncate(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

/** 2026-11-11T09:30:00.000Z → "2026-11-11 09:30" in the local time zone. */
export function when(iso: string | null | undefined): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;

/** Status words as the app shows them. */
export function statusLabel(status: string): string {
	const map: Record<string, string> = {
		pending_approval: "waiting for review",
		validation_failed: "needs a fix",
		needs_revision: "changes requested",
		publish_failed: "failed to publish",
	};
	return map[status] ?? status.replace(/_/g, " ");
}

export function money(amount: number, currency: string | null): string {
	if (!currency) return amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
	try {
		return amount.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
	} catch {
		return `${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
	}
}

/** Parses the times people type for --at: ISO 8601, or "YYYY-MM-DD HH:MM" in the local time zone. */
export function parseTime(input: string): string {
	const s = input.trim();
	const local = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(s);
	const d = local ? new Date(+local[1], +local[2] - 1, +local[3], local[4] ? +local[4] : 9, local[5] ? +local[5] : 0) : new Date(s);
	if (Number.isNaN(d.getTime())) throw new Error(`"${input}" isn't a time I understand. Use 2026-11-20 09:30 or an ISO 8601 time like 2026-11-20T09:30:00Z.`);
	return d.toISOString();
}
