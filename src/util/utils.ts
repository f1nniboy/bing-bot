import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { Bot } from "../bot/bot.js";

export abstract class Utils {
	/* Search for files with the specified extensions. */
	public static async search(path: string, extension: string, files: string[] = []): Promise<string[]> {
		const directory: string[] = await fs.promises.readdir(path);

		for(const i in directory) {
			const file: string = directory[i];

			if ((await fs.promises.stat(`${path}/${file}`)).isDirectory()) {
				files = await this.search(`${path}/${file}`, extension, files);

			} else {
				const __filename = fileURLToPath(import.meta.url);
				const __dirname = dirname(__filename);

				files.push(join(__dirname, "..", "..", path, "/", file));
			}
		}

		return files;
	}

	/* Get a random element from an array. */
	public static random<T>(array: T[]): T {
		return array[Math.floor(Math.random() * array.length)];
	}

	/* Shuffle the items of an array. */
	public static shuffle<T>(array: T[]): T[] {
		return array
			.map(value => ({ value, sort: Math.random() }))
			.sort((a, b) => a.sort - b.sort)
			.map(({ value }) => value);
	}

	/* Truncate a string. */
	public static truncate(text: string, length: number): string {
		const suffix: string = "...";
		return (text.length > length) ? text.slice(0, length - suffix.length) + suffix : text;
	}

	/**
	 * Get the suffix for a specific number.
	 * @param num Number to get the suffix for
	 * 
	 * @returns The suffix for the number
	 */
	public static ordinalForNumber(num: number): "st" | "rd" | "th" | "nd" {
		const arr: string[] = ["th", "st", "nd", "rd"];
		const v: number = num % 100;

		return (arr[(v - 20) % 10] || arr[v] || arr[0]) as any;
	}

	/* Clean up the content of a bot invocation message. */
	public static cleanContent(bot: Bot, content: string): string {
		return content
			/* Replace the bot mention in general, if it doesn't have a nickname or was
			   invoked in DMs. */
			.replaceAll(`<@${bot.client.user!.id}>`, "")

			/* Remove any leading & trailing spaces. */
			.trim();
	}

	/* Generate an invite link for the Discord bot. */
	public static inviteLink(bot: Bot): string {
		return `https://discord.com/api/oauth2/authorize?client_id=${bot.app.config.discord.id}&permissions=328565377088&scope=bot`;
	}
}