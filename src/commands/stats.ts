import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ColorResolvable, EmbedBuilder, GuildMember, Role, SlashCommandBuilder } from "discord.js";

import { Command, CommandInteraction, CommandResponse } from "../command/command.js";
import { Response } from "../command/response.js";
import { Utils } from "../util/utils.js";
import { Bot } from "../bot/bot.js";


interface Statistic {
	key: string;
	value: string | number;
}

export default class StatsCommand extends Command {
    constructor(bot: Bot) {
        super(bot,
            new SlashCommandBuilder()
                .setName("stats")
                .setDescription("View statistics about the bot"),
        {
            cooldown: 5 * 1000
        });
    }

    public async run(interaction: CommandInteraction): CommandResponse {
        /* Total guild count */
        const guilds: number = ((await this.bot.client.shard!.fetchClientValues("guilds.cache.size")) as number[])
            .reduce((value, count) => value + count, 0);

        /* Total user count */
        const users: number = ((await this.bot.client.shard!.broadcastEval(client => client.guilds.cache.reduce((value, guild) => value + guild.memberCount, 0))) as number[])
            .reduce((value, count) => value + count, 0);

        /* Average latency of the shards */
        const latency: number = ((await this.bot.client.shard!.fetchClientValues("ws.ping")) as number[])
            .reduce((value, ping, _, { length }) => value + (ping / length));

		const statistics: Statistic[] = [
			{
				key: "Servers 🖥️",
				value: guilds
			},

			{
				key: "Latency 🏓",
				value: `**\`${latency.toFixed(1)}\`** ms`
			},

			{
				key: "Shard 💎",
				value: this.bot.data.id + 1
			},

			{
				key: "Users <:discord:1075134462834249843>",
				value: users
			},

			{
				key: "Conversations 💬",
				value: `${(await this.bot.db.client.from("conversations").select("*", { count: "exact" })).count ?? 0}`
			},

			{
				key: "RAM 🖨️",
				value: `**\`${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}\`** MB`
			}
		];
		
		/* Color of the embed */
		let color: ColorResolvable = "White";

		/* Fetch the bot's member of the guild, if the command was ran on a server. */
		const me: GuildMember | null = interaction.guild !== null ? await interaction.guild.members.fetchMe() : null;

		/* If the command was executed on a server, get the highest role's color. */
		if (me) {
			/* Get the hoisted or highest role of the bot & set the color of the embed appropriately. */
			const role: Role = me.roles.highest;
			color = role.hexColor;
		}

		const builder: EmbedBuilder = new EmbedBuilder()
			.setTitle("Statistics")
			.setDescription("*A Discord bot to interact with Bing Chat*")
			.setColor(color)

			.addFields(statistics.map(statistic => ({
				name: statistic.key,
				value: statistic.value.toString(),

				inline: true
			})));

		const row = new ActionRowBuilder<ButtonBuilder>()
			.addComponents(
				new ButtonBuilder()
					.setURL(Utils.inviteLink(this.bot))
					.setLabel("Invite me to your server")
					.setStyle(ButtonStyle.Link)
			);

        return new Response()
            .addEmbed(_ => builder)
			.addComponent(ActionRowBuilder<ButtonBuilder>, row);
    }
}