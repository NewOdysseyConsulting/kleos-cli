/** Asks a question on the terminal. With hidden, what the person types never reaches the screen (for API keys). */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

export function ask(question: string, options: { hidden: boolean }): Promise<string> {
	return new Promise((resolve, reject) => {
		let muted = false;
		const output = new Writable({
			write(chunk, _encoding, callback) {
				if (!muted) process.stderr.write(chunk);
				callback();
			},
		});
		const rl = createInterface({ input: process.stdin, output, terminal: true });
		rl.question(question, (answer) => {
			if (muted) process.stderr.write("\n");
			rl.close();
			resolve(answer);
		});
		muted = options.hidden;
		rl.on("SIGINT", () => {
			rl.close();
			reject(new Error("Cancelled."));
		});
	});
}
