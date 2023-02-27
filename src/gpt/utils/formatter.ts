import Table from "cli-table";


interface MessageFormatter {
    /* Identifier of the formatter */
    name: string;

    /* Function to execute to get this formatter's result */
    execute: (content: string) => string | null;
}

/* Formatters to execute */
const formatters: MessageFormatter[] = [
    {
        name: "Markdown Tables",

        execute: content => {
            /* Match all Markdown tables in the string. */
            const matches = Array.from(content.matchAll(/^\s*\|(?:.*?\|)+\s*(?:\n\|(?:.*?\|)+\s*)+$/gm));
            if (matches.length === 0) return null;

            /* Finished version of the string */
            let final: string = content;

            for (const match of matches) {
                /* Markdown table, as a string */
                const table: string = match[0].trim();
                const lines: string[] = table.split("\n");

                /* Table headers */
                const headers: string[] = lines.shift()!.split("|").filter(header => header.length > 0).map(header => header.trim());
                lines.shift();

                /* Markdown table renderer */
                const renderer: Table = new Table({
                    head: headers
                });

                const values: string[][] = lines.map(line => line.split("|").filter(value => value.length > 0).map(value => value.trim()));
                renderer.push(...values);
                
                /* Render the Markdown table, and remove all ANSI color codes too. */
                final = final.replace(table, renderer.toString().replaceAll(/\u001b\[[0-9]{1,2}m/g, ""));
            }

            return final;
        }
    },

    {
        name: "Fix broken code blocks",
        execute: content => content.split("```").length % 2 === 0 ? `${content}\n\`\`\`` : null
    },

    {
        name: "Fix broken bold tags",
        execute: content => content.split("**").length % 2 === 0 ? `${content}**` : null
    }
]

/**
 * Apply all formatting options to the specified string, e.g. cleaning up or adding formatting.
 * @param content Content to fromat
 * 
 * @throws An error, if something went wrong
 * @returns Formatted string
 */
export const format = (content: string): string => {
    let final: string = content;

    for (const formatter of formatters) {
        try {
            const output: string | null = formatter.execute(final);
            if (output !== null) final = output;
        } catch (error) {
            throw new Error(`Failed to format content using formatter ${formatter.name}: ${error}`);
        }
    }

    return final;
} 