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

    const baseUrl = "https://openrouter.ai/api/v1";
    const apiKey = Deno.env.get('OPENROUTER_API_KEY') || "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";

    let finalSystemPrompt = systemPrompt?.trim() || BASE_SYSTEM_PROMPT;
    if (instructions?.trim()) {
      finalSystemPrompt += `\n\n추가 지침:\n${instructions.trim()}`;
    }

    if (gptFiles && gptFiles.length > 0) {
      const fileContents = gptFiles.slice(0, 10).filter((f: any) => f.file_content)
        .map((f: any) => `=== ${f.file_name} ===\n${f.file_content.substring(0, 5000)}`)
        .join('\n\n');
      if (fileContents) finalSystemPrompt += `\n\n📁 참고 자료:\n${fileContents}`;
    }

    let finalMessages = [...messages];
    if (chatAttachments && Array.isArray(chatAttachments) && chatAttachments.length > 0) {
      const lastIdx = finalMessages.length - 1;
      const lastMsg = finalMessages[lastIdx];
      if (lastMsg && lastMsg.role === 'user') {
        const images = chatAttachments.filter((f: any) => f.type === 'image' && (f.url || f.base64));
        const textFiles = chatAttachments.filter((f: any) => f.type === 'text' && f.textContent);
        let textPart: string = lastUserContent !== undefined ? lastUserContent : (lastMsg.content || '');
        for (const tf of textFiles) {
          textPart += `\n\n[첨부 파일: ${tf.name}]\n${tf.textContent.substring(0, 8000)}`;
        }
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
    const targetModel = "@preset/gpt-oss-20b-free-uncensored";

    console.log(`OnSpace Streaming: Requesting ${targetModel}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://onspace.ai',
        'X-Title': 'OnSpace Free AI',
      },
      body: JSON.stringify({
        model: targetModel,
        messages: chatMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: 'AI API 오류', details: errorText }), { 
        status: response.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 스트리밍 데이터가 중간에 끊기지 않도록 ReadableStream을 수동으로 제어합니다.
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // 데이터를 디코딩한 후 다시 인코딩하여 즉시 전송
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (e) {
          console.error('Stream processing error:', e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // 버퍼링 방지 (중요)
      },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: '서버 오류', details: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
