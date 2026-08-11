import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, X-Requested-With",
};

const UA = "Mozilla/9.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 FireDragon/135.0 stealth privatebrowsing incognito windowedfullscreen";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    let query = "";
    let keyword = "";
    let previous: string[] = [];
    let originalQuery = "";
    let clientUA = "";

    if (req.method === "POST") {
      const body = await req.json();
      query = body.query || "";
      keyword = body.keyword || query;
      previous = body.previous || [];
      originalQuery = body.originalQuery || query;
      clientUA = body.ua || UA;
    } else {
      const url = new URL(req.url);
      query = url.searchParams.get("q") || url.searchParams.get("query") || "";
      keyword = query;
      originalQuery = query;
      clientUA = url.searchParams.get("ua") || UA;
    }

    if (!query.trim()) {
      return new Response(
        JSON.stringify({ error: "query parameter is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const cleanKeyword = String(keyword || query)
      .replace(/\s+/g, " ")
      .trim();

    return new Response(
      JSON.stringify({
        keyword: cleanKeyword,
        originalQuery,
        previous,
        ua: clientUA,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "proxy error",
        keyword: "",
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});
