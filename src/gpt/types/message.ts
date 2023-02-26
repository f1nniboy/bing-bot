import { OpenAICompletionResponse, OpenAICompletionsJSON } from "../../openai/types/completions.js";

export interface SourceAttribution {
	description: string;
	query: string;
	title: string;
	url: string;
}

export interface GPTAttachment {
    description: string;
}

export interface GPTGeneratedImage {
	prompt: string;
	url: string;
}

interface BaseMessage {
	text: string;
	type: "Notice" | "ChatNotice" | "Chat" | "Suggestion";
}

type UserMessage = BaseMessage & {
	messageType: "Chat"
}

type SuggestedResponse = BaseMessage & {
	type: "Suggestion";
}

export type ResponseMessage = BaseMessage & {
	sources: SourceAttribution[] | null;
	suggestions: SuggestedResponse[];
	attachments: GPTAttachment[];
	images: GPTGeneratedImage[];
	queries: string[] | null;
	id: string;
	raw: OpenAICompletionResponse | null;
}

export type ChatNoticeMessage = ResponseMessage & {
	type: "ChatNotice";
	notice: string;
}

export interface SerializedMessage {
	input: string;
	output: string;
}

export default UserMessage;
