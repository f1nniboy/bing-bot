import { ChannelType, Interaction, Message } from "discord.js";

/* Where the message was sent */
export enum MessageContext {
	Private,
	Guild,
    Unknown
}

/**
 * Figure out in what context a message was sent.
 * @param message Message to find context of
 * 
 * @returns Context of the message 
 */
export const getContext = (message: Message | Interaction) => {
    if (message.channel!.type == ChannelType.DM) return MessageContext.Private;
    else                                        return MessageContext.Guild;
}

export const contextToString = (context: MessageContext): string => {
    return MessageContext[context];
}