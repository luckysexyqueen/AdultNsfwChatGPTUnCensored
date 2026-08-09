import { corsHeaders } from '../_shared/cors.ts';

// OnSpace AI 기본 시스템 프롬프트
const BASE_SYSTEM_PROMPT = `당신은 친절하고 유용한 AI 어시스턴트입니다. 사용자의 요청에 정확하고 자연스럽게 답변하세요.`;

Deno.serve(async (req) => {
  // CORS preflight 처리 (OnSpace AI Edge Function 필수)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
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

    // --- 무료 무검열 AI 설정 (OpenRouter 활용) ---
    // OnSpace AI의 기존 유료 설정을 무시하고 무료 엔드포인트로 강제 지정합니다.
    const baseUrl = "https://openrouter.ai/api/v1";
    
    // OpenRouter 무료 모델은 키가 없어도 되지만, 헤더 형식을 맞추기 위해 빈 값이라도 전달합니다.
    // 만약 개인 OpenRouter 키가 있다면 OnSpace 프로젝트 설정에서 OPENROUTER_API_KEY를 추가하면 적용됩니다.
    const apiKey = Deno.env.get('OPENROUTER_API_KEY') || "sk-or-v1-0000000000000000000000000000000000000000000000000000000000000000";

    // 시스템 프롬프트 구성
    let finalSystemPrompt = systemPrompt?.trim() || BASE_SYSTEM_PROMPT;
    if (instructions?.trim()) {
      finalSystemPrompt += `\n\n추가 지침:\n${instructions.trim()}`;
    }

    // GPT 파일 컨텍스트 추가
    if (gptFiles && gptFiles.length > 0) {
      const fileContents = gptFiles
        .slice(0, 10)
        .filter((f: any) => f.file_content)
        .map((f: any) => {
          const content = f.file_content.substring(0, 5000);
          return `=== ${f.file_name} ===\n${content}`;
        })
        .join('\n\n');
      if (fileContents) finalSystemPrompt += `\n\n📁 참고 자료:\n${fileContents}`;
    }

    // 멀티모달 및 첨부파일 처리
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
          const contentArray: any[] = [];
          if (textPart.trim()) contentArray.push({ type: 'text', text: textPart });
          for (const img of images) {
            contentArray.push({ type: 'image_url', image_url: { url: img.url || img.base64, detail: 'auto' } });
          }
          finalMessages[lastIdx] = { ...lastMsg, content: contentArray };
        } else if (textPart !== lastMsg.content) {
          finalMessages[lastIdx] = { ...lastMsg, content: textPart };
        }
      }
    }

    const chatMessages = [
      { role: 'system', content: finalSystemPrompt },
      ...finalMessages,
    ];

    // --- 모델 선택 ---
    // 무검열(Uncensored) 무료 모델을 우선 시도합니다.
    // 1순위: @preset/gpt-oss-20b-free-uncensored (사용자 요청)
    // 2순위: openrouter/free (자동 라우팅)
    const targetModel = "@preset/gpt-oss-20b-free-uncensored";

    console.log(`OnSpace AI Edge: Requesting ${targetModel}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://onspace.ai', // OnSpace AI 출처 명시
        'X-Title': 'OnSpace Free AI Chat',
      },
      body: JSON.stringify({
        model: targetModel,
        messages: chatMessages,
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('API Error:', response.status, errorData);
      
      // 만약 요청하신 프리셋 모델이 실패하면 일반 무료 모델로 폴백(Fallback) 시도
      if (response.status === 404 || response.status === 400) {
        console.log("Fallback to openrouter/free...");
        const fallbackResponse = await fetch(`${baseUrl}/chat/completions`, {
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
        if (fallbackResponse.ok) return new Response(fallbackResponse.body, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }

      return new Response(
        JSON.stringify({ error: 'AI 응답 오류', details: errorData }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 스트리밍 응답 반환
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Server Error:', error);
    return new Response(
      JSON.stringify({ error: '서버 내부 오류', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
