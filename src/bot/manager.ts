import { Collection, Shard, ShardingManager } from "discord.js";
import { EventEmitter } from "node:events";
import chalk from "chalk";

import { App, StrippedApp } from "../app.js";
import { Bot } from "./bot.js";

export interface BotData {
    /* Stripped-down app information */
    app: StrippedApp;
    
    /* Shard identifier */
    id: number;
}

export declare interface BotManager {
    on(event: "create", listener: (bot: Bot) => void): this;
}

export class BotManager extends EventEmitter {
    private readonly app: App;

    /* Discord sharding manager */
    private sharding: ShardingManager | null;

    /* Collection of active shards */
    public shards: Collection<number, Shard>;

    constructor(app: App) {
        super();
        this.app = app;

        /* Initialize the sharding manager. */
        this.shards = new Collection();
        this.sharding = null;
    }

    /**
     * Internal event, called when a shard child process dies
     * 
     * @param shard Shard that exited
     * @param worker Worker / child process that exited
     */
    private async onError(shard: Shard, error: Error): Promise<void> {
        this.app.logger.error(`Shard ${chalk.bold(`#${shard.id}`)} experienced an error ->`, error);
        //this.app.stop(1);
    }

    /**
     * Internal event, called when a shard gets initialized
     * @param shard Shard that was started
     */
    private async onCreate(shard: Shard): Promise<void> {
        /* Wait for the shard to get launched, before we proceed. */
        await new Promise<void>(resolve => shard.on("spawn", () => resolve()));

        /* Catch the exit of the shard child process. */
        shard.worker!.on("error", error => this.onError(shard, error));

        /* Send all necessary data to the shard worker. */
        await shard.send({
            app: this.app.strip(),
            id: shard.id
        } as BotData);
    }

    /**
     * Set up the sharding manager.
     */
    public async setup(): Promise<void> {
        const now: number = Date.now();

        /* Initialize the sharding manager. */
        this.sharding = new ShardingManager("build/bot/bot.js", {
            totalShards: this.app.config.shards as number | "auto",
            token: this.app.config.discord.token,
            mode: "worker",
            respawn: true
        })

        /* Set up event handling. */
        this.sharding.on("shardCreate", (shard) => this.onCreate(shard));

        /* Launch the actual sharding manager. */
        await this.sharding.spawn({
            /* Reduce the delay between the initialization of shards, to improve startup time. */
            delay: 1
        })
            .then(shards => this.shards = shards)
			.catch(error => {
				this.app.logger.error(`Failed to set up sharding manager -> ${chalk.bold(error.message)}`);
				this.app.stop(1);
			});

        /* Calculate, how long it took to start all shards. */
        const time: number = Date.now() - now;

        this.app.logger.debug(`It took ${chalk.bold(`${(time / 1000).toFixed(2)}s`)} for ${`${chalk.bold(this.shards.size)} shard${this.shards.size > 1 ? "s" : ""}`} to be initialized.`);
        this.app.logger.info("Up n' running!");
    }
}