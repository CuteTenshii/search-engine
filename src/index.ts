import Elysia, {file} from "elysia";
import {html} from "@elysiajs/html";
import { BunFile } from "bun";
import {getAllCrawledUrls, getSearchResults} from "./db";
import {crawledUrls, crawlPage} from "./crawl";
import * as path from "node:path";
import {htmlEscape} from "./utils";

new Elysia()
  .use(html())
  .get("/", () => file('pages/index.html'))
  .get("/assets/*", ({ params }) => file(`assets/${params['*']}`))
  .get("/search", async ({query}) => {
    const fileContent = await (file(`pages/search.html`).value as BunFile).text();
    const results = getSearchResults(query.q);

    return fileContent
      .replaceAll("{{query}}", htmlEscape(results.queryWithFilters))
      .replaceAll("{{queryWithoutFilters}}", htmlEscape(results.queryWithoutFilters))
      .replaceAll("{{resultsCount}}", String(results.results.length))
      .replaceAll("{{results}}", JSON.stringify(results.results));
  })
  .get("/crawl", ({query}) => {
    const url = query.url as string;
    if (!url) return "Please provide a URL to start crawling.";
    const ignoreExternal = query.ignoreExternal === 'true';
    const crawledUrlss = getAllCrawledUrls();
    for (const crawledUrl of crawledUrlss) {
      crawledUrls.add(crawledUrl);
    }
    console.log(`Already crawled ${crawledUrls.size} URLs from database.`);
    console.log(`Starting crawl at ${url}, ignoreExternal=${ignoreExternal}`);

    crawlPage(url, ignoreExternal);
  })
  .get("/proxy/favicon", async ({query}) => {
    let url = query.url as string;
    if (!url) return "Please provide a URL.";
    url = Buffer.from(url, 'base64').toString('utf-8');
    const cacheFile = path.join('favicons', new URL(url).hostname + '.ico');
    try {
      const file = Bun.file(cacheFile);
      const cached = await file.arrayBuffer();
      const stats = await file.stat();
      const age = Math.floor((Date.now() - stats.mtime.getTime()) / 1000);
      return new Response(cached, {
        headers: {
          Age: String(age),
          "Content-Type": "image/x-icon",
          "Cache-Control": "public, max-age=86400", // Cache for 1 day
        },
      });
    } catch {
      // File doesn't exist, proceed to fetch
    }

    try {
      let res = await fetch(url, {
        headers: {
          // "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "image/webp,*/*;q=0.8",
        },
      });
      if (!res.ok) {
        if (res.status === 403 && res.headers.get("cf-ray")) {
          res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
              "Accept": "image/webp,*/*;q=0.8",
            },
          });
        } else {
          throw new Error("Failed to fetch favicon");
        }
      }

      const contentType = res.headers.get("Content-Type") || "image/x-icon";
      if (!contentType.startsWith("image/")) throw new Error("Fetched content is not an image");
      const blob = await res.arrayBuffer();
      await Bun.file(path.join('favicons', new URL(url).hostname + '.ico')).write(blob);
      return new Response(blob, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400", // Cache for 1 day
        },
      });
    } catch (error) {
      return new Response("Failed to fetch favicon", { status: 500 });
    }
  })
  .listen(3000);