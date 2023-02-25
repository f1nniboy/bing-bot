import { Message, ThreadChannel, User } from "discord.js";

import { Conversation } from "../conversation/conversation.js";
import { Event } from "../event/event.js";
import { Bot } from "../bot/bot.js";
import { ownerOfThread } from "../conversation/utils/owner.js";

export default class ThreadDeleteEvent extends Event {
	constructor(bot: Bot) {
		super(bot, "threadDelete");
	}

	public async run(thread: ThreadChannel): Promise<void> {
		/* If the thread hasn't been cached yet, fetch it again. */
		if (thread.partial) await thread.fetch();

		/* Fetch the original owner of the thread from the starter message. */
		const owner: User | null = await ownerOfThread(thread);
		if (owner === null) return;

		/* Create or fetch the owner's active conversation. */
		const conversation: Conversation | null = await this.bot.conversation.create(owner);

		try {
			/* If the conversation isn't active yet, initialize it from the cached conversation and this thread. */
			if (!conversation.active) {
				/* Get the assigned conversation using the thread, if available. */
				const { data } = await this.bot.db.client
					.from("conversations")
					.select("*")
					
					.eq("channel", thread.id)
					.single();

				if (data === null) return;

				/* Delete the cached conversation for later use. */
				await this.bot.db.client
					.from("conversations")
					.delete()

					.eq("channel", thread.id);

			} else {
				/* Simply reset the user's conversation without any notice. */
				await conversation.reset(true);
			}

		} catch (_) {}
	}
}