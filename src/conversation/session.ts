import { Message } from "discord.js";
import md5 from "md5";

import { ResponseMessage } from "../gpt/types/message.js";
import { OpenAIManager } from "../openai/openai.js";
import { ConversationManager } from "./manager.js";
import { ChatResponse } from "./types/response.js";
import { GPTAPIError } from "../error/gpt/api.js";
import { Conversation } from "./conversation.js";
import { Utils } from "../util/utils.js";
import { chips } from "./utils/chips.js";
import { BingGPT } from "../gpt/gpt.js";

import { GPTGenerationErrorType } from "../error/gpt/generation.js";
import { GPTGenerationError } from "../error/gpt/generation.js";

export interface ChatCredentials {
    type: string;
    token: string;
}

export enum StopState {
    /* Normal shutdown of the session */
    Normal,

    /* Disable the session for the entire run-time of the application */
    Permanent
}

export enum SessionState {
    /* The session is active */
    Running,
    
    /* The session has not been initialized yet */
    Inactive,

    /* The session has been disabled for the run-time of the bot */
    Disabled
}

interface SessionDebugData {
    /* How many messages were generated in this session */
    count: number;

    /* Total response generation time, in milliseconds */
    duration: number;
}

/* Message generation options */
export interface GenerationOptions {
    /* Conversation to use */
    conversation: Conversation;

    /* Discord message that invoked the generation */
    trigger: Message;

    /* Function to call on message updates */
    onProgress: (message: ResponseMessage) => Promise<void> | void;

    /* Prompt to use for generation */
    prompt: string;
}

/* Bing API error data */
interface BingErrorData {
    error: {
        message: string;
        code: string;
    };
}

export class Session {
    /* Manager in charge of controlling this conversation */
    public readonly manager: ConversationManager;

    /* Bing Sydney client */
    public readonly client: BingGPT; //SydneyClient;

    /* OpenAI manager */
    public readonly ai: OpenAIManager;

    /* Credentials used for logging in */
    public readonly credentials: ChatCredentials;

    /* Whether the client is active & authenticated */
    public state: SessionState;

    /* Whether the client is locked, because it is initializing or shutting down */
    public locked: boolean;

    /* Whether the client is currently generating a response */
    public generating: boolean;

    /* Various debug data about this session */
    public debug: SessionDebugData;

    constructor(manager: ConversationManager, credentials: ChatCredentials) {
        this.manager = manager;
        this.credentials = credentials;

        /* Create a new OpenAI manager for the Bing client. */
        this.ai = new OpenAIManager(this.manager.bot);

        /* Set up the Sydney client. */
        this.client = new BingGPT(this);

        /* Set up some default values. */
        this.state = SessionState.Inactive;
        this.generating = false;
        this.locked = false;
        
        this.debug = {
            count: 0,
            duration: 0
        };
    }

    public async sessionData() {
		const { data } = await this.manager.bot.db.client
			.from("sessions")
			.select("*")
			
			.eq("id", this.id)
			.single();

		return data;
    }

    /**
     * Check whether this session has been disabled. 
     * @returns Whether the session is disabled
     */
    public async disabled(): Promise<boolean> {
        if (this.state === SessionState.Disabled) return true;

        /* First, get information about the session in the database. */
        const cached = await this.sessionData();

        if (cached !== null && !cached.active) await this.stop(StopState.Permanent);
        return cached !== null && !cached.active;
    }

    /**
     * Set up the session and log in using the given credentials in the configuration.
     * @throws An exception, if the initialization failed
     */
    public async init(): Promise<void> {
        /* First, get information about the session in the database. */
        const disabled = await this.disabled();
        if (disabled) throw new Error("Session has been disabled permanently");

        /* If the session was disabled because of insufficient credits, throw an error. */
        if (this.state === SessionState.Disabled) throw new Error("Session has been disabled permanently");

        /* If the session has already been initialized; don't do anything. */
        if (this.active) return;

        /* If the conversation has been locked, don't initialize the session. */
        if (this.locked) throw new Error("Session is busy");
        this.locked = true;

        /* Update the status of the session in the database. */
        await this.manager.bot.db.client
            .from("sessions")

            .upsert({
                id: this.id,
                active: true
            }, {
				onConflict: "id"
			});

        /* Initialize the OpenAI manager. */
        await this.ai.setup(this.credentials.token);

        this.locked = false;
        this.state = SessionState.Running;
    }

    /**
     * Shut down the session & make it unusable.
     * @param permanent Whether to disable the session for the entire run-time of the bot
     */
    public async stop(status: StopState = StopState.Normal): Promise<void> {
        this.locked = true;

        switch (status) {
            case StopState.Permanent:
                //this.manager.bot.logger.debug(`Session ${chalk.bold(this.id)} has been disabled permanently.`);
                this.state = SessionState.Disabled;

                /* Update the session entry in the database too. */
                await this.manager.bot.db.client
                    .from("sessions")
                    .update({ active: false })
                    .eq("id", this.id);

                break;

            case StopState.Normal:
                this.state = SessionState.Inactive;
                break;
        }

        this.locked = false;
    }

    /**
     * Extract the error from a failed request, and generate a corresponding GPTAPIError exception.
     * @param response Failed HTTP request
     * 
     * @returns GPT API error class
     */
    private async error(response: Response): Promise<GPTAPIError> {
        /* Error data */
        let body: BingErrorData | null = null;

        /* Try to parse the given error data in the response. */
        try {
            body = await response.json() as BingErrorData;
        } catch (error ) {
            body = null;
        }

        return new GPTAPIError({
            endpoint: response.url,
            code: response.status,
            id: body != null && body.error ? body.error.code : null,
            message: body !== null && body.error ? body.error.message : null
        });
    }

    /**
     * Get a list of suggestions for initial starting prompts.
     * @param count How many suggestions to fetch
     * 
     * @returns Array of initial prompt suggestions
     */
    public suggestions(count: number = 3): string[] {
        const shuffled: string[] = Utils.shuffle(chips);
        return shuffled.slice(undefined, count);
    }

    /**
     * Generate Sydney's response for the specified prompt.
     * @param options Generation options 
     * 
     * @throws Any exception that may occur
     * @returns Given chat response
     */
    public async generate({ prompt, conversation, onProgress, trigger }: GenerationOptions): Promise<ChatResponse> {
        if (this.state === SessionState.Disabled) throw new GPTGenerationError({
            type: GPTGenerationErrorType.SessionUnusable
        });

        /* If someone tries to generate something during initialization, throw an exception. */
        if (!this.active) throw new Error("Session is still starting");

        /* If the session is locked, throw an exception. */
        if (this.locked) throw new Error("Session is busy");
        
        try {
            this.generating = true;

            /* Send the request to Bing, to complete the prompt. */
            const data = await this.client.ask({
                progress: onProgress,
                conversation,
                trigger,
                prompt
            });

            this.debug.count++;

            return {
                id: data.id,
                message: data
            };

        } catch (error) {
            throw error;

        } finally {
            this.generating = false;
        }
    }

    /* Unique identifier of the session */
    public get id(): string {
        return md5(this.credentials.token);
    }

    public get active(): boolean {
        return this.state === SessionState.Running;
    }

    /* Whether the session can be deemed usable */
    public get usable(): boolean {
        return !this.locked && this.state !== SessionState.Disabled;
    }
}