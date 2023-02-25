import { EmbedBuilder, ComponentBuilder, Message, InteractionReplyOptions, TextChannel, AttachmentBuilder, MessageCreateOptions, CommandInteraction, MessageComponentInteraction, DMChannel, InteractionResponse, ThreadChannel, MessageEditOptions } from "discord.js";
import { APIActionRowComponent, APIActionRowComponentTypes } from "discord-api-types/v10";

type Component = APIActionRowComponentTypes | APIActionRowComponent<APIActionRowComponentTypes>;

export enum ResponseType {
	FollowUp,
	Edit,
    Send
}

export class Response {
	/* Content of the message */
	public content: string | null;

	/* Embed of the message */
	public embeds: EmbedBuilder[];

	/* Attachments of the message */
	public attachments: AttachmentBuilder[];

	/* Components of the message */
	public components: Component[];

	/* Type of the response */
	public type: ResponseType;

    /* Whether the response is only visible to the user */
    public ephemeral: boolean;

	constructor(type: ResponseType = ResponseType.Send) {
        this.ephemeral = false;
		this.attachments = [];
		this.components = [];
		this.content = null;
		this.embeds = [];
		this.type = type;
	}

	public setContent(content: string | null): this {
		this.content = content;
		return this;
	}

	public addEmbed(builder: ((embed: EmbedBuilder) => EmbedBuilder) | EmbedBuilder): this {
		this.embeds.push(typeof builder === "function" ? builder(new EmbedBuilder()) : builder);
		return this;
	}

	public addAttachment(attachment: AttachmentBuilder | null): this {
		if (!attachment) return this;
		this.attachments.push(attachment);

		return this;
	}

	public addComponent<T extends ComponentBuilder>(type: { new(): T }, builder: ((component: T) => T) | T): this {
		this.components.push((typeof builder === "function" ? builder(new type()) : builder).toJSON());
		return this;
	}

	public setType(type: ResponseType): this {
		this.type = type;
		return this;
	}

	public setEphemeral(ephemeral: boolean): this {
		this.ephemeral = ephemeral;
		return this;
	}

	/* Get the formatted embed. */
	public get(): InteractionReplyOptions  | MessageCreateOptions | MessageEditOptions {
		return {
			content: this.content !== null ? this.content : undefined,
			embeds: this.embeds ? this.embeds : [],
			components: this.components as any,
			ephemeral: this.ephemeral,
			files: this.attachments
		};
	}

	/* Edit the original interaction reply. */
	public async send(interaction: MessageComponentInteraction | CommandInteraction | Message | TextChannel | DMChannel | ThreadChannel): Promise<InteractionResponse | Message | null> {
		if (interaction instanceof MessageComponentInteraction || interaction instanceof CommandInteraction) {
			/* If the interaction token has expired, don't try to edit the message. */
			if (Date.now() - interaction.createdTimestamp > 10 * 60 * 1000) return null;

			/* Edit the original reply. */
			try {
				switch (this.type) {
                    case ResponseType.Send:     return await interaction.reply(this.get() as InteractionReplyOptions);
					case ResponseType.Edit:     return await interaction.editReply(this.get());
					case ResponseType.FollowUp: return await interaction.followUp(this.get() as InteractionReplyOptions);
				}
			} catch (_) {
				return null;
			}

		} else if (interaction instanceof TextChannel || interaction instanceof DMChannel || interaction instanceof ThreadChannel) {
			/* Send the message to the channel. */
			try {
				return await interaction.send(this.get() as MessageCreateOptions);
			} catch (_) {
				return null;
			}

		} else if (interaction instanceof Message) {
			/* Send the reply to the message. */
			try {
				return interaction.reply(this.get() as MessageCreateOptions);
			} catch (_) {
				return null;
			}
		}

		return null;
	}
}