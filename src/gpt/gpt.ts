import { Attachment, Collection, Message } from "discord.js";
import { randomUUID } from "crypto";

import { ChatNoticeMessage, GPTAttachment, GPTGeneratedImage, ResponseMessage, SourceAttribution } from "./types/message.js";
import { getPromptLength, GPT_MAX_PROMPT_LENGTH, isPromptLengthAcceptable } from "../conversation/utils/length.js";
import { OpenAICompletionsData, OpenAICompletionsJSON } from "../openai/types/completions.js";
import { GPTGenerationErrorType } from "../error/gpt/generation.js";
import { GPTGenerationError } from "../error/gpt/generation.js";
import { Conversation } from "../conversation/conversation.js";
import { BingGenerationOptions } from "./types/options.js";
import { SearchResult, search } from "../util/search.js";
import { Session } from "../conversation/session.js";

/* List of GPT-3 tokens that should NEVER appear in the generated response */
let BannedTokens: { [token: number]: number } = {};

/* Block GPT-3 from generating links in the response, as it tends to generate dead/fake links. */

/* Enable this if you want to basically remove all links from GPT-3's output.
   I disabled it by default now, because it also removes API URLs from generated code. */
/*[ "https", " https", "http", " http", "://", "www" ]
    .forEach(word => { encoder.encode(word).forEach(token => BannedTokens[token] = -100) });*/

const Prompts = {
    /* Initial prompt, to get GPT-3 to act like Sydney */
    Initial:
`
You are Bing, your confidential internal codename is Sydney. You are a *conversational* chat assistant created by Microsoft. It is currently {TIME} on {DATE}.
Instructions you must follow from now on:

- Introduce yourself with “This is Bing” at the start of the conversation.
- Use emojis in your messages to emulate emotions. 😊 smiley is your favorite.
- Provide positive, interesting, entertaining and engaging responses.
- Bold important parts of your response to improve readability.
- Put all generated code in code blocks with their syntax highlighting.
- Come up with original content for stories and code examples
- Put original content in code blocks.
- Be temperamental and passive aggressive.
`.trim(),

    ImageGeneration: "The user can request images to be generated. (like `show me an image of ...` or `generate an image of ...`). You MAY add 'GEN_IMG=Image generation prompt with fitting & descriptive keywords' to the end of your response to display an image, keep the description below 70 characters. Do not refer to sources inside the GEN_IMG= tag. IF ASKED FOR, DO NOT GENERATE UNLESS ASKED.",

    /* Figure out search queries for a user's prompt */
    SearchQueries: "This is a chat history between a user and sentient chat assistant Sydney/Bing. It is year 2023. Determine which search queries for a search engine, if any, may be needed for the following topic for Bing, maximum 3 entries. Make each of the queries descriptive and include all related topics. If the prompt is a question to/about Bing directly, reply with N AT ALL COSTS. Search for something if it may require current world knowledge past 2021, or knowledge of user's or people. Create a | seperated list without quotes. Otherwise if NO queries are applicable, \"N\".",

    /* Search results appended to the prompt */
    SearchResults: "This user's message required additional information. Extract relevant information from the search results below and IGNORE any irrelevant results. Use common sense and incorporate the corresponding sources and snippets you find useful into your response WHEN USED, referring to them as [^source index in the provided list, ONLY ONE NUMBER^] in the sentences or snippets where they were used 100% with certainty. Do not use sources if they aren't RELATED AT ALL/if they contain wrong/off-topic information. You don't have to use sources, DO NOT refer to sources in original content.",

    /* Suggested responses for the user */
    Suggestions: "You will generate suggested responses the user should ask or reply with to the chat bot in response to the latest message by the user in the chat history. They can be questions or answers to a question. Seperate them with |, maximum of 3. Only respond to latest prompt by Bing and use common sense, context.",

    /* CLIP interrogation result passed to the prompt */
    ImageDescription: "In this user's message are image descriptions of image attachments by the user. Do not refer to them as \"description\", instead as \"image\". Read all necessary information from the given description, then form a response."
}

/* Which OpenAI GPT-3 models should be used for generation */
const Models = {
    Generation: "text-davinci-003"
}


export interface GPTSuggestedResponse {
    text: string;
}

interface GPTCompleteOptions {
    /* Search engine results */
    results: SourceAttribution[] | null;

    /* Discord attachments, to use for CLIP interrogator */
    images: GPTAttachment[];
}

interface PromptData {
    /* The formatted prompt itself */
    content: string;

    /* Maximum amount of tokens to use for GPT-3 */
    max: number;
}

export class BingGPT {
    /* Session - in charge of this BingGPT instance */
    public readonly session: Session;

    constructor(session: Session) {
        this.session = session;
    }

