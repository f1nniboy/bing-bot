import { GPTError, GPTErrorType } from "./base.js";

export enum GPTGenerationErrorType {
    /* The Microsoft account got rate-limited */
    RateLimit,

    /* The account is unusable */
    SessionUnusable,

    /* No session is available at the moment */
    NoFreeSessions,

    /* The conversation could not be created properly */
    Conversation,

    /* The response was empty */
    Empty,

    /* The prompt was too long */
    Length,

    /* An other error occured */
    Other
}

type GPTGenerationErrorOptions = {
    /** Which type of error occured */
    type: GPTGenerationErrorType;

    /** The exception thrown by the API library */
    cause?: Error;
}

export class GPTGenerationError extends GPTError<GPTGenerationErrorOptions> {
    constructor(opts: GPTGenerationErrorOptions) {
        super({
            type: GPTErrorType.Generation,
            data: opts
        });
    }

    /**
     * Convert the error into a readable error message.
     * @returns Human-readable error message
     */
    public toString(): string {
        return `Failed to generate Bing response with code ${GPTGenerationErrorType[this.options.data.type]}${this.options.data.cause ? ": " + this.options.data.cause.toString() : ""}`;
    }
}