import * as cheerio from "cheerio";
import db from "./db";
import flareSolverr from "./flaresolverr";

export const crawledUrls = new Set<string>();
const manifestCache = new Map<string, any>();
const cfCookies = new Map<string, string>();
export async function crawlPage(url: string, ignoreExternal = true) {
  url = cleanURL(url);
  if (crawledUrls.has(url) || crawledUrls.has(url + "/")) return;
  crawledUrls.add(url);
  let res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      ...(cfCookies.has(new URL(url).hostname) ? {
        Cookie: cfCookies.get(new URL(url).hostname)!,
      } : {}),
    },
  });
  if (!res.headers.get("content-type")?.startsWith("text/html")) {
    console.error(`Skipping non-HTML content: ${url}`);
    return;
  }
  if (!res.ok) {
    if (res.status === 403 && res.headers.get("cf-ray")) {
      console.error(`Request blocked by Cloudflare: ${res.url}`);
      const flare = await flareSolverr(url);
      const solution = flare.solution;
      if (flare.status === "ok" && solution) {
        console.log(`Bypassed Cloudflare with FlareSolverr - ${flare.message}`);
        // @ts-ignore
        res = {
          url: solution.url,
          ok: solution.status >= 200 && solution.status < 300,
          status: solution.status,
          statusText: '',
          headers: new Headers(solution.headers),
          text: () => Promise.resolve(solution.response),
        };
        const cookies = solution.cookies.map(c => `${c.name}=${c.value}`).join("; ");
        const hostname = new URL(res.url).hostname;
        cfCookies.set(hostname, cookies);
      }
    } else {
      console.error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      return;
    }
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  // res.url is the final URL after redirects
  const metadata = await getPageMetadata($, res.url);
  console.log(`Crawled: ${url} - Title: ${metadata.title}`);
  db
    .prepare(`INSERT OR REPLACE INTO pages (url, title, description, keywords, author, favicon, date_published, site_name, language) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      metadata.url,
      metadata.title,
      metadata.description,
      JSON.stringify(metadata.keywords),
      metadata.author,
      metadata.favicon,
      metadata.datePublished,
      metadata.siteName,
      metadata.language,
  );

  const links = $("a[href]")
    .get()
    .filter((el) => {
      try {
        const href = $(el).attr("href");
        if (!href) return false;
        if (
          href.startsWith("https://store.steampowered.com/login/")
        ) return false;
        if (
          href.startsWith("mailto:") || href.startsWith("tel:") ||
          href.startsWith("javascript:") || href.startsWith("#")
        ) return false;
        const url = new URL(href, res.url);
        if (ignoreExternal && url.hostname !== new URL(res.url).hostname) return false;
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    });
  for (const link of links) {
    const linkUrl = new URL($(link).attr("href") as string, res.url).toString();
    await crawlPage(linkUrl, ignoreExternal);
  }
}

export async function getPageMetadata($: cheerio.CheerioAPI, url: string) {
  const goodUrl = new URL(
    $('meta[property="og:url"]').attr("content") ||
      $('meta[name="twitter:url"]').attr("content") ||
      $('link[rel="canonical"]').attr("href") ||
      url,
    url).toString();
  const manifestLink = $('link[rel="manifest"]').attr("href");
  const manifestData = manifestLink ? await fetchManifest(new URL(manifestLink, goodUrl).toString()) : null;
  const siteName = $('meta[property="og:site_name"]').attr("content") ||
    manifestData?.short_name || manifestData?.name ||
    $('meta[name="application-name"]').attr("content") ||
    $('meta[name="apple-mobile-web-app-title"]').attr("content") ||
    null;
  const headTitle = $("head title").first().text();
  const title = (siteName === headTitle ? null : headTitle) ||
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $('h1').first().text() ||
    headTitle || // in case siteName === headTitle but the other tags are empty
    null;
  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="twitter:description"]').attr("content") ||
    manifestData?.description ||
    getMainContent($) ||
    null;
  const keywords =
    $('meta[name="keywords"]').attr("content") ||
    null;
  const author =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content") ||
    null;
  const favicon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    manifestData?.icons?.[0]?.src ||
    null;
  const datePublished =
    $('meta[property="article:published_time"]').attr("content") ||
    $('main time[datetime]').attr("datetime") ||
    $('article time[datetime]').attr("datetime") ||
    $('time[datetime]').attr("datetime") ||
    null;
  const language = $('html').attr("lang") ||
    $('meta[property="og:locale"]').attr("content") ||
    null;

  return {
    url: cleanURL(goodUrl),
    title: title ? title.trim().replaceAll(/\s+/g, ' ') : null,
    description: description ? description.trim().replaceAll(/\s+/g, ' ') : null,
    keywords: keywords ? keywords.split(",").map(k => k.trim()) : [],
    author,
    favicon: favicon ? new URL(favicon, goodUrl).toString() : null,
    datePublished: datePublished ? new Date(datePublished).toISOString() : null,
    siteName,
    language
  };
}

function cleanURL(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
}

function getMainContent($: cheerio.CheerioAPI) {
  const maxChars = 200;
  const process = (text: string) => {
    if (!text) return null;
    return text.trim().replaceAll(/\s+/g, ' ').slice(0, maxChars) + "...";
  }

  const selectors = ["article", "[role=article]", "main", "[role=main]", "body"];
  for (const selector of selectors) {
    const el = $(selector + ":not([style*='display:none']):not([hidden]):not(script):not(noscript):not(style):not([style*='visibility:hidden']):not([aria-hidden='true'])").first();
    const text = el.text();
    if (!text) continue;
    const processed = process(text);
    if (processed) return processed;
  }

  return null;
}

interface Manifest {
  name: string|null,
  short_name: string|null,
  description: string|null,
  icons: {src: string, sizes: string, type: string}[]
}

async function fetchManifest(url: string): Promise<Manifest|null> {
  const hostname = new URL(url).hostname;
  if (manifestCache.has(hostname)) return manifestCache.get(hostname);
  console.log(`Fetching manifest: ${url}`);
  const res = await fetch(url);
  if (!res.ok) return null;
  try {
    const json = await res.json() as Manifest;
    manifestCache.set(hostname, json);
    return json;
  } catch {
    manifestCache.set(hostname, null);
    return null;
  }
}
