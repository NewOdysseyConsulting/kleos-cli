/**
 * `--business <id|name>`: an id is fetched directly; a name is matched against the workspace's businesses (exact,
 * case-insensitive, on the name or the domain). With one business in the workspace the flag can be left out.
 */
import type { KleosClient } from "./api.js";
import { CliError } from "./errors.js";
import type { Product } from "./types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s: string) => UUID.test(s);

export async function listBusinesses(client: KleosClient): Promise<Product[]> {
	return client.listAll<Product>("/v1/products");
}

const names = (all: Product[]) => all.map((b) => `${b.name} (${b.id})`).join(", ");

export async function resolveBusiness(client: KleosClient, given: string | undefined): Promise<Product> {
	if (given && isUuid(given)) return client.get<Product>(`/v1/products/${given}`);
	const all = await listBusinesses(client);
	if (!all.length) throw new CliError("This workspace has no business yet. Add one in Kleos first.", "no_business");
	if (!given) {
		if (all.length === 1) return all[0];
		throw new CliError(`Which business? Add --business <id|name>. Yours: ${names(all)}.`, "business_required");
	}
	const wanted = given.trim().toLowerCase();
	const matches = all.filter((b) => b.name.trim().toLowerCase() === wanted || (b.domain ?? "").toLowerCase() === wanted);
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) throw new CliError(`More than one business is called "${given}". Use its id instead: ${names(matches)}.`, "business_ambiguous");
	throw new CliError(`No business called "${given}". Yours: ${names(all)}.`, "business_not_found");
}
