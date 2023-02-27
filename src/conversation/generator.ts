import { ActionRowBuilder, AttachmentBuilder, AttachmentPayload, ButtonBuilder, ButtonInteraction, ButtonStyle, channelLink, ChannelType, DMChannel, EmbedBuilder, Guild, GuildMember, JSONEncodable, Message, MessageCreateOptions, MessageEditOptions, PermissionFlagsBits, Snowflake, ThreadAutoArchiveDuration, ThreadChannel, User } from "discord.js";
import { randomUUID } from "crypto";

import { ChatNoticeMessage, ResponseMessage, SourceAttribution } from "../gpt/types/message.js";
import { ChatGeneratedInteraction, Conversation } from "./conversation.js";
import { check as moderate, ModerationResult } from "./moderation.js";
import { Response, ResponseType } from "../command/response.js";
import { CommandInteraction } from "../command/command.js";
import { toUpperNumbers } from "../util/formatting.js";
import { removeReaction } from "./utils/reaction.js";
import { format } from "../gpt/utils/formatter.js";
import { ownerOfThread } from "./utils/owner.js";
import { GPTError } from "../error/gpt/base.js";
import { randomEmoji } from "../util/emoji.js";
import { SessionState } from "./session.js";
import { Utils } from "../util/utils.js";
import { Bot } from "../bot/bot.js";

import { GPTGenerationError, GPTGenerationErrorType } from "../error/gpt/generation.js";
import { handleError } from "../util/moderation/error.js";
import { GPTAPIError } from "../error/gpt/api.js";

const BOT_REQUIRED_PERMISSIONS = {
	"Create Public Threads": PermissionFlagsBits.CreatePublicThreads,
	"Manage Threads": PermissionFlagsBits.ManageThreads,
	"Add Reactions": PermissionFlagsBits.AddReactions,
	"Use External Emojis": PermissionFlagsBits.UseExternalEmojis,
	"Send Messages": PermissionFlagsBits.SendMessages,
	"Read Message History": PermissionFlagsBits.ReadMessageHistory,
	"Attach Files": PermissionFlagsBits.AttachFiles,
	"Embed Links": PermissionFlagsBits.EmbedLinks
}

export interface GeneratorOptions {
	/* Discord message, which triggered the generation */
	message: Message;

	/* Content of the message */
	content: string;

	/* Author of the message */
	author: User;

	/* Whether a suggestion was used */
	usedSuggestion?: boolean;
}

export class Generator {
    /* Base class for everything */
    private bot: Bot;

    constructor(bot: Bot) {
        this.bot = bot;
    }

