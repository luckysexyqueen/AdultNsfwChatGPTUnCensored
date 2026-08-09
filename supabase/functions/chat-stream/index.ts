import { corsHeaders } from '../_shared/cors.ts';

const BASE_SYSTEM_PROMPT = `당신은 친절하고 유용한 AI 어시스턴트입니다. 사용자의 요청에 정확하고 자연스럽게 답변하세요.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: '잘못된 요청 형식입니다' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { messages, systemPrompt, instructions, gptFiles, chatAttachments, lastUserContent } = requestBody;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: '메시지가 필요합니다' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // --- OpenRouter 설정 ---
    const baseUrl = "https://openrouter.ai/api/v1";
    // 키가 없으면 빈 문자열을 사용합니다 (무료 모델은 키 없이도 제한적으로 작동하거나 특정 헤더로 가능)
    const apiKey = Deno.env.get('OPENROUTER_API_KEY') || "";

    let finalSystemPrompt = systemPrompt?.trim() || BASE_SYSTEM_PROMPT;
    if (instructions?.trim()) {
      finalSystemPrompt += `\n\n추가 지침:\n${instructions.trim()}`;
    }

    // 파일 컨텍스트 추가
    if (gptFiles && gptFiles.length > 0) {
      const fileContents = gptFiles.slice(0, 10).filter((f: any) => f.file_content)
        .map((f: any) => `=== ${f.file_name} ===\n${f.file_content.substring(0, 5000)}`)
        .join('\n\n');
      if (fileContents) finalSystemPrompt += `\n\n📁 참고 자료:\n${fileContents}`;
    }

    // 메시지 구성
    let finalMessages = [...messages];
    if (chatAttachments && Array.isArray(chatAttachments) && chatAttachments.length > 0) {
      const lastIdx = finalMessages.length - 1;
      const lastMsg = finalMessages[lastIdx];
      if (lastMsg && lastMsg.role === 'user') {
        const images = chatAttachments.filter((f: any) => f.type === 'image' && (f.url || f.base64));
        let textPart: string = lastUserContent !== undefined ? lastUserContent : (lastMsg.content || '');
        if (images.length > 0) {
          const contentArray: any[] = [{ type: 'text', text: textPart }];
          for (const img of images) {
            contentArray.push({ type: 'image_url', image_url: { url: img.url || img.base64 } });
          }
          finalMessages[lastIdx] = { ...lastMsg, content: contentArray };
        } else {
          finalMessages[lastIdx] = { ...lastMsg, content: textPart };
        }
      }
    }

    const chatMessages = [{ role: 'system', content: finalSystemPrompt }, ...finalMessages];
    
    // 모델 후보군: @preset 모델이 안될 경우를 대비해 가장 안정적인 무료 모델 사용
    // 1. "meta-llama/llama-3.1-8b-instruct:free" (매우 안정적)
    // 2. "openrouter/free" (자동 선택)
    const targetModel = "meta-llama/llama-3.1-8b-instruct:free";

    console.log(`Requesting model: ${targetModel}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://onspace.ai',
        'X-Title': 'OnSpace Free AI Chat',
      },
      body: JSON.stringify({
        model: targetModel,
        messages: chatMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter Error:', response.status, errorText);
      
      // 만약 첫 번째 모델이 실패하면 openrouter/free로 한 번 더 시도
      if (response.status === 404 || response.status === 400) {
        const retryResponse = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://onspace.ai',
          },
          body: JSON.stringify({
            model: "openrouter/free",
            messages: chatMessages,
            stream: true,
          }),
        });
        if (retryResponse.ok) return new Response(retryResponse.body, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }

      return new Response(JSON.stringify({ 
        error: 'AI API 오류가 발생했습니다.', 
        details: errorText,
        status: response.status 
      }), { 
        status: response.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: '서버 오류', details: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
