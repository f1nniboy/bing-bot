import { Awaitable, SlashCommandBuilder } from "discord.js";

import { Command, CommandInteraction, CommandResponse } from "../command/command.js";
import { Response } from "../command/response.js";

import { Bot } from "../bot/bot.js";
import { inspect } from "util";

export default class EvaluateCommand extends Command {
    constructor(bot: Bot) {
        super(bot,
            new SlashCommandBuilder()
                .setName("eval")
                .setDescription("Run the specified code snippet, owner only")
				.addStringOption(builder => builder
					.setName("code")
					.setDescription("Code snippet to run"))
        , {
            cooldown: 1 * 1000
        });
    }

	private async clean(text: Awaitable<any>): Promise<string> {
		let content: string = text;
		
		/* If our input is a promise, await it before continuing. */
		if (text && text instanceof Promise) content = await text;
		
		/* If the response isn't a string, `util.inspect()`
		   is used to 'stringify' the code in a safe way that
		   won't error out on objects with circular references. */
		if (typeof text !== "string") content = inspect(text, { depth: 1 });
		
		/* Replace symbols with character code alternatives. */
		content = content
		  .replace(/`/g, "`" + String.fromCharCode(8203))
		  .replace(/@/g, "@" + String.fromCharCode(8203));
		
		return content;
	}

    public async run(interaction: CommandInteraction): CommandResponse {
		/* Whether the interaction user is the owner of the bot */
		const isOwner: boolean = interaction.user.id === this.bot.app.config.discord.owner;

		if (!isOwner) return new Response()
			.addEmbed(builder => builder
				.setDescription("You are not the owner of this bot 🤨")
				.setColor("Red")
			)
			.setEphemeral(true);

		/* Code snippet to execute. */
		const snippet: string = interaction.options.getString("code", true);

		try {
			/* Variables passed to the snippet */
			const bot = this.bot;
			const channel = interaction.channel;
			const guild = interaction.guild;

			/* Evaluate the passed code snippet. */
			const result = eval(snippet);

			/* Clean up the result. */
			const cleaned: string = await this.clean(result);

			return new Response()
				.addEmbed(builder => builder
					.setDescription(cleaned.length > 0 ? `\`\`\`\n${cleaned}\n\`\`\`` : "*no output*")
					.setFooter({ text: snippet })
					.setColor("White")
				)
				.setEphemeral(true);

		} catch (error) {
			return new Response()
				.addEmbed(builder =>
					builder.setTitle("Failed to execute ⚠️")
						.setDescription(`\`\`\`\n${(error as Error).toString()}\n\`\`\``)
						.setColor("Red")
						.setTimestamp()
				)
				.setEphemeral(true);
		}
    }
}