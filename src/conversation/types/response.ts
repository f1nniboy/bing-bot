import { ResponseMessage } from "../../gpt/types/message.js";

export interface ChatResponse {
    /* Identifier of the response message */
    id: string;

    /* Generated response message */
    message: ResponseMessage;
}