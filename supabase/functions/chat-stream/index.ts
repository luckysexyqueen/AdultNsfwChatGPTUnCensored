import { corsHeaders } from '../_shared/cors.ts';

// 기본 시스템 프롬프트
const BASE_SYSTEM_PROMPT = `당신은 친절하고 유용한 AI 어시스턴트입니다. 사용자의 요청에 정확하고 자연스럽게 답변하세요.`;

Deno.serve(async (req) => {
  // CORS preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: corsHeaders,
      status: 204
    });
  }

  try {
    // 인증 확인 (게스트도 허용)
    const authHeader = req.headers.get('Authorization');
    const isGuest = authHeader?.includes('guest-token') || authHeader?.includes('guest-');
    
    console.log('Auth header:', authHeader?.substring(0, 50));
    console.log('Request mode:', isGuest ? 'Guest' : 'Authenticated');

    // 요청 본문 파싱
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (e) {
      console.error('Request body parsing error:', e);
      return new Response(
        JSON.stringify({ error: '잘못된 요청 형식입니다' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { messages, systemPrompt, instructions, gptFiles } = requestBody;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: '메시지가 필요합니다' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');
    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');

    if (!baseUrl || !apiKey) {
      console.error('Missing OnSpace AI configuration:', { 
        hasBaseUrl: !!baseUrl, 
        hasApiKey: !!apiKey 
      });
      return new Response(
        JSON.stringify({ 
          error: 'AI 서비스 설정이 누락되었습니다',
          details: 'OnSpace AI API 키가 설정되지 않았습니다. 관리자에게 문의하세요.'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 시스템 프롬프트 구성
    const chatMessages = [];
    
    // 파일 내용을 컨텍스트로 추가
    let filesContext = '';
    if (gptFiles && gptFiles.length > 0) {
      const fileContents = gptFiles
        .filter(f => f.file_content)
        .map(f => `=== ${f.file_name} ===\n${f.file_content}`)
        .join('\n\n');
      
      if (fileContents) {
        filesContext = `\n\n📁 참고 자료:\n${fileContents}`;
      }
    }
    
    // 시스템 프롬프트 구성 (간결하게)
    let finalSystemPrompt = systemPrompt?.trim() || BASE_SYSTEM_PROMPT;
    
    if (instructions?.trim()) {
      finalSystemPrompt += `\n\n추가 지침: ${instructions.trim()}`;
    }
    
    if (filesContext) {
      finalSystemPrompt += filesContext;
    }
    
    console.log('Chat request:', {
      messageCount: messages.length,
      systemPromptLength: finalSystemPrompt.length,
      fileCount: gptFiles?.length || 0,
    });
    
    chatMessages.push({
      role: 'system',
      content: finalSystemPrompt
    });
    
    chatMessages.push(...messages);

    console.log('Calling OnSpace AI API...');
    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
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
        JSON.stringify({ 
          error: '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.',
          details: fetchError.message 
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!response.ok) {
      let errorMessage = 'AI 서비스 오류';
      let errorDetails = '';
      
      try {
        const errorText = await response.text();
        console.error('AI API error response:', response.status, errorText);
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
          errorDetails = errorJson.details || '';
        } catch {
          errorMessage = errorText.substring(0, 200) || errorMessage;
        }
      } catch (e) {
        console.error('Failed to read error response:', e);
      }
      
      // 상태 코드별 사용자 친화적 메시지
      let userMessage = '';
      if (response.status === 400) {
        userMessage = '잘못된 요청입니다. 메시지를 다시 확인해주세요.';
      } else if (response.status === 401) {
        userMessage = 'AI 서비스 인증 오류. 관리자에게 문의하세요.';
      } else if (response.status === 429) {
        userMessage = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
      } else if (response.status === 500) {
        userMessage = 'AI 서비스에 일시적 문제가 발생했습니다.';
      } else if (response.status >= 500) {
        userMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      } else {
        userMessage = '메시지 전송 중 문제가 발생했습니다.';
      }
      
      return new Response(
        JSON.stringify({ 
          error: userMessage,
          details: errorMessage,
          status: response.status
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!response.body) {
      return new Response(
        JSON.stringify({ error: 'AI 응답 스트림이 없습니다' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Streaming response started');

    // SSE 스트림 반환
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(encoder.encode(chunk));
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
      JSON.stringify({ 
        error: error?.message || '서버 오류가 발생했습니다',
        details: error?.stack || undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
