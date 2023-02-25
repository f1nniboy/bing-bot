import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { Database } from "./types/db.js";
import { Bot } from "../bot/bot.js";

export class DatabaseManager {
    private readonly bot: Bot;

    /* Supabase client */
    public client: SupabaseClient<Database>;

    constructor(bot: Bot) {
        this.bot = bot;

        /* Temporarily disable the Supabase client, we'll create it later. */
        this.client = null!;
    }

    /**
     * Initialize the database manager & client.
     */
    public async setup(): Promise<void> {
        /* Supabase credentials */
        const { url, key } = this.bot.data.app.config.database;

        /* Create the Supabase client. */
        this.client = createClient<Database>(url, key);
    }
}