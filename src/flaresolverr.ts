export default async function flareSolverr(url: string): Promise<{
  status: "ok" | "error";
  solution?: {
    url: string;
    status: number;
    headers: Record<string, string>;
    cookies: {name: string; value: string; domain: string; path: string;}[];
    response: string;
  };
  message?: string;
}> {
  const res = await fetch("http://localhost:8191/v1", {
    method: "POST",
    headers: {"Content-Type": "application/json",},
    body: JSON.stringify({
      cmd: "request.get",
      url,
      maxTimeout: 30000,
    }),
  });
  const data = await res.json();
  return data as any;
}