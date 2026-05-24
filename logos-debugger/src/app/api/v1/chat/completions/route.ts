import { NextRequest, NextResponse } from 'next/server';
import { serverTelemetryBus } from '@/lib/serverBus';

// Ensure CORS preflight OPTIONS requests are handled gracefully
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(req: NextRequest) {
  const sessionId = 'session-ide-gemma';

  try {
    // 1. Get raw request body
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Determine target LLM endpoint (defaulting to local LM Studio)
    const targetUrl = process.env.GEMMA_PROVIDER_URL || 'http://localhost:1234/v1/chat/completions';

    // Broadcast live telemetry connection signal
    serverTelemetryBus.next({
      sessionId,
      timestamp: Date.now(),
      status: 'thinking',
    });

    // 2. Fetch from the upstream LLM provider
    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('authorization') && {
          Authorization: req.headers.get('authorization')!,
        }),
      },
      body: JSON.stringify(body),
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      serverTelemetryBus.next({
        sessionId,
        timestamp: Date.now(),
        status: 'failed',
      });
      return new NextResponse(errorText, {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Handle non-streaming responses gracefully
    if (!body.stream) {
      const data = await upstreamResponse.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Feed full content to server bus
      serverTelemetryBus.next({
        sessionId,
        timestamp: Date.now(),
        token: content,
      });

      serverTelemetryBus.next({
        sessionId,
        timestamp: Date.now(),
        status: 'completed',
      });

      return NextResponse.json(data, {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 3. Handle Streaming Response (SSE Interception)
    const upstreamReader = upstreamResponse.body?.getReader();
    if (!upstreamReader) {
      throw new Error('Upstream response body is not readable');
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let partialLine = '';

    const customStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await upstreamReader.read();
            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = (partialLine + chunk).split('\n');
            partialLine = lines.pop() || '';

            for (const line of lines) {
              const cleaned = line.trim();
              if (!cleaned) continue;

              // Enqueue original SSE event directly to downstream IDE client
              controller.enqueue(encoder.encode(line + '\n'));

              if (cleaned === 'data: [DONE]') {
                continue;
              }

              // Extract text token to stream into visualizer
              let token = '';
              if (cleaned.startsWith('data:')) {
                const rawJSON = cleaned.slice(5).trim();
                try {
                  const parsed = JSON.parse(rawJSON);
                  token = parsed.choices?.[0]?.delta?.content || '';
                } catch {
                  // Ignore parse errors for malformed intermediate chunks
                }
              }

              if (token) {
                // Publish token to server telemetry bus
                serverTelemetryBus.next({
                  sessionId,
                  timestamp: Date.now(),
                  token,
                });
              }
            }
          }

          // Flush any final lines
          if (partialLine.trim()) {
            controller.enqueue(encoder.encode(partialLine + '\n'));
          }

          // Complete the stream
          serverTelemetryBus.next({
            sessionId,
            timestamp: Date.now(),
            status: 'completed',
          });

          controller.close();
        } catch (err: unknown) {
          console.error('[Telemetry Proxy] Error processing stream:', err);
          serverTelemetryBus.next({
            sessionId,
            timestamp: Date.now(),
            status: 'failed',
          });
          controller.error(err);
        }
      },
    });

    return new NextResponse(customStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error: unknown) {
    console.error('[Telemetry Proxy] Error in chat completions endpoint:', error);
    const message = error instanceof Error ? error.message : String(error);
    
    serverTelemetryBus.next({
      sessionId,
      timestamp: Date.now(),
      status: 'failed',
    });

    return NextResponse.json(
      { error: 'Internal Server Error', details: message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
