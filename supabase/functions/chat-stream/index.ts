import { corsHeaders } from '../_shared/cors.ts';

// 기본 시스템 프롬프트
const BASE_SYSTEM_PROMPT = `당신은 친절하고 유용한 AI 어시스턴트입니다. 사용자의 요청에 정확하고 자연스럽게 답변하세요.`;

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // 인증 확인 (게스트 및 모든 사용자 허용, API 키 불필요)
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '') || '';
    const isGuest = token === 'guest-token' || token.startsWith('guest-') || !token;

    console.log('Request mode (Keyless):', isGuest ? 'Guest/Anonymous' : 'Authenticated');

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

    console.log('Keyless AI Chat request:', {
      messageCount: chatMessages.length,
      systemPromptLength: finalSystemPrompt.length,
      gptFileCount: gptFiles?.length || 0,
      attachmentCount: chatAttachments?.length || 0,
    });

    // ── 키리스(Keyless) 무료 AI 엔진 호출 (Pollinations.ai 공용 오픈소스 게이트웨이) ──
    // 별도의 API 키 없이도 Llama 3 등 고성능 오픈소스 모델을 무료로 호출할 수 있습니다.
    const keylessBaseUrl = 'https://gen.pollinations.ai/v1';
    const selectedModel = 'llama'; // 또는 'openai'

    let response: Response;
    try {
      response = await fetch(`${keylessBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OnSpace-Keyless-Client/1.0',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: chatMessages,
          stream: true,
          temperature: 0.7,
        }),
      });
    } catch (fetchError: any) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.', details: fetchError.message }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 만약 스트리밍 요청에서 키리스 엔드포인트가 인증을 요구할 경우, 비스트리밍(Non-streaming) 또는 대체 엔드포인트로 자동 폴백
    if (!response.ok) {
      console.warn(`Primary keyless stream failed with status ${response.status}, attempting fallback...`);
      try {
        response = await fetch(`${keylessBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: chatMessages,
            stream: false,
          }),
        });
      } catch (fallbackError) {
        console.error('Fallback error:', fallbackError);
      }
    }

    if (!response.ok) {
      let errorMessage = 'AI 서비스 오류';
      try {
        const errorText = await response.text();
        console.error('Keyless AI API error:', response.status, errorText);
        errorMessage = errorText.substring(0, 200) || errorMessage;
      } catch { /* ignore */ }

      return new Response(
        JSON.stringify({ error: 'AI 응답을 받아오지 못했습니다. 잠시 후 다시 시도해주세요.', details: errorMessage, status: response.status }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.body) {
      return new Response(
        JSON.stringify({ error: 'AI 응답 스트림이 없습니다' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Keyless streaming/response started');

    // 응답이 스트림 형태인지, 일반 JSON 형태인지 판별하여 처리
    const contentType = response.headers.get('Content-Type') || '';
    
    if (contentType.includes('application/json')) {
      // 비스트리밍 응답인 경우 SSE 형태로 변환하여 클라이언트에 전달
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || data.response || '';
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const chunk = {
            choices: [{ delta: { content } }]
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // 표준 SSE 스트림 반환
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
