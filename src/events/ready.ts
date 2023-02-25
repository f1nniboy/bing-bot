import { chooseStatusMessage } from "../util/status.js";
import { Event } from "../event/event.js";
import { Bot } from "../bot/bot.js";

export default class ReadyEvent extends Event {
	constructor(bot: Bot) {
		super(bot, "ready");
	}

	public async run(): Promise<void> {
		/* Set a random status every 1.5 minutes, and now. */
		setInterval(() => chooseStatusMessage(this.bot), 1.5 * 60 * 1000);
		chooseStatusMessage(this.bot);
	}
}