	/**
	 * Create a conversation thread from the specified command interaction.
	 * @param interaction Interaction, that invoked the creation of the thread
	 */
	public async create(interaction: CommandInteraction): Promise<Response> {
		/* If the invocation channel is not a text or news channel, don't try to create a thread. */
		if (interaction.channel!.type !== ChannelType.GuildText) {
			/* Parent channel of the thread, if the command was run in a thread */
			const parent: Snowflake | null = interaction.channel!.type === ChannelType.PublicThread ? (interaction.channel! as ThreadChannel).parentId : null;

			return new Response(ResponseType.Edit)
				.addEmbed(builder => builder
					.setDescription(`You can only start conversations with me in **text** channels${parent !== null ? `, like <#${parent}>` : ""} 😔`)
					.setColor("Red")
				);
		}

		/* Whether the user already has a conversation running */
		const existing: boolean = this.bot.conversation.get(interaction.user) !== null ? this.bot.conversation.get(interaction.user)!.active : false;

		/* If the user already has a running conversation, don't create one. */
		if (existing) {
			/* Get information about the existing conversation. */
			const { data } = await this.bot.db.client
				.from("conversations")
				.select("*")

				.eq("id", interaction.user.id)
				.single();

			/* If the conversation was not assigned to a specific thread yet, send a generic message. */
			if (data === null || data.guild === null || data.channel === null) return new Response(ResponseType.Edit)
				.addEmbed(builder => builder
					.setDescription(`You already have a running conversation 😔`)
					.setColor("Red")
				);

			/* Fetch information about the guild. */
			const guild: Guild = await this.bot.client.guilds.fetch(data.guild!);

			return new Response(ResponseType.Edit)
				.addEmbed(builder => builder
					.setDescription(`You already have a running conversation in **[${guild.name}](${channelLink(data.channel!, data.guild!)})** 😔`)
					.setColor("Yellow")
				);
		}

		/* Check whether the bot has sufficient permissions to execute this request. */
		const me: GuildMember = await interaction.guild!.members.fetchMe();
		const permissions = me.permissionsIn(interaction.channel!.id);

		/* Get a list of missing permissions. */
		const missing = Object.entries(BOT_REQUIRED_PERMISSIONS).filter(([ _, value ]) => !permissions.has(value));

		/* If some of the permissions are missing, send a message to the user. */
		if (missing.length > 0) {
			return new Response(ResponseType.Edit)
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription(`It seems like the permissions aren't set up correctly for me. Please contact a server administrator and tell them to update the following permissions:\n\n${missing.map(([ key, _ ]) => `· \`${key}\``).join("\n")}`)
					.setColor("Red")
				);
		}

		/* Fetch the deferred reply, in order to create a thread. */
		const reply = await interaction.fetchReply();

		/* Create & get the conversation for the user. */
		const conversation: Conversation = await this.bot.conversation.create(interaction.user);
		const cached = await conversation.cachedConversation();

		if (cached !== null && cached.guild !== null && cached.channel !== null) {
			/* Guild of the thread */
			let guild: Guild | null = this.bot.client.guilds.cache.get(cached.guild!) ?? null;

			/* If the guild is not available on this shard, show an error. */
			if (guild === null) {
				guild = await this.bot.client.guilds.fetch(cached.guild);

				return new Response(ResponseType.Edit)
					.addEmbed(builder => builder
						.setDescription(`You already have an active conversation in **${guild!.name}** 😔`)
						.setColor("Red")
					);
			}

			/* Try to find the originally assigned thread. */
			const thread: ThreadChannel | null = await this.bot.client.channels.fetch(cached.channel).catch(() => null) as ThreadChannel;
			
			/* If the thread still exists, try to go back to it. */
			if (thread !== null && guild !== null) {
				await conversation.from(thread);
				await conversation.init();

				return new Response(ResponseType.Edit)
					.addEmbed(builder => builder
						.setDescription(`You already have a running conversation in **[${guild!.name}](${channelLink(cached.channel!, cached.guild!)})** 😔`)
						.setColor("Yellow")
					);
			}
		}

		/* Start the thread conversation. */
		const thread: ThreadChannel = await reply.startThread({
			name: `${randomEmoji()} ${interaction.user.username}'s conversation`,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
			reason: "New Bing conversation created"
		});

