import { Utils } from "./utils.js";

/* List of most Unicode emojis */
const emojis: string[] = [
	"😊", "😉", "😍", "😜", "😝", "😛", "😳", "😁", "😌", "😂", "😅", "😱", "😆", "😋" ,"😎"
]

/**
 * Get a random Unicode emoji.
 * @returns Random Unicode emoji
 */
export const randomEmoji = (): typeof emojis[0] => {
    return Utils.random(emojis);
}