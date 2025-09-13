import Elysia, {file, t} from "elysia";
import {html} from "@elysiajs/html";
import { BunFile } from "bun";
import {countResults, getAllCrawledUrls, getSearchResults, getStats} from "./db";
import {crawledUrls, crawlPage} from "./crawler/crawler";
import * as path from "node:path";
import {htmlEscape} from "./utils";

new Elysia()
  .use(html())
  .get("/", () => file('pages/index.html'))
  .get("/assets/*", ({ params }) => file(`assets/${params['*']}`))
  .get("/search", async ({query}) => {
    const fileContent = await (file(`pages/search.html`).value as BunFile).text();
    const page = parseInt(query.page || '1') || 1;
    const results = getSearchResults(query.q, page);
    const count = countResults(query.q);

    return fileContent
      .replaceAll("{{query}}", htmlEscape(results.queryWithFilters))
      .replaceAll("{{queryWithoutFilters}}", htmlEscape(results.queryWithoutFilters))
      .replaceAll("{{resultsCount}}", String(count.results.toLocaleString()))
      .replaceAll("{{currentPage}}", String(page))
      .replaceAll("{{totalPages}}", String(count.pages))
      .replaceAll("{{results}}", JSON.stringify(results.results))
      .replaceAll("{{prevPageLink}}", page > 1 ? `<a href="/search?q=${encodeURIComponent(results.queryWithFilters)}&page=${page - 1}">Previous</a>` : "")
      .replaceAll("{{nextPageLink}}", page < count.pages ? `<a href="/search?q=${encodeURIComponent(results.queryWithFilters)}&page=${page + 1}">Next</a>` : "")
    ;
  })
  .get("/crawl", () => file('pages/crawl.html'))
  .post("/crawl", ({body}) => {
    const url = body.url as string;
    if (!url) return "Please provide a URL to start crawling.";
    const ignoreExternal = body.ignoreExternal === 'on';
    const force = body.force === 'on';
    const crawledUrlss = getAllCrawledUrls();
    if (crawledUrlss.length > 0) {
      for (const crawledUrl of crawledUrlss) {
        crawledUrls.add(crawledUrl);
      }
      console.log(`Already crawled ${crawledUrls.size} URLs from database.`);
    }
    console.log(`Starting crawl at ${url}, ignoreExternal=${ignoreExternal}, force=${force}`);

    crawlPage(url, {
      ignoreExternal,
      force,
    });
  }, {
    body: t.Object({
      url: t.String(),
      ignoreExternal: t.Optional(t.String()),
      force: t.Optional(t.String()),
    }),
  })
  .get("/stats", () => {
    const stats = getStats();

    return `
      <h1>Database Stats</h1>
      <p>Total pages crawled: ${stats.totalPages.toLocaleString()}</p>
      <p>Hostnames crawled: ${stats.hostnames.length.toLocaleString()}</p>
      <ul>
        ${stats.hostnames.map(h => `<li>${h.hostname} - ${h.count.toLocaleString()} pages</li>`).join("")}
      </ul>
      <p>Languages detected: ${stats.languages.length.toLocaleString()}</p>
      <ul>
        ${stats.languages.map(l => `<li>${l.language || 'Unknown'} - ${l.count.toLocaleString()} pages</li>`).join("")}
      </ul>
      <p>Authors detected: ${stats.authors.length.toLocaleString()}</p>
      <ul>
        ${stats.authors.map(a => `<li>${a.author || 'Unknown'} - ${a.count.toLocaleString()} pages</li>`).join("")}
      </ul>
      <a href="/">Go back</a>
    `;
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