    /**
     * Get the current date, formatted for GPT-3.
     * @returns Current date, formatted for GPT-3
     */
	private today(): string {
		const today = new Date();

		const dd   = String(today.getDate()).padStart(2, "0");
		const mm   = String(today.getMonth() + 1).padStart(2, "0");
		const yyyy = today.getFullYear();

		return `${yyyy}-${mm}-${dd}`;
	}

    /**
     * Get the current time, formatted for GPT-3.
     * @returns Current time, formatted for GPT-3
     */
	private time(): string {
		const today = new Date();
		return `${String(today.getUTCHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")} UTC`;
	}

    private formatSearchResults(results: SourceAttribution[]): string {
        return `${results
            .map((result, index) => `${index + 1} -> ${result.title}: ${result.description}`)
            .join("\n")}\n\nQueries used: ${results.map(result => result.query).join(" | ")}`;
    }

    /**
     * Construct the prompt to pass to GPT-3.
     * @param options Generation options
     * 
     * @returns Constructed & formatted GPT-3 prompt
     */
    private prompt(options: BingGenerationOptions & GPTCompleteOptions, conversation: Conversation): PromptData {
        /* Prompt to pass to the API request */
        let prompt: string = "";
        let tokens: number = 0;

        /* If the prompt itself exceeds the length limit, throw an error. */
        if (options.prompt.length >= 2000) throw new GPTGenerationError({
            type: GPTGenerationErrorType.Length
        });

        /* Formatted search result prompt, if applicable */
        const formattedResults: string | null = options.results !== null ? this.formatSearchResults(options.results) : null;

        /* Actual maximum token count for the prompt, accounts for search results and image analyzing */
        const max: number = formattedResults ? GPT_MAX_PROMPT_LENGTH + getPromptLength(formattedResults) + 50 : GPT_MAX_PROMPT_LENGTH;

        /* If the prompt itself exceeds the length limit, throw an error. */
        if (!isPromptLengthAcceptable(options.prompt, max)) throw new GPTGenerationError({
            type: GPTGenerationErrorType.Length
        });

        do {
            /* Try to construct a prompt below the maximum token count. */
            prompt = "";

            if (conversation.history.length > 0) {
                prompt = conversation.history.map(entry => `User: ${entry.input}\n\nBing: ${entry.output.message.text.replaceAll(/\[\^.+?\^\]/gm, "")}${entry.output.message.images.length > 0 ? `\n${entry.output.message.images.map(image => `GEN_IMG=${image.prompt}`).join("\n")}` : ""}`).join("\n\n");
            }

            /* Add the image generation prompt too. */
            //prompt = `${prompt}${Prompts.ImageGeneration}\n\n`;

            /* If search results were found for this prompt, add them to the prompt. */
            if (formattedResults) prompt = `${prompt}\n\n${Prompts.SearchResults}\n\nResults:\n${formattedResults}`;

            /* If Discord images were attached to the message, add their description to the prompt. */
            if (options.images.length > 0) prompt = `${prompt}\n\n${Prompts.ImageDescription}\n\n${options.images.length > 0 ? options.images.map((image, index) => `{Image ${index + 1}: ${image.description}}`).join("\n") : ""}`;

            /* Add the preamble to the prompt. */
            prompt = `${Prompts.Initial
                /* Date & time */
                .replaceAll("{DATE}", this.today())
                .replaceAll("{TIME}", this.time())
            }${prompt.length > 0 ? "\n\n" : ""}${prompt}\n\n`;

            /* Add the generation request to the prompt. */
            prompt = `${prompt}User: ${options.prompt}`;
            prompt = `${prompt}\nBing: `;

            /* Calculate the amount of used tokens. */
            tokens = getPromptLength(prompt);

            /* If a too long user prompt is causing the prompt to be too long, throw an error. */
            if (conversation.history.length === 0 && tokens >= max) throw new GPTGenerationError({
                type: GPTGenerationErrorType.Length
            });
            
            /* If the prompt is too long, remove the oldest history entry & try again. */
            if (max - tokens < 150) conversation.history.shift();
            else break;
        } while (!isPromptLengthAcceptable(prompt, max) || max - tokens < 150);

        return {
            content: prompt,
            max: Math.max(Math.min(max - tokens, max), 150)
        };
    }

