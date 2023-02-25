import { ChatInputCommandInteraction, Collection, CommandInteraction, ContextMenuCommandInteraction, InteractionResponse, SlashCommandBuilder } from "discord.js";
import { RESTPostAPIApplicationCommandsJSONBody, Routes } from "discord-api-types/v10";
import { DiscordAPIError, REST } from "@discordjs/rest";

import { handleError } from "../util/moderation/error.js";
import { Response, ResponseType } from "./response.js";
import { CooldownData } from "./cooldown.js";
import { Utils } from "../util/utils.js";
import { Command } from "./command.js";
import { Bot } from "../bot/bot.js";

export class CommandManager {
	protected readonly bot: Bot;

	/* List of loaded & registered commands */
	public commands: Collection<string, Command>;

	constructor(bot: Bot) {
		this.bot = bot;

		/* Initialize the command list. */
		this.commands = new Collection();
	}

	/* Load all the commands. */
	public async loadAll(): Promise<void> {
		return new Promise((resolve, reject) => {
			Utils.search("./build/commands", "js")
				.then(async (files: string[]) => {
					await Promise.all(files.map(async path => {
						await import(path)
							.then((data: { [key: string]: Command }) => {
								const command: Command = new (data.default as any)(this.bot);
								this.commands.set(command.builder.name, command);
							})
							.catch(reject);
					}));

					resolve();
				})
				.catch(reject);
		});
	}

	/**
     * Register all the loaded commands to Discord.
     * @returns Amount of registered commands
     */
	public async register(): Promise<number> {
        if (this.commands.size === 0) throw new Error("Commands have not been loaded yet");

		/* Information about each application command, as JSON */
		const commandList: RESTPostAPIApplicationCommandsJSONBody[] = this.commands.map(cmd =>
			(cmd.builder as SlashCommandBuilder).setDefaultPermission(true).toJSON()
		);

		/* REST API client */
		const client: REST = new REST().setToken(this.bot.app.config.discord.token);

		return new Promise(async (resolve, reject) => {
			/* Register the serialized list of application commands to Discord. */
			await client.put(Routes.applicationCommands(this.bot.app.config.discord.id), {
				body: commandList
			})
				.then(() => resolve(commandList.length))
				.catch(reject);
		});
	}

	/**
	 * Get the current cool-down for the specific command, for the user who executed this interaction.
	 * 
	 * @param interaction Interaction user to check
	 * @param command Command to check
	 */
	public async cooldown(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, command: Command): Promise<CooldownData | null> {
		/* If the command doesn't have a cool-down time set, abort. */
		if (command.options.cooldown === null) return null;

		const { data } = await this.bot.db.client
			.from("cooldown")
			.select("*")

			.eq("id", interaction.user.id)
			.eq("name", command.builder.name);

		/* If the cool-down entry doesn't exist yet, return nothing. */
		if (data === null || data.length === 0) return null;
		
		/* When the cool-down was applied */
		const createdAt: number = Date.parse(data[0].createdAt);

		return data !== null ? {
			createdAt: createdAt,
			expiresAt: createdAt + command.options.cooldown
		} : null;
	}

	/**
	 * Apply the command-specific cooldown to the interaction user.
	 * 
	 * @param interaction Interaction user to set cool-down for 
	 * @param command Command to set cool-down for
	 */
	public async applyCooldown(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, command: Command): Promise<void> {
		/* If the command doesn't have a cool-down time set, abort. */
		if (command.options.cooldown === null) return;

		/* Update the database entry for the user & the executed command. */
		await this.bot.db.client
			.from("cooldown")
			.upsert({
				id: interaction.user.id,
				name: command.builder.name,
				createdAt: new Date().toISOString()
			}, {
				onConflict: "id"
			});

		/* Delete the user's cooldown from the database, once it expires. */
		setTimeout(async () => {
			await this.bot.db.client
				.from("cooldown")
				.delete()

				.eq("id", interaction.user.id)
				.eq("name", command.builder.name);
		}, command.options.cooldown);
	}

	/**
     * Handle a command interaction.
     * @param interaction Command interaction to handle
     */
	public async handleCommand(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction): Promise<void> {
		/* Get the command, by its name. */
		const command: Command | null = this.commands.get(interaction.commandName) ?? null;
		if (command === null) return;

		/* Get the current cool-down of the command. */
		const cooldown: CooldownData | null = await this.cooldown(interaction, command);

		/* If the user doesn't have a cool-down set for the command yet, ... */
		if (command.options.cooldown !== null && cooldown === null) {
			await this.applyCooldown(interaction, command);
		
		/* If the user is currently on cool-down for this command, ... */
		} else if (command.options.cooldown !== null && cooldown !== null && cooldown.expiresAt > Date.now()) {
			/* Send an informative message about the cool-down. */
			const response: Response = new Response()
				.addEmbed(builder => builder
					.setTitle("Whoa-whoa... slow down ⌛")
					.setDescription(`This command is currently on cool-down. You can use it again <t:${Math.floor(cooldown.expiresAt / 1000)}:R>.`)
					.setColor("Yellow")
				);

			/* How long until the cool-down expires */
			const delay: number = (cooldown.createdAt + (cooldown.expiresAt - cooldown.createdAt)) - Date.now() - 1000;

			/* Send the notice message. */
			return await response.send(interaction)
				.then(message => {
					if (message instanceof InteractionResponse) {
						/* Delete the cool-down message again, after it has expired. */
						setTimeout(async () => {
							const reply = await (message.interaction as CommandInteraction).fetchReply();
							if (reply === null) return;

							await reply.delete().catch(() => {});
						}, delay);
					}
				});

		/* If the user's cooldown already expired, ... */
		} else if (command.options.cooldown !== null && cooldown !== null && cooldown.expiresAt < Date.now()) {
			await this.applyCooldown(interaction, command);
		}

		/* Defer the message, in case the command may execute for more than 3 seconds. */
		if (command.options.long) try {
			await interaction.deferReply();
		} catch (_) {
			return;
		}

		/* Reply to the original interaction */
		let response: Response | undefined;

		/* Try to execute the command handler. */
		try {
			response = await command.run(interaction as any);

		} catch (error) {
			if (error instanceof DiscordAPIError && error.code === 10062) return;

			response = new Response(command.options.long ? ResponseType.Edit : ResponseType.Send)
				.addEmbed(builder =>
					builder.setTitle("An error occured ⚠️")
					    .setDescription(`*The developers have been notified.*`)
						.setColor("Red")
				);

			await handleError(this.bot, {
				error: error as Error,
				reply: false
			});
		}

		/* Reply with the response, if one was given. */
		if (response) await response.send(interaction);
	}
}