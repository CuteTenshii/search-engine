export default async function flareSolverr(url: string, cookies?: Omit<FlareSolverrCookie, 'domain'>[]): Promise<FlareSolverrResponse> {
  const res = await fetch("http://localhost:8191/v1", {
    method: "POST",
    headers: {"Content-Type": "application/json",},
    body: JSON.stringify({
      cmd: "request.get",
      url,
      maxTimeout: 30000,
      cookies,
    }),
  });
  const data = await res.json();
  return data as any;
}

interface FlareSolverrResponse {
  status: "ok" | "error";
  solution?: {
    url: string;
    status: number;
    headers: Record<string, string>;
    cookies: FlareSolverrCookie[];
    response: string;
  };
  message?: string;
}

interface FlareSolverrCookie {
  name: string;
  value: string;
  domain: string;
}