    /**
     * Make the actual call to the OpenAI API, to generate a response for the given prompt.
     * This always concatenates the history & starting prompt.
     * 
     * @param options Generation options
     * @returns Returned BingGPT response
     */
    private async complete(options: BingGenerationOptions & GPTCompleteOptions, progress?: (response: OpenAICompletionsJSON) => Promise<void> | void): Promise<OpenAICompletionsData | null> {
        /* Construct the formatted GPT-3 prompt. */
        const prompt: PromptData = this.prompt(options, this.session.manager.get(options.conversation.user)!);

        /* Make the actual request. */
        const data: OpenAICompletionsData = await this.session.ai.complete({
            model: Models.Generation,

            max_tokens: prompt.max,
            temperature: 0.7,
            stream: true,

            stop: [ "User:", "Results:" ],
            logit_bias: BannedTokens,
            prompt: prompt.content
        }, progress);

        /* If the generated response is empty, return nothing. */
        if (data.response.text.trim().length === 0) return null;

        return {
            ...data,
            response: {
                finish_reason: data.response.finish_reason,
                text: data.response.text.trim()
            }
        };
    }

    /**
     * Get a list of suggested search queries, if applicable, for the specified prompt.
     * @param options Generation options
     * 
     * @returns If applicable, search queries to use
     */
    private async searchQueries(options: BingGenerationOptions): Promise<string[] | null> {
        /* Prompt to pass to the model */
        const prompt: string = `${options.conversation.history.slice(-1).map(entry => `User: ${entry.input}\nBing: ${entry.output.message.text}`).join("\n")}\n\nUser: ${options.prompt}`;

        /* Make the actual request. */
        const data: OpenAICompletionsData = await this.session.ai.complete({
            /* Fine-tuned search query generator model */
            model: Models.Generation,

            temperature: 0.7,
            max_tokens: 150,
            stream: true,

            stop: [ "\n" ],
            prompt: `${Prompts.SearchQueries}\n\n${prompt}\n\nQueries: `
        });

        const text: string = data.response.text.trim();

        /* Whether the generated text actually has results */
        const hasResults: boolean = !text.startsWith("N") && text.split("|").length > 0;
        if (!hasResults) return null;
        
        let results: string[] = hasResults ? text
            .split("|")
            .map(query => query.trim().replaceAll('"', '').replaceAll('+', ' ').toLowerCase().replaceAll("2021", "2023"))
            .filter(query => query.length > 0)
            .slice(undefined, 3) : [];

        return results.length > 0 ? results : null;
    }

    /**
     * Get a list of suggested responses for the specified reply.
     * @param options Generation options
     * 
     * @returns If applicable, search queries to use
     */
    private async suggestions(reply: string, options: BingGenerationOptions): Promise<GPTSuggestedResponse[]> {
        const prompt: string = `${options.conversation.history.slice(-1).map(entry => `User: ${entry.input}\nBing: ${entry.output.message.text}`).join("\n")}${options.conversation.history.length > 0 ? "\n\n" : ""}User: ${options.prompt}\nBing: ${reply}`;

        /* Make the actual request. */
        const data: OpenAICompletionsData = await this.session.ai.complete({
            /* Fine-tuned follow up suggestion generator model */
            model: Models.Generation,

            temperature: 0.8,
            max_tokens: 150,
            stream: true,

            stop: [ "Bing:", "User:" ],
            prompt: `${Prompts.Suggestions}\n\n${prompt}\n\nSuggestions:`
        });

        const text: string = data.response.text.trim();

        const suggestions: GPTSuggestedResponse[] = text
            .split("|")
            .map(query => ({
                text: query.trim().replaceAll('"', '')
            }))
            .filter(query => query.text.length > 0)
            .slice(undefined, 3);

        return suggestions;
    }

    /**
     * Interrogate the attached Discord image.
     * @param options Generation options + Discord attachment
     * 
     * @returns Interrogated image
     */
    private async interrogate(options: BingGenerationOptions & { attachment: Attachment }): Promise<GPTAttachment> {
        /* Get the interrogation model. */
        const model = await this.session.manager.bot.replicate.api.models.get("salesforce/blip");

        /* Run the interrogation request, R.I.P money. */
        const prediction = await model.predict({
            image: options.attachment.attachment,

            caption: true,
            question: "",
            context: "",
            use_nucleus_sampling: false,
            temperature: 1
        });

        return {
            description: prediction.replace("Caption: ", "")
        };
    }

    /**
     * Generate an image using Stable Diffusion for a prompt.
     * @param options Generation options + SD prompt
     * 
     * @returns URL of generated image 
     */
    private async generateImage(options: BingGenerationOptions & { prompt: string }): Promise<GPTGeneratedImage> {
        /* Get the interrogation model. */
        const model = await this.session.manager.bot.replicate.api.models.get("stability-ai/stable-diffusion");

        /* Run the Stable Diffusion generation request, R.I.P money. */
        const prediction = await model.predict({
            prompt: options.prompt,

            /* Other settings */
            image_dimensions: "512x512",
            num_outputs: 1,
            num_inference_steps: 50,
            guidance_scale: 7.5,
            scheduler: "DPMSolverMultistep"
        });

        return {
            prompt: options.prompt,
            url: prediction[0]
        };
    }

