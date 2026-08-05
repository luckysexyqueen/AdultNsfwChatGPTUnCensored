import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Blocked domains for security
const BLOCKED_DOMAINS = [
  "localhost", "127.0.0.1", "0.0.0.0", "::1",
  "169.254.", "10.", "192.168.", "172.16.", "172.17.", "172.18.",
  "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
  "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
];

function isBlocked(hostname: string): boolean {
  return BLOCKED_DOMAINS.some((d) => hostname.startsWith(d) || hostname === d);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return new Response(
        JSON.stringify({ error: "url 파라미터가 필요합니다. ?url=https://example.com" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response(
        JSON.stringify({ error: "유효하지 않은 URL입니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return new Response(
        JSON.stringify({ error: "http/https 프로토콜만 지원합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isBlocked(targetUrl.hostname)) {
      return new Response(
        JSON.stringify({ error: "내부 네트워크 주소는 접근할 수 없습니다." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Forward request headers (strip sensitive ones)
    const forwardHeaders = new Headers();
    const skipHeaders = new Set(["host", "authorization", "cookie", "x-forwarded-for", "x-real-ip"]);
    for (const [key, value] of req.headers.entries()) {
      if (!skipHeaders.has(key.toLowerCase())) {
        forwardHeaders.set(key, value);
      }
    }
    forwardHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

    const proxyResp = await fetch(target, {
      method: req.method,
      headers: forwardHeaders,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const respHeaders = new Headers(proxyResp.headers);
    // Inject CORS headers
    for (const [k, v] of Object.entries(corsHeaders)) {
      respHeaders.set(k, v);
    }
    // Remove security headers that block embedding
    respHeaders.delete("Content-Security-Policy");
    respHeaders.delete("X-Frame-Options");
    respHeaders.delete("Cross-Origin-Opener-Policy");
    respHeaders.delete("Cross-Origin-Embedder-Policy");
    respHeaders.delete("Cross-Origin-Resource-Policy");

    return new Response(proxyResp.body, {
      status: proxyResp.status,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `프록시 오류: ${String(err)}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
