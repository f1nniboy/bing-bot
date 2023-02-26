import { fetchEventSource } from "@waylaidwanderer/fetch-event-source";

import { OpenAICompletionsBody, OpenAICompletionsData, OpenAICompletionsJSON } from "./types/completions.js";
import { GPTGenerationErrorType, GPTGenerationError } from "../error/gpt/generation.js";
import { OpenAIModerationsBody, OpenAIModerationsData } from "./types/moderation.js";
import { OpenAIErrorData } from "./types/error.js";
import { GPTAPIError } from "../error/gpt/api.js";
import { Bot } from "../bot/bot.js";

export class OpenAIManager {
    /* Base application class */
    protected readonly bot: Bot;

    /* OpenAI API token */
    public token: string | null;

    constructor(bot: Bot) {
        this.token = null;
        this.bot = bot;
    }

    /**
     * Initialize the OpenAI API.
     */
    public async setup(token: string): Promise<void> {
        this.token = token;
    }


    /**
     * Various OpenAI APIs
     */

    /**
     * Complete the provided prompt using the specified model.
     * @param input Input text to check
     * 
     * @throws An error, if the request to OpenAI failed
     * @returns Moderation data
     */
    public async complete(options: OpenAICompletionsBody, progress?: (data: OpenAICompletionsJSON) => Promise<void> | void): Promise<OpenAICompletionsData> {
        /* Latest message of the stream */
        let latest: OpenAICompletionsJSON | null = null;

        /* Whether the generation is finished */
        let done: boolean = false;

        /* Make the request to OpenAI's API. */
        await new Promise<void>(async (resolve, reject) => {
            const controller: AbortController = new AbortController();

            try {
                fetchEventSource("https://api.openai.com/v1/completions", {
                    headers: this.headers() as any,
                    body: JSON.stringify(options),
                    mode: "cors",
                    signal: controller.signal,
                    method: "POST",

                    onclose: () => {
                        /* If the API didn't send us [DONE] back, but still finished the request, manually mark the request as done. */
                        if (!done) {
                            done = true;

                            controller.abort();
                            resolve();
                        }
                    },
                    
                    onerror: (error) => {
                        throw error;
                    },
        
                    onopen: async (response) => {
                        /* If the request failed for some reason, throw an exception. */
                        if (response.status !== 200) {
                            /* Response data */
                            const data: any | null = await response.clone().json().catch(() => null);
            
                            /* If an error message was given in the response body, show it to the user. */
                            if (data !== null) {
                                const error: Error = await this.error(response);

                                controller.abort();
                                reject(error);
                            }
                        }
                    },

                    onmessage: async (event) => {
                        /* If the request is finished, resolve the promise & mark the request as done. */
                        if (event.data === "[DONE]") {
                            done = true;

                            controller.abort();
                            return resolve();
                        }
        
                        /* Response data */
                        const data: OpenAICompletionsJSON = JSON.parse(event.data);
                        if (data === null || data.choices === undefined || (data.choices && data.choices.length === 0)) return;

                        latest = {
                            created: data.created,
                            usage: data.usage,

                            choices: [
                                {
                                    text: latest !== null ? `${latest.choices[0].text}${data.choices[0].text}` : data.choices[0].text,
                                    finish_reason: data.choices[0].finish_reason
                                }
                            ]
                        };

                        if (progress !== undefined) progress(latest);
                    },
                });

            } catch (error) {
                if (error instanceof GPTAPIError) return reject(error);

                reject(new GPTGenerationError({
                    type: GPTGenerationErrorType.Other,
                    cause: error as Error
                }));
            }
        });

        /* If the request was not finished, throw an error. */
        if (!done && latest === null) throw new GPTGenerationError({
            type: GPTGenerationErrorType.Empty
        });

        return {
            created: latest!.created,
            response: latest!.choices[0],
            usage: latest!.usage
        };
    }

    /**
     * Check the given input string for profanity & other types of vulgar language.
     * @param input Input text to check
     * 
     * @throws An error, if the request to OpenAI failed
     * @returns Moderation data
     */
    public async moderate(input: string): Promise<OpenAIModerationsData> {
        const body: OpenAIModerationsBody = {
            input
        };

        /* Make the request to OpenAI's API. */
        const response = await fetch("https://api.openai.com/v1/moderations", {
            body: JSON.stringify(body),
            headers: this.headers(),
            method: "POST"
        });

        /* If the request failed for some reason, throw an exception. */
        if (response.status !== 200) throw await this.error(response);

        /* Response data */
        const data = response.json();
        return data;
    }

    /**
     * Extract the error from a failed request, and generate a corresponding GPTAPIError exception.
     * @param response Failed HTTP request
     * 
     * @returns GPT API error class
     */
    private async error(response: Response): Promise<GPTAPIError> {
        /* Error data */
        let body: OpenAIErrorData | null = null;

        /* Try to parse the given error data in the response. */
        try {
            body = await response.json() as OpenAIErrorData;
        } catch (error ) {
            body = null;
        }

        return new GPTAPIError({
            endpoint: response.url,
            code: response.status,
            id: body != null ? body.error.type : null,
            message: body !== null ? body.error.message : null
        });
    }

    /* Headers used for OpenAI API requests */
    private headers(): HeadersInit {
        if (this.token === null) throw new Error("API is not initialized");

        return {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json"
        };
    }
}