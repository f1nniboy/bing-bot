import { Message } from "discord.js";

import { Bot } from "../../bot/bot.js";

/**
 * Remove the specified reaction from the message.
 * Don't do anything if the reaction doesn't exist on the message.
 * 
 * @param emoji Emoji reaction to remove
 * @param message Message to remove reaction from
 * 
 * @returns Whether a reaction was removed
 */
export const removeReaction = async (bot: Bot, emoji: string, message: Message): Promise<boolean> => {
    /* Find the specified reaction, added by the self-bot. */
    const reactions = message.reactions.cache.filter(
        reaction => reaction.emoji.name == emoji && reaction.users.cache.filter(user => user.id == bot.client.user!.id).size > 0
    );

    /* Remove all of the filtered reactions. */
    await Promise.all(reactions.map(reaction => reaction.users.remove(bot.client.user!))).catch(() => {});
    return reactions.size > 0;
}