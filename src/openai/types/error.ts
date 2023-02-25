export type OpenAIErrorType = "insufficient_quota" | "invalid_request_error" | "server_error";

export interface OpenAIErrorData {
    error: {
        /* Informative error message */
        message: string;

        /* Type of the error */
        type: OpenAIErrorType;
        
        /* TODO: Figure out what these fields do */
        param: null;
        code: null;
    }
}