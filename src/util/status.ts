import { Bot } from "../bot/bot.js";
import { Utils } from "./utils.js";

import { ActivityType, Awaitable } from "discord.js";
import chalk from "chalk";

interface StatusMessage {
    /* Type of the status message */
    type: Exclude<ActivityType, ActivityType.Custom>;

    /* Display name of the status message */
    name: string;

    /* Template for the status message */
    template: (bot: Bot) => Awaitable<string>;
}

/* List of status messages to use */
const messages: StatusMessage[] = [
    {
        type: ActivityType.Playing,
        name: "Playing with Bing",

        template: () => `with Bing`
    },

    {
        type: ActivityType.Listening,
        name: "Listening to Conversations",

        template: async (bot: Bot) => `${(await bot.db.client.from("conversations").select("*", { count: "exact" })).count ?? 0} conversations`
    },

    {
        type: ActivityType.Watching,
        name: "Watching over Servers",

        template: async (bot: Bot) => {
            /* Total guild count */
            const guilds: number = ((await bot.client.shard!.fetchClientValues("guilds.cache.size")) as number[])
                .reduce((value, count) => value + count, 0);

            return `over ${guilds} servers`;
        }
    }
]

/**
 * Choose a random status message for the Discord bot.
 */
export const chooseStatusMessage = async (bot: Bot): Promise<void> => {
    /* Choose a random status message. */
    const message: StatusMessage = Utils.random(messages);
    let result: string | null = null;

    /* Try to execute the template of the status message. */
    try {
        result = await message.template(bot);
    } catch (error) {
        return void bot.logger.error(`Failed to use status template ${chalk.bold(message.name)} -> ${(error as Error).message}`);
    }

    /* Update the bot's activity. */
    bot.client.user!.setActivity({
        type: message.type,
        name: `${result!} » @${bot.client.user!.username}`
    });
}