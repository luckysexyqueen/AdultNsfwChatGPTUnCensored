import { corsHeaders } from '../_shared/cors.ts';

// 기본 시스템 프롬프트
const BASE_SYSTEM_PROMPT = `당신은 친절하고 유용한 AI 어시스턴트입니다. 사용자의 요청에 정확하고 자연스럽게 답변하세요.`;

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // 인증 확인 (게스트도 허용)
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '') || '';
    const isGuest = token === 'guest-token' || token.startsWith('guest-');

    console.log('Request mode:', isGuest ? 'Guest' : 'Authenticated');

    // 요청 본문 파싱
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: '잘못된 요청 형식입니다' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, systemPrompt, instructions, gptFiles, chatAttachments, lastUserContent } = requestBody;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: '메시지가 필요합니다' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = Deno.env.get('https://api.uncensored.com');
    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');

    if (!baseUrl || !apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI 서비스 설정이 누락되었습니다. 관리자에게 문의하세요.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 시스템 프롬프트 구성
    let finalSystemPrompt = systemPrompt?.trim() || BASE_SYSTEM_PROMPT;

    if (instructions?.trim()) {
      finalSystemPrompt += `\n\n추가 지침:\n${instructions.trim()}`;
    }

    // GPT 파일 컨텍스트 추가 (텍스트 파일만, 최대 10개 / 각 5000자)
    if (gptFiles && gptFiles.length > 0) {
      const fileContents = gptFiles
        .slice(0, 10)
        .filter((f: any) => f.file_content)
        .map((f: any) => {
          const content = f.file_content.substring(0, 5000);
          return `=== ${f.file_name} ===\n${content}${f.file_content.length > 5000 ? '\n... (내용 생략)' : ''}`;
        })
        .join('\n\n');

      if (fileContents) {
        finalSystemPrompt += `\n\n📁 참고 자료:\n${fileContents}`;
      }
    }

    // ── 멀티모달 처리: 첨부 파일을 마지막 사용자 메시지에 주입 ──
    let finalMessages = [...messages];

    if (chatAttachments && Array.isArray(chatAttachments) && chatAttachments.length > 0) {
      const lastIdx = finalMessages.length - 1;
      const lastMsg = finalMessages[lastIdx];

      if (lastMsg && lastMsg.role === 'user') {
        const images = chatAttachments.filter(
          (f: any) => f.type === 'image' && (f.url || f.base64)
        );
        const textFiles = chatAttachments.filter(
          (f: any) => f.type === 'text' && f.textContent
        );

        // 텍스트 파트 (lastUserContent 우선, 없으면 현재 content)
        let textPart: string =
          lastUserContent !== undefined ? lastUserContent : (lastMsg.content || '');

        // 텍스트 파일 내용 추가
        for (const tf of textFiles) {
          textPart += `\n\n[첨부 파일: ${tf.name}]\n${tf.textContent.substring(0, 8000)}`;
        }

        if (images.length > 0) {
          // 멀티모달 배열 구성
          const contentArray: any[] = [];

          if (textPart.trim()) {
            contentArray.push({ type: 'text', text: textPart });
          }

          for (const img of images) {
            contentArray.push({
              type: 'image_url',
              image_url: {
                url: img.url || img.base64,
                detail: 'auto',
              },
            });
          }

          finalMessages[lastIdx] = { ...lastMsg, content: contentArray };
          console.log(`Multimodal: ${images.length} image(s) + text`);
        } else if (textPart !== lastMsg.content) {
          // 이미지 없고 텍스트 파일만 있는 경우
          finalMessages[lastIdx] = { ...lastMsg, content: textPart };
        }
      }
    } else if (lastUserContent !== undefined && finalMessages.length > 0) {
      // chatAttachments 없어도 lastUserContent로 마지막 메시지 텍스트 교체
      const lastIdx = finalMessages.length - 1;
      const lastMsg = finalMessages[lastIdx];
      if (lastMsg?.role === 'user' && lastUserContent !== lastMsg.content) {
        finalMessages[lastIdx] = { ...lastMsg, content: lastUserContent };
      }
    }

    const chatMessages = [
      { role: 'system', content: finalSystemPrompt },
      ...finalMessages,
    ];

    console.log('Chat request:', {
      messageCount: chatMessages.length,
      systemPromptLength: finalSystemPrompt.length,
      gptFileCount: gptFiles?.length || 0,
      attachmentCount: chatAttachments?.length || 0,
      isGuest,
    });

    // AI API 호출
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: chatMessages,
          stream: true,
          max_tokens: 100000,
          temperature: 0.8,
        }),
      });
    } catch (fetchError: any) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.', details: fetchError.message }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      let errorMessage = 'AI 서비스 오류';
      try {
        const errorText = await response.text();
        console.error('AI API error:', response.status, errorText);
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText.substring(0, 200) || errorMessage;
        }
      } catch { /* ignore */ }

      const statusMessages: Record<number, string> = {
        400: '잘못된 요청입니다. 메시지를 다시 확인해주세요.',
        401: 'AI 서비스 인증 오류. 관리자에게 문의하세요.',
        402: 'AI 서비스 크레딧이 부족합니다. 관리자에게 문의하세요.',
        429: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        500: 'AI 서비스에 일시적 문제가 발생했습니다.',
      };

      const userMessage =
        statusMessages[response.status] ||
        (response.status >= 500 ? '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' : '메시지 전송 중 문제가 발생했습니다.');

      return new Response(
        JSON.stringify({ error: userMessage, details: errorMessage, status: response.status }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.body) {
      return new Response(
        JSON.stringify({ error: 'AI 응답 스트림이 없습니다' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Streaming response started');

    // SSE 스트림 반환
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(encoder.encode(decoder.decode(value, { stream: true })));
          }
        } catch (error) {
          console.error('Stream error:', error);
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
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    console.error('Chat stream error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || '서버 오류가 발생했습니다' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
