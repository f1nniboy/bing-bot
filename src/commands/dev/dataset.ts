import { SlashCommandBuilder } from "discord.js";
import { writeFile } from "fs/promises";

import { Command, CommandInteraction, CommandResponse } from "../../command/command.js";
import { getPromptLength } from "../../conversation/utils/length.js";
import { Response, ResponseType } from "../../command/response.js";
import { SourceAttribution } from "../../gpt/types/message.js";
import { Bot } from "../../bot/bot.js";

/* Minimum amount of interactions required to export */
const DATASET_MIN_INTERACTIONS = 100;

type DatasetType = "searchQueries" | "suggestions";

interface DatasetLine {
	prompt: string;
	completion: string;
}

interface DatasetInfo {
	/* How many user interactions are in the dataset */
	interactions: number;

	/* How many conversations are in the dataset */
	conversations: number;

	/* How many tokens are in the dataset */
	tokens: number;

	/* Raw list of interactions */
	array: {
		createdAt: string;
		id: string;
		input: string;
		output: string;
		queries: string[] | null;
		requestedAt: string;
		sources: SourceAttribution[] | null;
		suggestions: string[];
		conversation: string;
	}[];
}

export default class DatasetCommand extends Command {
    constructor(bot: Bot) {
        super(bot,
            new SlashCommandBuilder()
                .setName("dataset")
                .setDescription("Export & view collected messages to the dataset - owner only")
				.addSubcommand(builder => builder
					.setName("view")
					.setDescription("View information about the collected data - owner only"))
				.addSubcommand(builder => builder
					.setName("export")
					.setDescription("Export the collected data to JSONL files - owner only"))
        );
    }

	/**
	 * Get information about what's in the dataset.
	 * @returns Information about dataset
	 */
	private async info(): Promise<DatasetInfo> {
		const { data, error } = await this.bot.db.client
			.from("messages")
			.select("*");

		if (data === null && error !== null) throw new Error(error.message);

		/* Total amount of tokens collected (not including all the initial prompts...) */
		const tokens: number = getPromptLength(data.map(entry => entry.input + entry.output).join(""));
		let conversations: string[] = [];

		/* Calculate the amount of unique conversations. */
		data.forEach(entry => {
			if (conversations.find(c => c === entry.conversation)) return;
			conversations.push(entry.conversation);
		});

		return {
			interactions: data.length,
			conversations: conversations.length,
			tokens: tokens,

			array: data
		};
	}

	/**
	 * Save the given dataset to a JSONL file.
	 * 
	 * @param name Name of the dataset to export
	 * @param entries Entries to put in the JSONL file
	 */
	private async save(name: DatasetType, entries: DatasetLine[]): Promise<void> {
		/* Stringified JSONL data */
		const data: string = entries
			.map(entry => JSON.stringify({ prompt: entry.prompt, completion: ` ${entry.completion}\n` }))
			.join("\n");

		/* Save the file. */
		await writeFile(`datasets/${name}.jsonl`, data);
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

		if (!this.bot.app.config.collectMessages) return new Response()
			.addEmbed(builder => builder
				.setDescription("Collection of user's conversations is currently disabled 😔")
				.setFooter({ text: "Enable collectMessages in the configuration file." })
				.setColor("Red")
			)
			.setEphemeral(true);

		/* Action to execute */
		const action: string = interaction.options.getSubcommand(true);
		const info: DatasetInfo = await this.info();

		/* View information about the collected data */
		if (action === "view") {
			return new Response()
				.addEmbed(builder => builder
					.setTitle("Dataset 🔎")
					.addFields(
						{
							name: "Interactions 📝",
							value: `${info.interactions}`,
							inline: true
						},
						
						{
							name: "Conversations 💬",
							value: `${info.conversations}`,
							inline: true
						},

						{
							name: "Tokens 🎛️",
							value: `${info.tokens}`,
							inline: true
						}
					)
					.setColor(info.interactions > DATASET_MIN_INTERACTIONS ? "Green" : "Red")
					.setFooter(info.interactions < DATASET_MIN_INTERACTIONS ? { text: `It is recommended to have at least ${DATASET_MIN_INTERACTIONS} interactions in the dataset, before fine-tuning.` } : null)
				)
				.setEphemeral(true);

		/* Export the dataset to JSONL files */
		} else if (action === "export") {
			if (info.interactions < DATASET_MIN_INTERACTIONS) return new Response()
				.addEmbed(builder => builder
					.setDescription("The dataset does not contain enough interactions yet 😔")
					.setColor("Red")
				)
				.setEphemeral(true);

			/* Defer the interaction, as this may take a while to complete. */
			await interaction.deferReply();

			const { data, error } = await this.bot.db.client
				.from("messages")
				.select("*");

			if (data === null && error !== null) throw new Error(error.message);

			/* Export the suggestions as a JSONL file. */
			await this.save("suggestions", info.array.map(interaction => {
				/* Get the other messages in the chat history, sorted correctly */
				const other: typeof info.array = info.array
					.filter(entry => entry.conversation === interaction.conversation && Date.parse(entry.requestedAt) < Date.parse(interaction.requestedAt))
					.sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));

				return {
					prompt: `${other.slice(-1).map(entry => `User: ${entry.input}\nBing: ${entry.output}`).join("\n")}\nUser: ${interaction.input}\nBing: ${interaction.output}\n\nSuggestions: `.trim(),
					completion: interaction.suggestions.join(" | ")
				};
			}));

			/* Export the search queries as a JSONL file. */
			await this.save("searchQueries", info.array.map(interaction => {
				/* Get the other messages in the chat history, sorted correctly */
				const other: typeof info.array = info.array
					.filter(entry => entry.conversation === interaction.conversation && Date.parse(entry.requestedAt) < Date.parse(interaction.requestedAt))
					.sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));

				return {
					prompt: `${other.slice(-1).map(entry => `User: ${entry.input}\nBing: ${entry.output}`).join("\n")}\nUser: ${interaction.input}\n\nQueries: `.trim(),
					completion: interaction.queries !== null ? interaction.queries.join(" | ") : "N"
				};
			}));

			return new Response(ResponseType.Edit)
				.addEmbed(builder => builder
					.setDescription("Exported 🎉")
					.setColor("Green")
				);
		}
    }
}