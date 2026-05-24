import { NextRequest, NextResponse } from 'next/server';
import { serverTelemetryBus, TelemetryEvent } from '@/lib/serverBus';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const { sessionId, token, event, status } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing required field: sessionId' },
        { status: 400 }
      );
    }

    // Construct telemetry event
    const telemetryEvent: TelemetryEvent = {
      sessionId,
      timestamp: Date.now(),
      ...(token !== undefined && { token }),
      ...(event !== undefined && { event }),
      ...(status !== undefined && { status }),
    };

    // Emit event on server bus
    serverTelemetryBus.next(telemetryEvent);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error in POST /api/telemetry:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filterSessionId = searchParams.get('sessionId');

  const encoder = new TextEncoder();

  const customStream = new ReadableStream({
    start(controller) {
      // Send connection established event
      controller.enqueue(encoder.encode('retry: 1000\n\n'));
      controller.enqueue(encoder.encode('event: ping\ndata: "connected"\n\n'));

      // Keep connection alive with a ping interval
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('event: ping\ndata: "ping"\n\n'));
        } catch {
          // If stream is closed, clear interval
          clearInterval(pingInterval);
        }
      }, 15000);

      // Subscribe to the RxJS subject
      const subscription = serverTelemetryBus.subscribe({
        next(event) {
          // Optional filtering by sessionId
          if (filterSessionId && event.sessionId !== filterSessionId) {
            return;
          }
          try {
            // Write SSE formatted event
            controller.enqueue(
              encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            subscription.unsubscribe();
            clearInterval(pingInterval);
          }
        },
        error(err: unknown) {
          console.error('SSE Telemetry stream error:', err);
          try {
            controller.close();
          } catch {}
          subscription.unsubscribe();
          clearInterval(pingInterval);
        },
        complete() {
          try {
            controller.close();
          } catch {}
          subscription.unsubscribe();
          clearInterval(pingInterval);
        }
      });

      // Clean up when the client disconnects or connection is aborted
      req.signal.addEventListener('abort', () => {
        subscription.unsubscribe();
        clearInterval(pingInterval);
      });
    },
    cancel() {
      // Cleanup is also handled by abort listener
    }
  });

  return new NextResponse(customStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
