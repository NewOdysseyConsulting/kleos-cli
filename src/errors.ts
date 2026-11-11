/** An error the CLI raises itself (bad flag, no key, no such business). API errors are KleosApiError in ./api. */
export class CliError extends Error {
	readonly code: string;
	constructor(message: string, code = "cli_error") {
		super(message);
		this.name = "CliError";
		this.code = code;
	}
	toJSON() {
		return { type: "cli_error", code: this.code, message: this.message };
	}
}
