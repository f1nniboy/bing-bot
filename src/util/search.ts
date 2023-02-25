import { HTMLRewriter } from "html-rewriter-wasm";
import escapeXML from "xml-escape";

export interface SearchResult {
    title: string;
    url: string;
    description: string;
}

interface SearchResultJSON {
    body: string;
    href: string;
    title: string;
}

interface SearchOptions {
    query: string;
    amount: number;
}

/**
 * Search on DuckDuckGo.
 * 
 * @param options Search options
 * @returns Search results
 */
export const searchh = async ({ query, amount }: SearchOptions) => {
    const url = `https://html.duckduckgo.com/html/`;

    /* Make the request to the HTML page, to scrape it. */
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `q=${query}&max_results=${amount}&kl=us-en`,
    });
  
    /* All search results collected */
    const values: SearchResult[] = [];
  
    // eslint-disable-next-line no-undef
    const writer =  new HTMLRewriter(() => {})
        .on(".result__a", {
            element: (element) => {
                values.push({
                    url: element.getAttribute("href") as string,

                    /* This will be filled out later on. */
                    title: "",
                    description: ""
                });
            },

            text: text => {
                values[values.length - 1].title += escapeXML(text.text);
            }
        })

        .on(".result__snippet", {
            text: text => {
                values[values.length - 1].description += escapeXML(text.text);
            }
        });

    await writer.write(Uint8Array.from(Buffer.from(await response.arrayBuffer())));
    await writer.end();

    return values.slice(undefined, amount);
}

/**
 * Search on DuckDuckGo.
 * https://ddg-webapp-aagd.vercel.app/search
 * 
 * @param options Search options
 * @returns Search results
 */
export const search = async ({ query, amount }: SearchOptions): Promise<SearchResult[]> => {
    const response = await fetch(`https://ddg-webapp-aagd.vercel.app/search?q=${encodeURIComponent(query)}&max_results=${amount}&region=en-us`);
    if (response.status !== 200) return [];

    const data: SearchResultJSON[] = await response.json();
    if (data === null || (data !== null && data.length === 0)) return [];

    return data.map(entry => ({
        title: entry.title,
        url: entry.href,
        description: entry.body
    }));
}