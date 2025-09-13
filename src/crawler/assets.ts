const faviconCache = new Map<string, boolean>();
const manifestCache = new Map<string, Manifest|null>();

export async function isFaviconIcoExists(url: string) {
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

export async function fetchManifest(url: string): Promise<Manifest|null> {
  const hostname = new URL(url).hostname;
  if (manifestCache.has(hostname)) return manifestCache.get(hostname)!;
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
