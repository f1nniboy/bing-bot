import { Channel, ChannelType, TextChannel } from "discord.js";

import { Bot } from "../../bot/bot.js";
import { Config } from "../../config.js";

/**
 * Get the specified text channel.
 * 
 * @throws An error, if the channel could not be found
 * @returns The specified text channel
 */
export const messageChannel = (bot: Bot, type: keyof Config["channels"]): TextChannel => {
    const channel: Channel | null = bot.client.guilds.cache.get(bot.app.config.channels[type].guild)!.channels.cache.get(bot.app.config.channels[type].channel)! ?? null;

    if (channel === null) throw new Error("Invalid message channel has been given");
    if (channel.type !== ChannelType.GuildText) throw new Error("Message channel is not a text channel");

    return channel as TextChannel;
}