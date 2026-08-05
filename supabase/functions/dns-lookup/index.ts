import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

async function queryDoH(provider: string, url: string, domain: string, type: string) {
  try {
    const res = await fetch(`${url}?name=${encodeURIComponent(domain)}&type=${type}`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { provider, status: "error", answers: [], raw: null };
    const data = await res.json();
    const answers = (data.Answer || []).map((a: Record<string, unknown>) => ({
      name: a.name,
      type: a.type,
      data: a.data,
      ttl: a.TTL,
    }));
    return { provider, status: data.Status === 0 ? "ok" : "nxdomain", answers, blocked: data.Status === 3 };
  } catch (e) {
    return { provider, status: "timeout", answers: [], error: String(e) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain")?.replace(/^https?:\/\//, "").split("/")[0] || "";
  const type = url.searchParams.get("type") || "A";

  if (!domain) {
    return new Response(JSON.stringify({ error: "Missing domain" }), { status: 400, headers: CORS });
  }

  const providers = [
    { name: "Cloudflare (1.1.1.1)", url: "https://cloudflare-dns.com/dns-query" },
    { name: "Google (8.8.8.8)", url: "https://dns.google/resolve" },
    { name: "Cloudflare 보안 (1.1.1.2)", url: "https://security.cloudflare-dns.com/dns-query" },
  ];

  const results = await Promise.all(
    providers.map((p) => queryDoH(p.name, p.url, domain, type))
  );

  // Check if IPs differ between providers (indicates possible DNS hijacking/blocking)
  const ips = results.map((r) => r.answers.filter((a) => a.type === 1).map((a) => a.data));
  const allIps = [...new Set(ips.flat())];
  const discrepancy = new Set(ips.map((i) => JSON.stringify(i.sort()))).size > 1;
  const possiblyBlocked = results.some((r) => r.blocked || r.status === "nxdomain");

  return new Response(
    JSON.stringify({ domain, type, results, allIps, discrepancy, possiblyBlocked }),
    { headers: CORS }
  );
});