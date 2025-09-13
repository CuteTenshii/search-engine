import * as cheerio from "cheerio";
import db from "./db";
import flareSolverr from "./flaresolverr";
import {ldJsonToObject} from "./ldjson";
import SQLBuilder from "./SQLBuilder";

export const crawledUrls = new Set<string>();
const manifestCache = new Map<string, any>();
const cfCookies = new Map<string, string>();
const faviconCache = new Map<string, boolean>();
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
  const ldJson = ldJsonToObject($('script[type="application/ld+json"]').get().map(s => $(s).html() || ""));
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
    manifestData?.short_name || manifestData?.name || // last resort
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
    ldJson.author ||
    null;
  const favicon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    manifestData?.icons?.[0]?.src ||
    (await isFaviconIcoExists(goodUrl) ? "/favicon.ico" : null) ||
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
  const appStoreId =
    $('meta[name="apple-itunes-app"]').attr("content")?.match(/app-id=(\d+)/)?.[1] ||
    null;
  const playStoreId =
    $('meta[name="google-play-app"]').attr("content")?.match(/app-id=([\w.]+)/)?.[1] ||
    manifestData?.related_applications?.find(app => app.platform === 'play')?.id ||
    null;

  return {
    url: cleanURL(goodUrl),
    title: title ? title.trim().replaceAll(/\s+/g, ' ').trim() : null,
    description: description ? description.trim().replaceAll(/\s+/g, ' ').trim() : null,
    keywords: keywords ? keywords.split(",").map(k => k.trim()) : [],
    author,
    favicon: favicon ? new URL(favicon, goodUrl).toString() : null,
    datePublished: datePublished ? new Date(datePublished).toISOString() : null,
    siteName,
    language,
    breadcrumbs: ldJson.breadcrumbs || [],
    appStoreId,
    playStoreId,
  };
}

async function isFaviconIcoExists(url: string) {
  try {
    const u = new URL(url);
    u.pathname = "/favicon.ico";
    u.search = "";
    u.hash = "";
    if (faviconCache.has(u.hostname)) return faviconCache.get(u.hostname);
    const res = await fetch(u.toString(), {method: "HEAD"});
    const contentType = res.headers.get("content-type") || "";
    const ok = res.ok && contentType.startsWith("image/");
    faviconCache.set(u.hostname, ok);
    return ok;
  } catch {
    return false;
  }
}

function cleanURL(url: string) {
  // Remove tracking parameters from known hostnames. Makes it so it doesn't crawl the same page multiple times with different params etc.
  // This is not exhaustive, just some common ones. Also, no need for parameters already in globalIgnoreParams, they will be removed anyway.
  const ignoreParamsPerHostname: Record<string, string[]> = {
    "www.youtube.com": ["feature"], // e.g. ?feature=share, ?feature=emb_logo
    "x.com": ["s", "t"], // e.g. x.com/username?s=20
    "twitter.com": ["s", "t"], // same as above
    "reddit.com": ["utm_source", "utm_medium", "utm_name", "utm_content", "utm_term", "context"], // e.g. ?utm_source=share&utm_medium=web2x&context=3
    "medium.com": ["source", "sk"], // e.g. ?source=your_stories_page-----abc123-----&sk=abc123
    "www.linkedin.com": ["trk", "original_referer", "sessionId"], // e.g. ?trk=public_profile_browsemap&original_referer=https%3A%2F%2Fwww.google.com%2F
    "store.steampowered.com": ["snr"], // e.g. ?snr=1_7_7_230_150_1
  };
  const globalIgnoreParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid"];

  try {
    const u = new URL(url);
    // Remove fragment
    u.hash = "";

    const ignoreParams = ignoreParamsPerHostname[u.hostname] || [];
    for (const param of [...ignoreParams, ...globalIgnoreParams]) {
      u.searchParams.delete(param);
    }
    // Remove empty search
    if (Object.keys(u.searchParams).length === 0) {
      u.search = "";
    }
    // Ensure pathname is not empty
    if (u.pathname === "") {
      u.pathname = "/";
    }

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
    const el = $(selector).first().clone();
    el.find([
      "script", "head", "style", "[hidden]", "[aria-hidden='true']", "[style*='display:none']", "[style*='visibility:hidden']",
      "next-route-announcer",
    ].join(',')).remove();
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
  icons: {src: string, sizes: string, type: string}[];
  related_applications: {
    platform: 'play' | string;
    url: string;
    id: string;
  }[];
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
