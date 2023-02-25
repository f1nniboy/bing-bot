/* Type of the ChatGPT exception */
export enum GPTErrorType {
    /**
     * An error occured during the generation of a response, which might be because
     * 
     * - the API key got rate-limited by OpenAI,
     * - the OpenAI servers are over-loaded,
     * - the API key ran out of credits & is over the usage limit
     */
    Generation = "Generation",

    /** An error occured with another API request, e.g. /moderation or /models */
    API = "API",

    /** Any other miscillaneous error occured */
    Other = "Other"
}

/** Extended data of the error */
export type GPTErrorData<T> = T;

export interface GPTErrorOptions<T> {
    /** Which type of error occured */
    type: GPTErrorType;

    /** Data of the error message */
    data: GPTErrorData<T>;
}

export class GPTError<T> extends Error {
    /** Information about the thrown error */
    public options: GPTErrorOptions<T>;

    constructor(opts: GPTErrorOptions<T>) {
        super();
        this.options = opts;
    }

    /**
     * Convert the error into a readable error message.
     * @returns Human-readable error message
     */
    public toString(): string {
        return "GPT error";
    }
}