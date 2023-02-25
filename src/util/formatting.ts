const MAP: string = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/**
 * Convert the specified number string to "upper" numbers.
 * @param content Numbers to convert
 * 
 * @returns Formatted string 
 */
export const toUpperNumbers = (content: string): string => {
    return content.split("")
        .map(character => character.match(/^\d+$/) ? MAP[parseInt(character, 10)] : character)
        .join("");
}