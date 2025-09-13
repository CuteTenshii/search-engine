import * as cheerio from "cheerio";
import {ldJsonToObject} from "./ld-json";
import {fetchManifest, isFaviconIcoExists} from "./assets";

function getGoodUrl($: cheerio.CheerioAPI, url: string) {
  let goodUrl: string;
  const canonicalUrl = $('link[rel="canonical"]').attr("href");

  // first check if the URL in the meta tags are absolute URLs
  try {
    new URL(canonicalUrl || url);
    goodUrl = canonicalUrl || url;
  } catch {
    // if not, try to resolve them relative to the original URL
    try {
      goodUrl = new URL(canonicalUrl || url, url).toString();
    } catch {
      // if it still fails, just use the original URL
      goodUrl = url;
    }
  }
  return goodUrl;
}

export async function getPageMetadata($: cheerio.CheerioAPI, url: string) {
  const goodUrl = getGoodUrl($, url);
  const manifestLink = $('link[rel="manifest"]').attr("href");
  const manifestData = manifestLink ? await fetchManifest(new URL(manifestLink, goodUrl).toString()) : null;
  const ldJson = ldJsonToObject($('script[type="application/ld+json"]').get().map(s => $(s).text() || ""));
  const siteName = $('meta[property="og:site_name"]').attr("content") ||
    manifestData?.short_name || manifestData?.name ||
    $('meta[name="application-name"]').attr("content") ||
    $('meta[name="apple-mobile-web-app-title"]').attr("content") ||
    null;
  const headTitle = $("head title").first().text();
  const title = ldJson.headline ||
    (siteName === headTitle ? null : headTitle) ||
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
  let publishedDateObj;
  try {
    publishedDateObj = datePublished ? new Date(datePublished).toISOString() : null;
    if (publishedDateObj === "Invalid Date") publishedDateObj = null;
  } catch {
    publishedDateObj = null;
  }

  return {
    url: cleanURL(goodUrl),
    title: title ? title.trim().replaceAll(/\s+/g, ' ').trim() : null,
    description: description ? description.trim().replaceAll(/\s+/g, ' ').trim() : null,
    keywords: keywords ? keywords.split(",").map(k => k.trim()) : [],
    author,
    favicon: favicon ? new URL(favicon, goodUrl).toString() : null,
    datePublished: publishedDateObj,
    siteName,
    language: language ? language.replaceAll('_', '-').toLowerCase() : null,
    breadcrumbs: ldJson.breadcrumbs || [],
    appStoreId,
    playStoreId,
  };
}

export function cleanURL(url: string) {
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

export function getMainContent($: cheerio.CheerioAPI) {
  const maxChars = 200;
  const process = (text: string) => {
    if (!text) return null;
    return text.trim().replaceAll(/\s+/g, ' ').slice(0, maxChars) + "...";
  }

  const selectors = ["article", "[role=article]", "main", "[role=main]", "body"];
  for (const selector of selectors) {
    const el = $(selector).first().clone();
    el.find([
      "noscript", "script", "head", "style", "[hidden]", "[aria-hidden='true']", "[style*='display:none']",
      "[style*='visibility:hidden']", "next-route-announcer",
    ].join(',')).remove();
    const text = el.text();
    if (!text) continue;
    const processed = process(text);
    if (processed) return processed;
  }

  return null;
}

// Tries to determine if a page is primarily/fully client-side rendered by looking for common root div ids used by popular frameworks
export function checkIsClientSideRendered($: cheerio.CheerioAPI, url: string) {
  const hostname = new URL(url).hostname;
  // Looks for common root div ids used by popular client-side rendered frameworks, such as React, Vue, Angular, Svelte, etc.
  const selectors = [
    '#root',
    '#app',
    'div[id$="root"]',
    'div[id$="app"]',
    '#react-root',
  ];
  // Websites known to be client-side rendered
  const knownHostnames = [
    'x.com',
    'twitter.com',
    'www.instagram.com',
    'www.reddit.com',
    'www.twitch.tv',
    'open.spotify.com',
  ];

  const hasRoot = selectors.some(sel => $(sel).length > 0);
  return hasRoot || knownHostnames.includes(hostname);
}