import { EmbedBuilder } from "discord.js";

import { OpenAIModerationsCategoryScores, OpenAIModerationsData } from "../openai/types/moderation.js";
import { GeneratorOptions } from "./generator.js";
import { Conversation } from "./conversation.js";

interface OpenAIModerationScore {
    key: keyof OpenAIModerationsCategoryScores;
    value: number;
}

export interface ModerationResult {
    /* Raw moderation check data */
    data: OpenAIModerationsData;

    /* Whether the message contained vulgar language */
    moderated: boolean;

    /* Highest confidence rating */
    highest: OpenAIModerationScore;

    /* Whether the user wanted to execute the request regardless */
    run: boolean;
}

/**
 * Check a generation request for profanity & other vulgar language before executing.
 * 
 * If the message contains profanity, ask the user using a Discord button interaction,
 * whether they actually want to execute the request.
 * 
 * @param options Generation options
 * @returns Wheter the message contained
 */
export const check = async (conversation: Conversation, options: GeneratorOptions): Promise<ModerationResult | null> => {
    /* Send the request to the /moderations endpoint. */
    const result: OpenAIModerationsData | null = await conversation.manager.bot.ai.moderate(options.content)
        .catch(() => null);

    /* In case an error occurs, we quietly ignore the moderation check. */
    if (result === null) return null;

    /* Whether the message has been flagged
       Saved as an additional variable, in case we want to add additional parameters to this */
    const flagged: boolean = result.results[0].flagged;

    const sorted: OpenAIModerationScore[] = Object.entries(result.results[0].category_scores)
        .map(([ key, value ]) => ({ key, value: value as number } as OpenAIModerationScore))
        .sort((a, b) => { return b.value - a.value });

    /* Which type of moderation flag was given the highest confidence */
    const highest: OpenAIModerationScore = sorted[0];

    /* If the message was flagged, send the notice message to the user. */
    if (flagged) {
        /* Reply to the invocation message. */
        await options.message.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("What's this? 🤨")
                    .setDescription(`We have deemed your message as possibly **\`${highest.key}\`**-related.\n*Avoid the mentioned topic & try out a different prompt.*`)
                    .setColor("Red")
            ]
        });

        await options.message.react("‼️").catch(() => {});
    }

    return {
        data: result,
        highest,

        moderated: flagged,
        run: !flagged
    };
}