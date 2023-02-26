import { Snowflake } from "discord.js";

import { ChatCredentials } from "./conversation/session.js";

export interface ConfigDiscordChannel {
    /* ID of the guild */
    guild: Snowflake;

    /* ID of the forum channel */
    channel: Snowflake;
}

export interface Config {
	/* Token of the Discord bot */
	discord: {
		token: string;
		id: Snowflake;

		/* ID of the bot owner */
		owner: Snowflake;
	};

	/* How many shards to allocate for the bot */
	shards: number | string | "auto";

	/* Whether messages should be collected in the database */
	collectMessages: boolean;

	/* Various credentials for the bot */
	credentials: ChatCredentials[];

	channels: {
		/* Where the error messages should be sent; which guild and channel */
		error: ConfigDiscordChannel;
	};

	/* OpenAI API information */
	openai: {
		/* API key */
		key: string;
	};

	/* Replicate API information */
	replicate: {
		/* API key */
		key: string;
	};

	/* Supabase database information */
	database: {
		url: string;
		key: string;
	};
}