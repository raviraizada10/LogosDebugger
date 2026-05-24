import { NextRequest, NextResponse } from 'next/server';
import { runIntegratedAgentLoop, terminateAgentProcess } from '@/lib/agentEngine';
import { serverTelemetryBus } from '@/lib/serverBus';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || !body.sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const { sessionId, prompt, workspace, gemmaModel, gemmaApiUrl } = body;

    console.log(`[agentEngine] Launching integrated agent loop for session: ${sessionId}`);

    // Clean teardown if the Next.js API call is aborted by the client
    req.signal.addEventListener('abort', () => {
      console.log(`[agentEngine] API call aborted for session: ${sessionId}. Triggering teardown.`);
      terminateAgentProcess(sessionId);
    });

    // Fire-and-forget: kick off the agent loop asynchronously
    runIntegratedAgentLoop(sessionId, prompt || '', workspace || '', gemmaModel || '', gemmaApiUrl || '').catch((err: unknown) => {
      console.error('[agentEngine] Loop error:', err);
      serverTelemetryBus.next({
        sessionId,
        timestamp: Date.now(),
        event: { type: 'log', level: 'error', message: `Agent loop failed: ${err instanceof Error ? err.message : String(err)}` },
        status: 'error',
      });
    });

    return NextResponse.json({ success: true, sessionId });
  } catch (error: unknown) {
    console.error('Error starting integrated session:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to start session', details: message }, { status: 500 });
  }
}
