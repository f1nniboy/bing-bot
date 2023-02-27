import { APIUser, Collection, Snowflake, ThreadChannel, User } from "discord.js";

import { GPTGenerationError, GPTGenerationErrorType } from "../error/gpt/generation.js";
import { Conversation } from "./conversation.js";
import { Generator } from "./generator.js";
import { Session } from "./session.js";
import { Bot } from "../bot/bot.js";

/* Manager in charge of managing all conversations */
export class ConversationManager {
    public readonly bot: Bot;

    /* List of available sessions */
    public readonly sessions: Collection<string, Session>;

    /* List of currently running conversations */
    public readonly conversations: Collection<Snowflake, Conversation>;

    /* Response generator; used for handling Discord messages */
    public readonly generator: Generator;

    /* Whether the conversation manager was fully initialized */
    public active: boolean;

    constructor(bot: Bot) {
        this.bot = bot;
        this.active = false;

        /* Create the Discord message generator. */
        this.generator = new Generator(this.bot);
        
        /* Initialize the lists with empty values. */
        this.conversations = new Collection();
        this.sessions = new Collection();
    }

    /**
     * Set up the sessions.
     * @returns How many sessions were initialized
     */
    public async setup(): Promise<number> {
        await Promise.all(this.bot.app.config.credentials.filter(data => data.type === "openai").map(async credentials => {
            /* Create a new session. */
            const session: Session = new Session(this, credentials);
            this.sessions.set(session.id, session);

            /* Check whether the session has been disabled permanently in the database. */
            await session.disabled();
        }));

        this.active = true;
        return this.sessions.size;
    }

    /**
     * Shut down all of the sessions.
     */
    public async stop(): Promise<void> {
        const sessions: Session[] = Array.from(this.sessions.values());

        await Promise.all(sessions.map(async session => {
            /* Shut down the session. */
            await session.stop();

            /* Remove the session from the map. */
            this.sessions.delete(session.id);
        }));

        this.active = false;
    }

    /**
     * Create a new conversation for the specified Discord user, bound to the specified thread.
     * @param user Discord user to create a session for
     * 
     * @returns Newly-created session 
     */
    public async create(user: User): Promise<Conversation> {
        /* If the user already has a conversation, return it instead. */
        if (this.has(user)) return this.get(user)!;

        /* Create a new conversation. */
        this.conversations.set(user.id, new Conversation(this, await this.session(), user));
        return this.get(user)!;
    }

    /**
     * Get the currently-active session of a user, if they already have one.
     * @param user User to get the session of
     * 
     * @returns Currentlly-active session, or `null` if none exists
     */
    public get(user: User | APIUser | string): Conversation | null {
        return this.conversations.get(typeof user === "string" ? user : user.id) ?? null;
    }

    /**
     * Check whether a user already has a session running.
     * @param user User to check for
     * 
     * @returns Whether the user already has a session running
     */
    public has(user: User): boolean {
        return this.conversations.get(user.id) != undefined && this.conversations.get(user.id)!.active;
    }

    /**
     * Get a free & low-loaded session to use.
     * @param sessions Pre-generated list of free sessions, to improve performance
     * 
     * @returns The session
     */
    public async session(sessions?: Session[]): Promise<Session> {
        /* List of available sessions */
        let list: Session[] = sessions ?? await this.freeSessions();

        /* If all of the sessions are busy, throw an exception. */
        if (list.length === 0) throw new GPTGenerationError({
            type: GPTGenerationErrorType.NoFreeSessions
        });

        /* Whether no session has an active conversation yet; meaning that the application has just been started */
        const fresh: boolean = list.every(
            session => this.conversations.filter(conversation => conversation.session.id === session.id).size === 0
        );

        /* Use the least-active session from the list, if some of them are already being used.
           If no sessions are being used yet, choose a random one. */
        const session: Session = fresh ? list[Math.floor(Math.random() * list.length)] : list[list.length - 1];
        return session;
    }


    /**
     * Get a list of non-rate-limited and low-load sessions.
     * @returns The sorted sessions
     */
    public async freeSessions(): Promise<Session[]> {
        /* List of available sessions */
        let list: Session[] = Array.from(this.sessions.values());

        /* Sort the list of available sessions by amount of active conversations. */
        list = list.sort((a, b) => {
            const countA: number = this.conversations.filter(conversation => conversation.session.id === a.id).size;
            const countB: number = this.conversations.filter(conversation => conversation.session.id === b.id).size;

            return countB - countA;
        });

        /* Fetch the disabled status of the sessions. */
        await Promise.all(
            list.map(
                async session => session.disabled()
            )
        );

        /* Remove all currently locked & rate-limited sessions from the array. */
        list = list.filter(session => session.usable);
        return list;
    }}