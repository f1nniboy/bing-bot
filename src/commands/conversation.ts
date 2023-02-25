import { SlashCommandBuilder } from "discord.js";

import { Command, CommandInteraction, CommandResponse } from "../command/command.js";
import { Response, ResponseType } from "../command/response.js";
import { handleError } from "../util/moderation/error.js";

import { Bot } from "../bot/bot.js";

export default class ConversationCommand extends Command {
    constructor(bot: Bot) {
        super(bot,
            new SlashCommandBuilder()
                .setName("conversation")
                .setDescription("Start a conversation with Bing"),
        {
            cooldown: 60 * 1000,
			long: true
        });
    }

    public async run(interaction: CommandInteraction): CommandResponse {
		try {
			/* Try to create a thread using the interaction, and wait for the response. */
			const response: Response = await this.bot.conversation.generator.create(interaction);
			return response;

		} catch (error) {
			await handleError(this.bot, {
				title: "Failed to create the conversation",
				message: await interaction.fetchReply(),
				error: error as Error,
				reply: false
			});

			return new Response(ResponseType.Edit)
				.addEmbed(builder =>
					builder.setTitle("Failed to create your conversation ⚠️")
						.setDescription(`*The developers have been notified.*`)
						.setColor("Red")
				);
		}
    }
}