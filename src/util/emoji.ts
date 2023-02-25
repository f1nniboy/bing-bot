import { Utils } from "./utils.js";

/* List of most Unicode emojis */
const emojis: string[] = [
	"😀", "😁", "😂", "😃", "😄", "😅", "😇", "😉", "😊", "😋", "😌", "😎", "😏", "😐", "😑", "😒", "😓", "😕", "😖", "😗", "😘", "😙", "😚", "😛", "😜", "😝", "😟", "😠", "😡", "😢", "😣", "😤", "😦", "😨", "😩", "😪", "😬", "😭", "😮", "😰", "😱", "😲", "😴", "😵", "😶", "😷", "😸", "😹", "😺", "😻", "😼", "😽", "😾", "😿", "🙁", "🙂", "🙃"
]

/**
 * Get a random Unicode emoji.
 * @returns Random Unicode emoji
 */
export const randomEmoji = (): string => {
    return Utils.random(emojis);
}