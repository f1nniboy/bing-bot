import { Event } from "../event/event.js";
import { Bot } from "../bot/bot.js";

import { Interaction, ChatInputCommandInteraction, MessageContextMenuCommandInteraction, ButtonInteraction } from "discord.js";

export default class InteractionCreateEvent extends Event {
	constructor(bot: Bot) {
		super(bot, "interactionCreate");
	}

	public async run(interaction: Interaction): Promise<void> {
		if (interaction.isChatInputCommand()) {
			await this.bot.command.handleCommand(interaction as ChatInputCommandInteraction);

		} else if (interaction.isMessageContextMenuCommand()) {
			await this.bot.command.handleCommand(interaction as MessageContextMenuCommandInteraction);

		} else if (interaction.isButton()) {
			await this.bot.conversation.generator.handleButtonInteraction(interaction as ButtonInteraction)
				.catch(() => {});
		}
	}
}