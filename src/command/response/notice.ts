import { ColorResolvable, EmbedBuilder } from "discord.js";

import { Response, ResponseType } from "../response.js";

interface NoticeResponseOptions {
    /* Color of the embed */
    color: ColorResolvable;

    /* Message for the embed */
    message: string;

    /* Footer of the embed; optional */
    footer?: string;
}

export class NoticeResponse extends Response {
    constructor(options: NoticeResponseOptions, type: ResponseType) {
        super(type);

        this.addEmbed(_ => new EmbedBuilder()
            .setDescription(options.message) 
            .setFooter(options.footer ? { text: options.footer } : null)
            .setColor(options.color)
        );

        this.setEphemeral(true);
    }
}