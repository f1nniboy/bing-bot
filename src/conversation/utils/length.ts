import { encoding_for_model } from "@dqbd/tiktoken";
const encoding = encoding_for_model("text-davinci-003");

/* Maximum prompt length for a GPT-3 request, change this to your liking */
export const GPT_MAX_PROMPT_LENGTH: number = 900;

/**
 * Get the length of a prompt.
 * @param content Prompt to check
 * 
 * @returns Length of the prompt, in tokens
 */
export const getPromptLength = (content: string): number => {
    return encoding.encode(content).length;
}

/**
 * Whether the length of a prompt is usable for ChatGPT.
 * @param content Prompt to check
 * 
 * @returns Whether the prompt is usable
 */
export const isPromptLengthAcceptable = (content: string, max: number = GPT_MAX_PROMPT_LENGTH): boolean => {
    return getPromptLength(content) < max;
}