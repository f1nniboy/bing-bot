import { ContextMenuCommandBuilder, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, ContextMenuCommandInteraction } from "discord.js";
import { APIApplicationCommandOptionChoice } from "discord-api-types/v10";

import { Response } from "./response.js";
import { Bot } from "../bot/bot.js";

export type CommandBuilder = 
	SlashCommandBuilder
	| Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
	| SlashCommandSubcommandsOnlyBuilder
	| ContextMenuCommandBuilder;

export type CommandInteraction = ChatInputCommandInteraction;
export type CommandOptionChoice<T = string | number> = APIApplicationCommandOptionChoice<T>;

export type CommandResponse = Promise<Response | undefined>;

export interface CommandOptions {
    /* Whether the command may take longer than 3 seconds (the default limit) to execute */
    long?: boolean;

	/* How long the cool-down between executions of the command should be */
	cooldown: number | null;
}

export class Command<U extends CommandInteraction = CommandInteraction, T extends CommandOptions = CommandOptions> {
    protected readonly bot: Bot;

	/* Data of the command */
	public readonly builder: CommandBuilder;

    /* Other command options */
    public readonly options: T;

	constructor(bot: Bot, builder: CommandBuilder, options?: T, defaultOptions: T = { long: false, cooldown: 3 * 1000 } as any) {
		this.bot = bot;
		this.builder = builder;
        this.options = options ?? defaultOptions!;
	}

	/* Run the command. */
	public async run(interaction: U): CommandResponse {
		/* Stub */
		return;
	}
}