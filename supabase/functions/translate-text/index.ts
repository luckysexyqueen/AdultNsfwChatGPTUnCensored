import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const text = url.searchParams.get("text") ?? "";
    const target = url.searchParams.get("target") ?? "ko";
    const source = url.searchParams.get("source") ?? "auto";

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: "번역할 텍스트를 입력하세요." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Google Translate 무료 엔드포인트 (gtx client)
    const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(text)}`;

    const resp = await fetch(gtUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: `Google Translate 오류: ${resp.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    // Google Translate 응답: [[["번역된 텍스트", "원본", null, null, null]], null, "auto-detected-lang"]
    const translated = (data?.[0] ?? [])
      .map((chunk: unknown[]) => chunk?.[0] ?? "")
      .join("");
    const detectedLang = data?.[2] ?? "auto";

    // Romanization (if available)
    const romanization = (data?.[0] ?? [])
      .map((chunk: unknown[]) => chunk?.[3] ?? "")
      .filter(Boolean)
      .join("");

    return new Response(
      JSON.stringify({
        success: true,
        original: text,
        translated,
        detectedLang,
        target,
        source,
        romanization: romanization || undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
