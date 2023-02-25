import { EmbedBuilder, Message, MessageCreateOptions, TextChannel } from "discord.js";
import chalk from "chalk";

import { Response } from "../../command/response.js";
import { Bot } from "../../bot/bot.js";
import { messageChannel } from "./channel.js";

interface ErrorHandlingOptions {
    message?: Message;
    error: Error;

    title?: string;
    reply?: boolean;
}

/**
 * Reply to the invocation message with the occured error & also
 * add a reaction to the message.
 * 
 * @param message Message to reply & react to 
 * @param error Error that occured
 * @param title Custom title for the error message
 * @param reply Whether to reply to the invocation message
 */
export const handleError = async (bot: Bot, { message, error, title, reply }: ErrorHandlingOptions) => {
    /* Log the errror to the console. */
    bot.logger.error(`An error occured while processing a request -> ${chalk.bold(error.toString())}`);

    /* Send the error message as a reply. */
    if (!!reply && message) {
        const embed: EmbedBuilder = new EmbedBuilder()
            .setTitle(`${title ?? "An error occured"} ⚠️`)
            .setDescription("*The developers have been notified.*")
            .setColor("Red");

        await Promise.all([
            message.reply({ embeds: [ embed ] }),
            message.react("⚠️")
        ]).catch(() => {});
    }

    /* Send the error message to the moderation channel. */
    await sendErrorMessage(bot, error, message, title);
}

/**
 * Send the "error message" notice in the dedicated channel.
 * @param error Error to log to the channel
 */
export const sendErrorMessage = async (bot: Bot, error: Error, message?: Message, title?: string): Promise<void> => {
    /* Get the moderation channel. */
    const channel = messageChannel(bot, "error");

    const reply = new Response()
        .addEmbed(builder => builder
            .setTitle("An error occured ⚠️")
            .setDescription(`${title !== undefined ? `*${title}*\n\n` : ""}\`\`\`\n${error.toString()}\n\n${error.stack!.split("\n").slice(1).join("\n")}\n\`\`\``)
            .setColor("Red")
        );

    /* Add information about the guild, channel and author of the invocation message. */
    if (message !== undefined) {
        reply.embeds[0].addFields(
            {
                name: "Guild",
                value: "`" + message.guild!.name + "`",
                inline: true
            },

            {
                name: "Channel",
                value: "`#" + (message.channel as TextChannel).name + "`",
                inline: true
            }
        );
    }

    /* Send the error  message to the channel. */
    await channel.send(reply.get() as MessageCreateOptions);
}