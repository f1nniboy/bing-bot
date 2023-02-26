import { ChannelType, SlashCommandBuilder, ThreadChannel, User } from "discord.js";

import { Command, CommandInteraction, CommandResponse } from "../command/command.js";
import { Response, ResponseType } from "../command/response.js";
import { ownerOfThread } from "../conversation/utils/owner.js";
import { Conversation } from "../conversation/conversation.js";
import { handleError } from "../util/moderation/error.js";

import { Bot } from "../bot/bot.js";

export default class ResetCommand extends Command {
    constructor(bot: Bot) {
        super(bot,
            new SlashCommandBuilder()
                .setName("reset")
                .setDescription("Reset your conversation with Bing")
		);
    }

    public async run(interaction: CommandInteraction): CommandResponse {
		/* Get the user's conversation. */
		const conversation: Conversation | null = this.bot.conversation.get(interaction.user);

		if (conversation === null || (conversation !== null && !conversation.active)) return new Response()
			.addEmbed(builder => builder
				.setDescription("You do not have an active conversation 😔")
				.setColor("Red")
			)
			.setEphemeral(true);

		/* Owner of the conversation thread, if applicable */
		const owner: User | null = interaction.channel!.type === ChannelType.PublicThread ? await ownerOfThread(interaction.channel as ThreadChannel) : null;

		/* If this channel is a thread channel, and this thread channel is not owned by the executor, send a notice message. */
		if (interaction.channel!.type === ChannelType.PublicThread && owner !== null && owner.id !== interaction.user.id) return new Response()
			.addEmbed(builder => builder
				.setDescription(`This conversation thread does not belong to you 😔`)
				.setFooter({ text: "Use /conversation in a text channel to create your own" })
				.setColor("Red")
			)
			.setEphemeral(true);

		/* If the conversation is currently busy, don't reset it. */
		if (conversation.locked) return new Response()
			.addEmbed(builder => builder
				.setDescription("You already have a request running in this conversation, *wait for it to finish* 😔")
				.setColor("Red")
			)
			.setEphemeral(true);

		try {
			/* If the command was executed in the user's conversation thread, only reset it without actually removing the thread. */
			if (owner !== null && owner.id === interaction.user.id) {
				/* Try to reset the conversation. */
				await conversation.reset(true);

				return new Response()
					.addEmbed(builder => builder
						.setDescription("This conversation thread has been reset 😊")
						.setColor("Green")
					);
			} else {
				/* Try to reset the conversation. */
				await conversation.reset();
				await conversation.sendResetMessage();

				return new Response()
					.addEmbed(builder => builder
						.setDescription("Your conversation has been reset 😊")
						.setColor("Green")
					);
			}

		} catch (error) {
			await handleError(this.bot, {
				title: "Failed to reset the conversation",
				message: await interaction.fetchReply().catch(() => undefined),
				error: error as Error,
				reply: false
			});

			return new Response(ResponseType.Edit)
				.addEmbed(builder =>
					builder.setTitle("Failed to reset your conversation ⚠️")
						.setDescription(`*The developers have been notified.*`)
						.setColor("Red")
				);
		}
    }
}