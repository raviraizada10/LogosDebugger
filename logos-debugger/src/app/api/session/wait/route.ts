import { NextRequest, NextResponse } from 'next/server';
import { sessionApprovalMap, getApprovalKey, PendingApproval, ApprovalDecision } from '@/lib/sessionMap';
import { serverTelemetryBus } from '@/lib/serverBus';

async function handleWait(
  sessionId: string,
  stepId: string,
  toolName: string,
  args: Record<string, unknown>
) {
  if (!sessionId || !stepId || !toolName) {
    return NextResponse.json(
      { error: 'Missing required parameters: sessionId, stepId, toolName' },
      { status: 400 }
    );
  }

  const key = getApprovalKey(sessionId, stepId);

  // If there is an active pending approval for this step, reject it first
  if (sessionApprovalMap.has(key)) {
    const existing = sessionApprovalMap.get(key);
    existing?.reject(new Error('Superceded by a new wait request'));
    sessionApprovalMap.delete(key);
  }

  let resolvePromise!: (value: ApprovalDecision) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const decisionPromise = new Promise<ApprovalDecision>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const pending: PendingApproval = {
    sessionId,
    stepId,
    toolName,
    args,
    resolve: resolvePromise,
    reject: rejectPromise,
    createdAt: Date.now(),
  };

  sessionApprovalMap.set(key, pending);

  // Broadcast that we are awaiting approval via telemetry
  serverTelemetryBus.next({
    sessionId,
    timestamp: Date.now(),
    event: {
      type: 'awaiting-approval',
      stepId,
      toolName,
      args,
    },
    status: 'awaiting-approval',
  });

  try {
    // Wait until approve endpoint resolves this promise
    const decision = await decisionPromise;
    return NextResponse.json(decision);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message || 'Wait promise rejected' },
      { status: 410 } // 410 Gone indicates the pending approval was closed or superseded
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    const { sessionId, stepId, toolName, args } = body;
    return await handleWait(
      sessionId,
      stepId,
      toolName,
      (args as Record<string, unknown>) || {}
    );
  } catch (error: unknown) {
    console.error('Error in POST /api/session/wait:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || '';
    const stepId = searchParams.get('stepId') || '';
    const toolName = searchParams.get('toolName') || '';
    const argsStr = searchParams.get('args') || '{}';
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsStr) as Record<string, unknown>;
    } catch {}

    return await handleWait(sessionId, stepId, toolName, args);
  } catch (error: unknown) {
    console.error('Error in GET /api/session/wait:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: message },
      { status: 500 }
    );
  }
}
