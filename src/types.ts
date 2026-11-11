/** The slice of the API's objects the CLI reads. Objects may gain fields; nothing here is exhaustive. */

export type Product = {
	object: "product";
	id: string;
	name: string;
	domain: string | null;
	category: string | null;
	auto_draft: boolean;
	auto_approve: boolean;
	auto_publish: boolean;
	created_at: string;
};

export type Post = {
	object: "post";
	id: string;
	product_id: string;
	channel: string;
	status: string;
	hook: string | null;
	body: string | null;
	hashtags: string[];
	cta: string | null;
	destination_url: string | null;
	topic: string | null;
	scheduled_at: string | null;
	published_at: string | null;
	external_url: string | null;
	qa_passed: boolean | null;
	rejection_reason: string | null;
	created_at: string;
	updated_at: string;
};

export type PostRequest = {
	object: "post_request";
	slot_id: string;
	product_id: string;
	topic: string;
	status: "queued";
};

export type Slot = {
	object: "calendar_slot";
	id: string;
	product_id: string;
	channel: string;
	scheduled_at: string;
	topic: string | null;
	status: string;
	post_id: string | null;
};

export type PostApproval = {
	object: "post_approval";
	post: Post;
	publishing: { scheduled: boolean; target: string | null; at: string | null; note: string | null };
};

export type Article = {
	object: "article";
	id: string;
	product_id: string;
	title: string;
	slug: string | null;
	status: string;
	primary_keyword: string | null;
	meta_title: string | null;
	meta_description: string | null;
	external_url: string | null;
	published_at: string | null;
	created_at: string;
	updated_at: string;
};

export type ArticleDetail = Article & { body_md: string | null; faq: Array<Record<string, unknown>> };

export type Newsletter = {
	object: "newsletter";
	id: string;
	product_id: string;
	format: string;
	subject: string | null;
	status: string;
	scheduled_for: string | null;
	published_at: string | null;
	created_at: string;
};

export type GeoRun = {
	object: "geo_run";
	id: string;
	product_id: string;
	question_set: string;
	status: string;
	trigger: string | null;
	total: number;
	completed: number;
	started_at: string | null;
	finished_at: string | null;
	created_at: string;
};

export type GeoRunDetail = GeoRun & {
	summary: { checked: number; failed: number; mentioned: number; recommended: number; cited: number; competitors: Array<{ name: string; count: number }> };
};

export type GeoResult = {
	object: "geo_result";
	id: string;
	run_id: string;
	question: string;
	engine: string | null;
	mentioned: boolean;
	recommended: boolean;
	cited: boolean;
	competitors_mentioned: string[];
	cited_domains: string[];
	error: string | null;
	tested_at: string;
};

export type Touch = { leads: number; deals: number; won: number; won_revenue: number; open_value: number };

export type AttributionRow = {
	key: string;
	label: string;
	pieces: number;
	sessions: number;
	engaged_sessions: number;
	key_events: number;
	revenue: number;
	first_touch: Touch;
	last_touch: Touch;
};

export type AttributionSummary = {
	object: "attribution_summary";
	product_id: string;
	from: string;
	to: string;
	currency: string | null;
	totals: { sessions: number; engaged_sessions: number; key_events: number; revenue: number; first_touch: Touch; last_touch: Touch };
	campaigns: AttributionRow[];
	pillars: AttributionRow[];
	top_pieces: Array<AttributionRow & { entity_type: string; entity_id: string; campaign: string; medium: string }>;
	unmatched: { leads: number; deals: number };
	sources: { tagging: boolean; ga4: boolean; hubspot: boolean; webhook_endpoints: number; leads_stored: number; deals_stored: number };
};

export type Usage = {
	object: "usage";
	plan: { id: string; name: string };
	mode: string;
	period_start: string;
	resets_on: string;
	metrics: Array<{ metric: string; label: string; allowance: number; used: number; overage: number }>;
};
