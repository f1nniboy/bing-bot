import { Message, ThreadChannel, User } from "discord.js";

/**
 * Get the assigned owner of a thread.
 * @param thread Thread to parse
 * 
 * @returns Assigned Discord user, `null` if invalid
 */
export const ownerOfThread = async (thread: ThreadChannel): Promise<User | null> => {
    /* Get the initial message in the thread. */
    const starter: Message | null = await thread.fetchStarterMessage();
    if (starter === null) return null;

    if (starter.mentions.users.size === 0) return null;
    return Array.from(starter.mentions.users.values())[0];
}