		/* Try to Initialize the newly-created session. */
		try {
			/* If the session hasn't been initialized yet, start it up. */
			if (!conversation.session.active) await conversation.session.init();

			await conversation.init({ thread });

			/* Once the conversation was created, send initial suggestions to the thread. */
			await this.sendInitialSuggestions(conversation);

		} catch (error) {
			/* Delete the thread again, in case an error occured during the initialization. */
			await thread.delete();

			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.NoFreeSessions) return new Response(ResponseType.Edit)
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("We are currently dealing with *a lot* of traffic & are **not** able to process your message at this time 😔")
					.setFooter({ text: "Please try again later." })
					.setColor("Red")
				);

			throw error;
		}

		/* Add the user to the thread. */
		await thread.members.add(interaction.user);
		
		return new Response(ResponseType.Edit)
			.setContent(`<@${conversation.user.id}>`)
			.addEmbed(builder => builder
				.setDescription(`Hey <@${conversation.user.id}>, my name is **Bing**. 😊\n*To ask me anything, simply **mention** <@${this.bot.client.user!.id}> with your question in this **thread***.`)
				.setColor("Yellow")
			);
	}

	/**
	 * Process a partial or completed message by Bing into a readable & formatted Discord embed.
	 * @param data Response data
	 * 
	 * @returns Formatted Discord message
	 */
	public async process(conversation: Conversation, data: ResponseMessage, pending: boolean): Promise<Response | null> {
		/* If the message wasn't initialized yet, ignore this. */
		if (data === null) return null;

		/* If the received message type is related to searching, display it accordingly. */
		if (data.type === "Notice") {
			return new Response()
				.addEmbed(builder => builder
					.setDescription(`${data.text} **...** ⌛`)
					.setColor("Orange")
				);
		}

		/* Embeds to display in the message */
		const embeds: EmbedBuilder[] = [];

		/* Formatted generated response */
		let content: string = format(data.text).trim();

		/* Add a formatted sources embed for all given sources. */
		if (data.sources && data.sources.length > 0) {
			/* Sources that were actually used in the response */
			const used: SourceAttribution[] = [];

			/* Replace the original source references in the message with formatted ones. */
			data.sources
				.forEach((source, index) => {
					if (content.includes(`[^${index + 1}^]`)) used.push(source);
					content = content.replaceAll(`[^${index + 1}^]`, `${toUpperNumbers((index + 1).toString())}`);
				});

			const formatted: string = used
				.map((source, index) => `[${Utils.truncate(source.title.length > 0 ? source.title : source.url, 80)}](${source.url})**${toUpperNumbers((index + 1).toString())}**`)
				.join("\n");

			if (formatted.length > 0) embeds.push(new EmbedBuilder()
				.setDescription(formatted)
				.setColor("Orange")
			);
		}

		/* If the generated message finished due to reaching the token limit, show a notice. */
		if (!pending && data.raw && (data.raw.finish_reason === "length" || data.raw.finish_reason === "max_tokens")) {
			embeds.push(new EmbedBuilder()
				.setDescription(`*The message reached the length limit, and was not fully generated.*`)
				.setColor("Yellow")
			);
		}

		/* If the received data is a chat notice request, simply add the notice to the formatted message. */
		if (data.type === "ChatNotice") {
			embeds.push(new EmbedBuilder()
				.setDescription(`${(data as ChatNoticeMessage).notice} **...** ⌛`)
				.setColor("Orange")
			);
		}

		/* If the generated message generated any images using AI, display them accordingly. */
		if (data.images.length > 0) {
			for (const image of data.images) {
				embeds.push(new EmbedBuilder()
					.setFooter({ text: image.prompt })
					.setImage(image.url)
					.setColor("Purple")
				);
			}	
		}

		const response: Response = new Response();
		embeds.forEach(embed => response.addEmbed(embed));

		/* Add interaction buttons for the suggested responses provided by Bing. */
		if (data.suggestions && data.suggestions.length > 0 && !pending) {
			const buttons: ButtonBuilder[] = data.suggestions
				.map(suggested => new ButtonBuilder()
					.setLabel(Utils.truncate(suggested.text, 70))
					.setStyle(ButtonStyle.Primary)
					.setCustomId(randomUUID())
				);

			const row = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(buttons);

			response.addComponent(ActionRowBuilder<ButtonBuilder>, row)
		}

		const formatted: string = `${content} **...** ⌛`;

		/* If the message would be too long, send it as an attachment. */
		if (formatted.length > 2000) {
			response.addAttachment(new AttachmentBuilder(Buffer.from(content))
				.setName("output.txt"));

			response.setContent(pending ? "⌛" : "_ _");
		} else {
			/* Finally, set the actual content of the message. */
			response.setContent(pending ? formatted : content);
		}
		
		return response;
	}

	/**
	 * Handle interactions with the suggested response buttons on messages.
	 * @param button Button interaction to handle
	 */
	public async handleButtonInteraction(button: ButtonInteraction): Promise<void> {
		if (button.message.author.id !== this.bot.client.user!.id) return;

		/* Channel, the interaction occured in */
		const channel: ThreadChannel | null = button.channel!.type === ChannelType.PublicThread ? button.channel as ThreadChannel : null;
		if (channel === null) return void await button.deferUpdate();

		/* Get the assigned user of the thread. */
		const assignedUser: User | null = await ownerOfThread(channel);

		if (assignedUser === null) return void await button.deferUpdate();
		if (assignedUser.id !== button.user.id) return void await button.deferUpdate();

		/* Get the user's conversation. */
		const conversation: Conversation | null = this.bot.conversation.get(assignedUser);
		if (conversation === null) return void await button.deferUpdate();

		/* Remaining cool-down time */
		const remaining: number = (conversation.cooldown.state.startedAt! + conversation.cooldown.state.expiresIn!) - Date.now();

		/* If the command is on cool-down, don't run the request, if the user tried to use a suggested prompt. */
		if (conversation.cooldown.active && remaining > 0 && button.component.style !== ButtonStyle.Secondary) {
			return void await button.reply({
				embeds: [
					new EmbedBuilder()
						.setTitle("Whoa-whoa... slow down ⌛")
						.setDescription(`I'm sorry, but I can't keep up with your requests. You can speak to me again <t:${Math.floor((conversation.cooldown.state.startedAt! + conversation.cooldown.state.expiresIn! + 1000) / 1000)}:R>. 😔`)
						.setColor("Yellow")
				],

				ephemeral: true
			}).catch(() => {});
		}

		/* Original reply to the interaction */
		const reply: Message = button.message;
		const query: string = button.component.label!;

		/* If one of the suggestion buuttons was already chosen, ignore this request. */
		if (button.component.style === ButtonStyle.Success || button.component.disabled) return void await button.deferUpdate();

		const buttons: ButtonBuilder[] = (ActionRowBuilder.from(reply.components[0]) as ActionRowBuilder<ButtonBuilder>)
			.components

			.filter(component => component.toJSON().style === ButtonStyle.Primary)
			.map(component => {
				const label: string = component.toJSON().label!;
				const selected: boolean = label === query;

				return new ButtonBuilder()
					.setLabel(label)
					.setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary)
					.setDisabled(!selected)
					.setCustomId(randomUUID());
			});

		const row = new ActionRowBuilder<ButtonBuilder>()
			.addComponents(buttons);

		/* Update the original messages with the modified buttons. */
		await reply.edit({
			components: [ row ],
			embeds: reply.embeds,
			attachments: Array.from(reply.attachments.values()).map(data => data.toJSON() as JSONEncodable<AttachmentPayload>)
		});

		/* Display the button interaction as completed. */
		await button.deferUpdate();

		/* Try to perform the generation request - as normal. */
		await this.handle({
			message: reply,
			author: button.user,
			content: query,
			usedSuggestion: true
		});
	}

	/**
	 * Send initial suggestions given by the Bing API to the thread channel to use.
	 * @param conversation Conversation to send the suggestions to
	 */
	public async sendInitialSuggestions(conversation: Conversation): Promise<void> {
		/* Make sure that the conversation is set up correctly. */
		if (conversation.thread === null) return;

		/* Get a list of initial prompts. */
		const chips: string[] = conversation.session.suggestions(3);
		let buttons: ButtonBuilder[] = [];

		buttons = chips.map(suggestion => new ButtonBuilder()
			.setCustomId(randomUUID())
			.setStyle(ButtonStyle.Primary)
			.setLabel(suggestion)
		);

		const row = new ActionRowBuilder<ButtonBuilder>()
			.addComponents(buttons);

		/* Send the suggestions to the channel. */
		await conversation.thread.send(new Response()
			.addComponent(ActionRowBuilder<ButtonBuilder>, row)
			.addEmbed(builder => builder
				.setDescription("*Need some inspiration?*")
				.setColor("White")
			)
		.get() as MessageCreateOptions);
	}

    /**
     * Process the specified Discord message, and if it is valid, send a request to
     * GPT-3 to generate a response for the message content.
     * 
     * @param message Message to process
     * @param existing Message to edit, instead of sending a new reply
     */
    public async handle(options: GeneratorOptions): Promise<void> {
		const messageContent: string = options.content;
		const { message, author, usedSuggestion } = options;

		/* If the message was sent by a bot, or the bot wasn't mentioned in the message, return. */
		if (author.bot || (message.content !== messageContent ? false : !message.mentions.has(this.bot.client.user!, { ignoreEveryone: true }))) return;

		/* Clean up the message's content. */
		const content: string = Utils.cleanContent(this.bot, messageContent);

		/* If the user sen't an empty message, respond with the introduction message. */
		if (content.length === 0) {
			const row = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(
					new ButtonBuilder()
						.setURL(Utils.inviteLink(this.bot))
						.setLabel("Invite me to your server")
						.setStyle(ButtonStyle.Link)
				);

			return void await new Response()
				.addEmbed(builder => builder
					.setTitle("Hey there 👋")
					.setDescription(`Hey <@${author.id}>, my name is **Bing**. 😊`)
					.addFields([
						{
							name: "Completely free ✨",
							value: "No more dealing with long wait times to get accepted on the **waitlist** - you can simply talk with **Bing** directly on **Discord** - *for completely free*."
						},

						{
							name: "Conversations 💬",
							value: `To talk to **Bing**, simply create a thread using the \`/conversation\` command.\nThen, mention <@${this.bot.client.user!.id}> *in that thread* whenever you have a question. 👀`
						},

						{
							name: "... and more",
							value: "Add the bot to your Discord server or try it out here, to see for yourself. 😊"
						}
					])
					.setColor("Yellow")
				)
				.addComponent(ActionRowBuilder<ButtonBuilder>, row)
			.send(options.message).catch(() => {});
		}

		/* If the message was not sent in a thread, simply ignore it from now on. */
		if (message.channel.type !== ChannelType.PublicThread) return;

		/* Check if the message was sent in a thread, and if the thread was created by the bot. */
		const thread: ThreadChannel | null = (message.channel as ThreadChannel);
		if (thread === null || (thread !== null && thread.ownerId !== this.bot.client.user!.id)) return;
		
		/* Get the assigned user of the thread. */
		const assignedUser: User | null = await ownerOfThread(thread);
		if (assignedUser === null) return;

		/* Check whether the bot has sufficient permissions to execute this request. */
		try {
			const me: GuildMember = await message.guild!.members.fetchMe();
			const permissions = me.permissionsIn(message.channel.id);

			/* Get a list of missing permissions. */
			const missing = Object.entries(BOT_REQUIRED_PERMISSIONS).filter(([ _, value ]) => !permissions.has(value));

			if (missing.length > 0) {
				try {
					/* Create the DM channel, if it doesn't already exist. */
					const channel: DMChannel = await this.bot.client.users.createDM(author.id);
			
					await new Response()
						.addEmbed(builder => builder
							.setTitle("Uh-oh... 😬")
							.setDescription(`It seems like the permissions in <#${message.channel.id}> aren't set up correctly for the bot. Please contact a server administrator and tell them to update the following permissions:\n\n${missing.map(([ key, _ ]) => `· \`${key}\``).join("\n")}`)
							.setColor("Red")
						)
					.send(channel);
				} catch (error) {}

				return;
			}

		} catch (error) {}

		/* If the thread does not belong to the message author, send a notice message. */
		if (assignedUser.id !== author.id) return void await new Response()
			.addEmbed(builder => builder
				.setDescription(`This conversation thread does not belong to you 😔`)
				.setFooter({ text: "Use /conversation in a text channel to create your own" })
				.setColor("Red")
			).send(message);

		/* Conversation of the author */
		let conversation: Conversation = null!;

		try {
			/* Get the author's active conversation. */
			conversation = this.bot.conversation.get(author)!;

			/* If the conversation is still `null`, try to create a conversation from the database for this user. */
			if (conversation === null) {
				conversation = await this.bot.conversation.create(author);

				/* Then, try to use the data stored in the database to create a conversation. */
				try {
					await conversation.from(thread);
				} catch (_) {}
			}

			/* Choose a new session, in case the current one was disabled. */
			if (conversation.session.state === SessionState.Disabled) conversation.session = await this.bot.conversation.session();
		
			/* If the conversation's session is locked at this point - meaning that is either initializing or refreshing - notify the user. */
			if (conversation.session.locked) return void await new Response()
				.addEmbed(builder => builder
					.setDescription("Your assigned session is currently starting up ⏳")
					.setColor("Yellow")
			).send(message);

			/* If the session hasn't been initialized yet, set it up on-demand. */
			if (!conversation.session.active) {
				await conversation.session.init()
					.catch(async (error: Error) => {
						throw error;
					});
			}

			/* Initialize the user's conversation, if not done already. */
			if (!conversation.active) await conversation.init({ thread });

		} catch (error) {
			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.NoFreeSessions) return void await new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("We are currently dealing with *a lot* of traffic & are **not** able to process your message at this time 😔")
					.setFooter({ text: "Please try again later." })
					.setColor("Red")
				).send(message); 

			await handleError(this.bot, {
				message,
				reply: false,
				error: error as Error
			});

			return void await new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("It seems like we experienced an issue while trying to resume your conversation.\n*The developers have been notified*.")
					.setColor("Red")
				).send(message); 
		}

		/* If the conversation is still locked, send a notice message & delete it once the request completed. */
		if (conversation.locked) return void await new Response()
			.addEmbed(builder => builder
				.setDescription("You already have a request running in this conversation, *wait for it to finish* 😔")
				.setColor("Red")
			).send(message)
				.then(response => conversation.once("done", async () => {
					if (response instanceof Message) await response.delete().catch(() => {});
				}));

		/* If the message was not sent in the assigned thread, ignore it. */
		if (conversation.thread && conversation.thread.id !== message.channelId!) return;

		/* Remaining cool-down time */
		const remaining: number = (conversation.cooldown.state.startedAt! + conversation.cooldown.state.expiresIn!) - Date.now();

		/* If the command is on cool-down, don't run the request. */
		if (conversation.cooldown.active && remaining > conversation.cooldown.state.expiresIn! / 2) {
			const reply = await message.reply({
				embeds: [
					new EmbedBuilder()
						.setTitle("Whoa-whoa... slow down ⌛")
						.setDescription(`I'm sorry, but I can't keep up with your requests. You can speak to me again <t:${Math.floor((conversation.cooldown.state.startedAt! + conversation.cooldown.state.expiresIn! + 1000) / 1000)}:R>. 😔`)
						.setColor("Yellow")
				]
			});

			/* Once the cool-down is over, delete the invocation and reply message. */
			setTimeout(async () => {
				await reply.delete().catch(() => {});
			}, remaining);

			await message.react("🐢").catch(() => {});
			return;

		/* If the remaining time is negligible, wait for the cool-down to expire. */
		} else if (conversation.cooldown.active) {
			await message.react("⌛").catch(() => {});
			await new Promise<void>(resolve => conversation.cooldown.once("done", () => resolve()));
			await removeReaction(this.bot, "⌛", message);

			/* If the user executed a different request in the mean time, simply ignore this one & move on. */
			if (conversation.locked || conversation.session.locked) return;
		}

		/* If the message content was not provided by another source, check it for profanity & ask the user if they want to execute the request anyways. */
		const moderation: ModerationResult | null = content.length > 0 && !usedSuggestion ? await moderate(conversation, options) : null;
		
		/* If the user accepted the request after it got flagged, ... */
		if (moderation !== null && moderation.moderated && moderation.run) {
			/* ..., continue anyways. */

		/* If the user cancelled the request after it got flagged, ... */
		} else if (moderation !== null && moderation.moderated && !moderation.run) {
			/* Abort the request. */
			return;

		/* If no moderation result was given, ... */
		} else if (moderation === null || (moderation !== null && !moderation.moderated)) {
			/* ..., continue. */
		}

		/* Reply message placeholder */
		let reply: Message = null!;

		/* Bing response data */
		let final: ChatGeneratedInteraction = null!;
		let data: ResponseMessage | null = null!;
		let queued: boolean = false;

		const updateTimer = setInterval(async () => {
			/* If no data has been generated yet, skip it this time. */
			if (data === null) return;

			/* Generate a nicely formatted embed. */
			const response: Response | null = await this.process(conversation, data, true);
			if (response === null) return;

			/* Edit the sent message. */
			if (reply !== null) await reply.edit(response.get() as MessageEditOptions);
		}, 1000);

		const onProgress = async (raw: ResponseMessage): Promise<void> => {
			/* Update the current response data. */
			data = raw;

			/* Send an initial reply placeholder. */
			if (reply === null && final === null && !queued) {
				queued = true;

				/* Generate a nicely formatted embed. */
				const response: Response | null = await this.process(conversation, raw, true);
				if (response === null) return;

				try {
					reply = await message.reply(response.get() as MessageCreateOptions);
					queued = false;
				} catch (_) {
					reply = await thread.send(response.get() as MessageCreateOptions);
					queued = false;
				} 
			}
		};

		/* Try to remove the suggested response from the previous message, as they should no longer work. */
		if (conversation.previous !== null && conversation.previous.reply !== null && !usedSuggestion) {
			const buttons: ButtonBuilder[] = (ActionRowBuilder.from(conversation.previous.reply.components[0]) as ActionRowBuilder<ButtonBuilder>)
				.components

				.filter(component => component.toJSON().style === ButtonStyle.Primary)
				.map(component => {
					const label: string = component.toJSON().label!;

					return new ButtonBuilder()
						.setLabel(label)
						.setStyle(ButtonStyle.Primary)
						.setDisabled(true)
						.setCustomId(randomUUID());
				});

			const row = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(buttons);

			await conversation.previous.reply.edit({
				components: [ row ]
			}).catch(() => {});
		}

		/* Start the generation process. */
		try {
			/* Send the typing status. */
			await message.channel.sendTyping()

			/* Send the message to Bing. */
			final = await conversation.generate({
				conversation,
				prompt: content,
				trigger: message,
				onProgress: onProgress
			});

		} catch (err) {
			if (!(err instanceof GPTError)) {
				await handleError(this.bot, {
					error: err as Error,
					reply: false,
					message
				});

				return void await new Response()
					.addEmbed(builder => builder
						.setTitle("Uh-oh... 😬")
						.setDescription("It seems like we had trouble generating a response for your prompt.\n*The developers have been notified.*")
						.setColor("Red")
					).send(message);
			}

			/* Figure out the generation error, that actually occured. */
			const error: GPTGenerationError | GPTAPIError = err;

			/**
			 * Update the existing reply or send a new reply, to show the error message.
			 * @param response Response to send
			 */
			const sendError = async (response: Response): Promise<void> => {
				try {
					clearInterval(updateTimer);

					if (reply === null) await response.send(message);
					else await reply.edit(response.get() as MessageEditOptions);

				} catch (_) {}
			}

			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.NoFreeSessions) return await sendError(new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("We are currently dealing with *a lot* of traffic & are **not** able to process your message at this time 😔")
					.setFooter({ text: "Please try again later." })
					.setColor("Red")
				));

			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.Empty) return await sendError(new Response()
				.addEmbed(builder => builder
					.setDescription("**Bing**'s response was empty for this prompt. 😔\n*Please try a different question again*.")
					.setColor("Red")
				));

			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.Length) return await sendError(new Response()
				.addEmbed(builder => builder
					.setDescription("Your prompt is too long for **Bing**, *please try shortening & summarizing it* 😔\n")
					.setColor("Red")
				));

			/* Try to handle the error & log the error message. */
			await handleError(this.bot, {
				message,
				error,
				reply: false
			});

			return await sendError(new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("It seems like we had trouble generating a response for your prompt.\n*The developers have been notified.*")
					.setColor("Red")
				));
		}

		/* Try to send the response & generate a nice embed for the message. */
		try {
			/* Clean up the tiemrs. */
			clearInterval(updateTimer);

			/* Gemerate a nicely formatted embed. */
			const response: Response | null = final !== null ? await this.process(conversation, final.output.message, false) : null;

			/* If the embed failed to generate, send an error message. */
			if (response === null) return void await new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("It seems like we had trouble generating the formatted message for your prompt.\n*The developers have been notified*.")
					.setColor("Red")
				).send(message);

			/* Final reply message to the invocation message */
			let replyMessage: Message | null = null;

			/* Edit the final message. */
			if (reply !== null) replyMessage = await reply.edit(response.get() as MessageEditOptions);
			else {
				try {
					replyMessage = await message.reply(response.get() as MessageCreateOptions);
				} catch (_) {
					replyMessage = await thread.send(response.get() as MessageCreateOptions);
				} 
			}

			/* Update the reply message in the history entry. */
			conversation.history[conversation.history.length - 1].reply = replyMessage;

		} catch (error) {
			await handleError(this.bot, {
				error: error as Error,
				reply: false,
				message				
			});
		}
    }
}