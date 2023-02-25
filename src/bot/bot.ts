import { basename, Client, GatewayIntentBits, Partials } from "discord.js";
import { parentPort } from "worker_threads";
import chalk from "chalk";

import { ConversationManager } from "../conversation/manager.js";
import { ReplicateManager } from "../gpt/utils/replicate.js";
import { CommandManager } from "../command/manager.js";
import { OpenAIManager } from "../openai/openai.js";
import { DatabaseManager } from "../db/manager.js";
import { ShardLogger } from "../util/logger.js";
import { Event } from "../event/event.js";
import { Utils } from "../util/utils.js";
import { StrippedApp } from "../app.js";
import { BotData } from "./manager.js";

export class Bot {
    /* Stripped-down app data */
    public app: StrippedApp;

    /* Data about this shard */
    public data: BotData;

    /* Logger instance, for the shard */
    public readonly logger: ShardLogger;

    /* Command manager, in charge of registering commands & handling interactions */
    public readonly command: CommandManager;

    /* Database manager, in charge of managing the database connection & updates */
    public readonly db: DatabaseManager;

    /* OpenAI manager, in charge of moderation endpoint requests */
    public readonly ai: OpenAIManager;

    /* Conversation & session manager, in charge of managing Microsoft sessions & conversations with the bot */
    public readonly conversation: ConversationManager;

    /* Replicate API manager - used for CLIP & image generation */
    public readonly replicate: ReplicateManager;

    /* Discord client */
    public readonly client: Client;

    constructor() {
        this.data = null!;
        this.app = null!;

        /* Set up various classes & services. */
        this.conversation = new ConversationManager(this);
        this.replicate = new ReplicateManager(this);
        this.command = new CommandManager(this);
        this.logger = new ShardLogger(this);
        this.db = new DatabaseManager(this);
        this.ai = new OpenAIManager(this);
        
        
        this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.DirectMessages
			],

			partials: [
				Partials.Channel,
				Partials.Message
			],

			/* Make it seem like the bot is running on a phone. */
			ws: {
				properties: {
					browser: "Discord iOS"
				}
			},
        });
    }

    /**
     * Wait for the bot manager to send the StrippedApp data to this child process.
     * @returns Stripped app data
     */
    private async waitForData(): Promise<void> {
        return new Promise(resolve => {
            /* Wait for a message to get sent to the process. */
            parentPort!.once("message", (message: unknown) => {
                /* As this is the only data ever sent to the process, simply parse everything as stripped app data. */
                const data: BotData = message as BotData;

                this.app = data.app;
                this.data = data;

                resolve();
            });
        })
    }

    /**
     * Set up the Discord client & all related services.
     */
    public async setup(): Promise<void> {
        /* Wait for the app data. */
        await this.waitForData()
            .catch(() => this.stop(1));

        /* Set up the OpenAI request manager. */
        await this.ai.setup(this.app.config.openai.key)
            .catch((error: Error) => {
                this.logger.error(`Failed to set up OpenAI manager -> ${chalk.bold(error.message)}`);
                this.stop(1);
            });

		/* Load all the commands. */
        await this.command.loadAll()
            .catch((error: Error) => {
                this.logger.error(`Failed to load commands -> ${chalk.bold(error.message)}`);
                this.stop(1);
            });

        /* Register the commands, if they have loaded successfully and if the current shard is the first shard in the list. . */
        if (this.data.id === 0) {
            this.command.register()
                .catch((error: Error) => {
                    this.logger.error(`Failed to register commands -> ${chalk.bold(error.message)}`);
                    this.stop(1);
                });
        }

		/* Load the events. */
		await Utils.search("./build/events", "js")
			.then(files => files.forEach(path => {
				import(path)
					.then((data: { [key: string]: Event }) => {
						const event: Event = new (data.default as any)(this);
						this.client.on(event.name, (...args: any[]) => event.run(...args));
					})
					.catch(error => {
						this.logger.warn(`Failed to load event ${chalk.bold(basename(path).split(".")[0])} -> ${chalk.bold(error.message)}`);
					});
			}))
			.catch(error => {
				this.logger.error(`Failed to load events -> ${chalk.bold(error.message)}`);
				this.stop(1);
			});

        /* Connect to the Supabase database. */
        await this.db.setup()
            .catch((error: Error) => {
                this.logger.error(`Failed to set up the database -> ${chalk.bold(error.message)}`);
                this.stop(1);
            });

		/* Set up the Replicate API manager. */
		await this.replicate.setup()
			.catch(error => {
				this.logger.error(`Failed to set up Replicate API -> ${chalk.bold(error.message)}`);
				this.stop(1);
			});

		/* Set up the sessions. */
		await this.conversation.setup()
			.catch(error => {
				this.logger.error(`Failed to set up sessions -> ${chalk.bold(error.message)}`);
				this.stop(1);
			});

        /* Log into Discord with the bot. */
        await this.client.login(this.app.config.discord.token)
            .catch(error => {
                this.logger.error(`Failed to log into to Discord -> ${chalk.bold(error.message)}`);
                this.stop(1);
            });

        this.logger.info(`Started on ${chalk.bold(this.client.user!.tag)}.`);
    }

    public stop(code: number = 0): never {
        if (code === 0) this.logger.debug("Stopped.");
        else this.logger.error("An unexpected error occured, stopping shard.");

        process.exit(code);
    }
}

/* Initialize this bot class. */
const bot: Bot = new Bot();
bot.setup();