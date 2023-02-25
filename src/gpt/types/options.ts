import { Message } from "discord.js";

import { Conversation } from "../../conversation/conversation.js";
import { ResponseMessage } from "./message.js";

export interface BingGenerationOptions {
    /* Function to call on partial message generation */
    progress: (message: ResponseMessage) => Promise<void> | void;

    /* Which conversation this generation request is for */
    conversation: Conversation;

    /* Discord message that invoked the generation */
    trigger: Message;

    /* Prompt to ask to Sydney/GPT-3 */
    prompt: string;
}