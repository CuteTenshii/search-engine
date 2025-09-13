import * as cheerio from "cheerio";
import SQLBuilder from "../SQLBuilder";
import {checkIsClientSideRendered, cleanURL, getPageMetadata} from "./utils";
import {fetchPage, fetchWithFlareSolverr} from "./fetch";

export const crawledUrls = new Set<string>();

export async function crawlPage(url: string, {
  ignoreExternal = true, force = false,
}: {
  ignoreExternal?: boolean;
  force?: boolean;
}) {
  url = cleanURL(url);
  if (!force && (
    crawledUrls.has(url) || crawledUrls.has(url + "/") || (url.endsWith("/") && crawledUrls.has(url.slice(0, -1)))
  )) return;
  crawledUrls.add(url);

  console.log(`Crawling: ${url}`);
  const res = await fetchPage(url);
  if (!res) return;
  let $ = cheerio.load(await res.text());

  // res.url is the final URL after redirects
  let clientSideRender = false;
  // FlareSolverr uses Chrome to get the page, so we can skip the CSR check
  if (res.statusText !== 'FlareSolverr') clientSideRender = checkIsClientSideRendered($, res.url);
  if (clientSideRender) {
    console.log(`Detected client-side rendered page, re-fetching with FlareSolverr: ${res.url}`);
    // Re-fetch the page using FlareSolverr to get the fully rendered HTML
    const newRes = await fetchWithFlareSolverr(res.url);
    if (!newRes) {
      console.error(`Failed to fetch client-side rendered page: ${res.url}`);
      return;
    }
    $ = cheerio.load(await newRes.text());
  }
  const metadata = await getPageMetadata($, res.url);
  console.log(`Crawled: ${metadata.url} - Title: ${metadata.title}`);

  try {
    new SQLBuilder()
      .insertOrReplace(["url", "title", "description", "keywords", "author", "favicon", "date_published", "site_name", "language", "breadcrumbs"], [
        metadata.url,
        metadata.title,
        metadata.description,
        JSON.stringify(metadata.keywords),
        metadata.author,
        metadata.favicon,
        metadata.datePublished,
        metadata.siteName,
        metadata.language,
        JSON.stringify(metadata.breadcrumbs),
      ])
      .into("pages")
      .run();
  } catch (e) {
    console.log([
      metadata.url,
      metadata.title,
      metadata.description,
      JSON.stringify(metadata.keywords),
      metadata.author,
      metadata.favicon,
      metadata.datePublished,
      metadata.siteName,
      metadata.language,
      JSON.stringify(metadata.breadcrumbs),
    ]);
    console.error(e);
    return;
  }

  const links = $("a[href]")
    .get()
    .filter((el) => {
      try {
        const href = $(el).attr("href");
        if (!href) return false;
        // Ignore links that are just the same URL with different fragments or trailing slashes
        if (url === href || url + "/" === href || (url.endsWith("/") && url.slice(0, -1) === href)) return false;
        // Ignore Steam login links, because they create infinite loops to themselves, due to the first link on the page being /login/?redir=...
        if (href.startsWith("https://store.steampowered.com/login/")) return false;
        const parsedUrl = new URL(href, res.url);

        const ignoredPaths = [
          '/cdn-cgi/l/email-protection', // Cloudflare email protection links
        ];
        if (ignoredPaths.includes(parsedUrl.pathname)) return false;

        // Ignore non-http(s) links
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return false;
        if (ignoreExternal && parsedUrl.hostname !== new URL(res.url).hostname) return false;

        return true;
      } catch {
        return false;
      }
    });
  for (const link of links) {
    const linkUrl = new URL($(link).attr("href") as string, res.url).toString();
    await crawlPage(linkUrl, {ignoreExternal});
  }
}