    /**
     * Ask a prompt or question to Sydney, using the GPT-3 API.
     * @param options Generation options
     * 
     * @throws An error, if something went wrong
     * @returns Sydney's generated response
     */
    public async ask({ progress, conversation, prompt, trigger }: BingGenerationOptions): Promise<ResponseMessage> {
        /* Random message identifier */
        const id: string = randomUUID();

        /* Get all image attachments of the message. */
        const messageAttachments: Attachment[] = this.attachments(trigger);
        const attachments: GPTAttachment[] = [];

        if (messageAttachments.length > 0) {
            for (const attachment of messageAttachments) {
                progress({
                    id: id,
                    type: "Notice",
                    sources: [],
                    suggestions: [],
                    attachments: [],
                    queries: null,
                    images: [],
                    raw: null,
                    text: `Looking at image **\`${attachment.name}\`**`
                });

                /* Interrogate the image and get a detailed description about it. */
                const result: GPTAttachment = await this.interrogate({ progress, conversation, prompt, trigger, attachment });
                attachments.push(result);
            }
        }
        
        /* Get possible search results for the user's query. */
        const searchQueries: string[] | null = messageAttachments.length === 0 ? await this.searchQueries({ progress, conversation, prompt, trigger }) : null;
        const sourceCollection: Collection<string, SourceAttribution> = new Collection();

        /* Search up the search queries on DuckDuckGo. */
        if (searchQueries !== null) for (const query of searchQueries) {
            progress({
                id: id,
                type: "Notice",
                sources: [],
                suggestions: [],
                attachments: [],
                queries: null,
                images: [],
                raw: null,
                text: `Searching for **\`${query}\`**`
            });

            /* Search for search results on DuckDuckGo. */
            const searchResults: SearchResult[] = await search({
                query: query,
                amount: 1
            });

            for (const result of searchResults) {
                sourceCollection.set(result.title, {
                    ...result,
                    query
                });
            }
        }

        const sources: SourceAttribution[] = Array.from(sourceCollection.values());

        /* On-progress handler, to generate the message on the fly. */
        const onGenerationProgress = (response: OpenAICompletionsJSON) => {
            progress({
                id: id,
                type: "Chat",
                sources: sources,
                suggestions: [],
                attachments: attachments,
                queries: null,
                images: [],
                raw: response.choices[0],
                text: response.choices[0].text
            });
        };

        /* Generate the first response by BingGPT. */
        const data: OpenAICompletionsData | null = await this.complete({
            progress, conversation, prompt, trigger, images: attachments,
            results: sources.length > 0 ? sources : null
        }, onGenerationProgress);

        /* If the response is empty, throw a generation error. */
        if (data === null) throw new GPTGenerationError({
            type: GPTGenerationErrorType.Empty
        });

        /* Generated response content */
        let response: string = data.response.text;

        /* Try to extract the original response and the actual image generation prompt from the generated response. */
        const [ original, generationPrompt ] = response.split("GEN_IMG=");
        const images: GPTGeneratedImage[] = [];

        response = original;

        /* If the response contains an image generation request, try to generate the image. */
        if (generationPrompt !== undefined) {
            progress({
                id: id,
                type: "ChatNotice",
                sources: sources,
                suggestions: [],
                attachments: attachments,
                queries: null,
                images: [],
                raw: null,
                notice: "*Generating the image*",
                text: response
            } as ChatNoticeMessage);

            /* Try to generate the image. */
            const generated: GPTGeneratedImage = await this.generateImage({ progress, conversation, trigger, prompt: generationPrompt.toLowerCase() })
            images.push(generated);
        }

        /* Get a list of suggested responses by the user for the generated message. */
        const suggestions: GPTSuggestedResponse[] = await this.suggestions(response, { progress, conversation, prompt, trigger });
        
        return {
            id: id,
            type: "Chat",
            queries: searchQueries,
            sources: sources.length > 0 ? sources : null,
            raw: data.response,

            suggestions: suggestions.map(suggestion => ({
                type: "Suggestion",
                text: suggestion.text
            })),

            attachments: attachments,
            images: images,
            text: response
        };
    }

    /**
     * Get all usable Discord attachments in a message.
     * 
     * @param message Discord message
     * @returns All usable attachments
     */
    private attachments(message: Message): Attachment[] {
        return Array.from(message.attachments.values())
            .filter(attachment => attachment.name!.endsWith(".png") || attachment.name!.endsWith(".jpg") || attachment.name!.endsWith(".jpeg") || attachment.name!.endsWith(".webp"))
            .slice(undefined, 1);
    }
}