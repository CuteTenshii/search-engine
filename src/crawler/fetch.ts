import flareSolverr from "../flaresolverr";

const cookies = new Map<string, string>();
const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

export async function fetchPage(url: string): Promise<Response|void> {
  let res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      ...(cookies.has(new URL(url).hostname) ? {
        Cookie: cookies.get(new URL(url).hostname)!,
      } : {}),
    },
    redirect: 'manual',
  });

  if (res.headers.get("set-cookie")) {
    const setCookies = res.headers.get("set-cookie")!.split(",").map(c => c.trim());
    const hostname = new URL(res.url).hostname;
    const existingCookies = cookies.has(hostname) ? cookies.get(hostname)!.split("; ").map(c => {
      const [name, ...rest] = c.split("=");
      if (!name) return null;
      return {name, value: rest.join("=")};
    }).filter(Boolean) as {name: string, value: string}[] : [];
    for (const c of setCookies) {
      const [cookiePart] = c.split(";");
      const [name, ...rest] = cookiePart.split("=");
      if (!name) continue;
      const value = rest.join("=");
      const existingIndex = existingCookies.findIndex(ec => ec.name === name);
      if (existingIndex !== -1) {
        existingCookies[existingIndex].value = value;
      } else {
        existingCookies.push({name, value});
      }
    }
    const newCookieString = existingCookies.map(c => `${c.name}=${c.value}`).join("; ");
    cookies.set(hostname, newCookieString);
  }
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    let location = res.headers.get("location")!;
    if (location.startsWith("/")) {
      const baseUrl = new URL(url);
      location = `${baseUrl.protocol}//${baseUrl.hostname}${location}`;
    } else if (!location.startsWith("http")) {
      // Relative redirect, e.g. "page2.html"
      const baseUrl = new URL(url);
      const pathParts = baseUrl.pathname.split("/");
      pathParts.pop(); // Remove last part (file or empty)
      location = `${baseUrl.protocol}//${baseUrl.hostname}${pathParts.join("/")}/${location}`;
    }
    console.log(`Redirected to: ${location}`);
    return fetchPage(location);
  }

  if (!res.ok) {
    if (res.status === 404) {
      console.error(`Page not found: ${url}`);
      return;
    } else if (res.status === 429) {
      console.error(`Rate limited when accessing: ${url}.`);
      console.log(res.headers);
    } else if (res.status === 403 && res.headers.get("cf-mitigated") === "challenge") {
      console.error(`Request blocked by Cloudflare: ${res.url}. Attempting to bypass...`);
      // Attempt to bypass Cloudflare using FlareSolverr
      const flareRes = await fetchWithFlareSolverr(url);
      if (flareRes) {
        res = flareRes;
      } else {
        return;
      }
    } else {
      console.error(`Failed to fetch ${url} - ${res.status} ${res.statusText}`);
      return;
    }
  }

  if (!res.headers.get("content-type")?.startsWith("text/html")) {
    console.error(`Skipping non-HTML content: ${url}`);
    return;
  }

  return res;
}

export async function fetchWithFlareSolverr(url: string): Promise<Response|void> {
  const cookiesMap = cookies.has(new URL(url).hostname) ? cookies.get(new URL(url).hostname)!.split("; ").map(c => {
    const [name, ...rest] = c.split("=");
    if (!name) return null;
    return {name, value: rest.join("=")};
  }).filter(Boolean) as {name: string, value: string}[] : [];
  const flare = await flareSolverr(url, cookiesMap);
  const solution = flare.solution;
  if (flare.status === "ok" && solution) {
    console.log(`Bypassed Cloudflare with FlareSolverr - ${flare.message}`);

    const newCookies = solution.cookies.map(c => `${c.name}=${c.value}`).join("; ");
    const hostname = new URL(url).hostname;
    const headers = new Headers(solution.headers);
    cookies.set(hostname, newCookies);
    if (solution.response.includes('<html') && solution.response.includes('<body')) {
      headers.set("content-type", "text/html");
    }

    // @ts-ignore
    return {
      url: solution.url,
      ok: solution.status >= 200 && solution.status < 300,
      status: solution.status,
      statusText: 'FlareSolverr',
      headers: headers,
      text: () => Promise.resolve(solution.response),
    };
  } else {
    console.error(`Failed to bypass Cloudflare for ${url} - ${flare.message}`);
    return;
  }
}