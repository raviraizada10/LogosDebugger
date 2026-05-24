import { NextRequest, NextResponse } from 'next/server';
import { sessionApprovalMap, getApprovalKey } from '@/lib/sessionMap';
import { serverTelemetryBus } from '@/lib/serverBus';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const { sessionId, stepId, action, notes } = body;

    if (!sessionId || !stepId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, stepId, action' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'steer') {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve' or 'steer'" },
        { status: 400 }
      );
    }

    const key = getApprovalKey(sessionId, stepId);
    const pending = sessionApprovalMap.get(key);

    if (!pending) {
      return NextResponse.json(
        { error: `No pending approval found for sessionId: ${sessionId}, stepId: ${stepId}` },
        { status: 404 }
      );
    }

    // Resolve the pending promise with the action and custom developer steering notes
    pending.resolve({ action, notes });

    // Clean up from the global session map
    sessionApprovalMap.delete(key);

    // Broadcast the resolved-approval event to the RxJS telemetry stream
    serverTelemetryBus.next({
      sessionId,
      timestamp: Date.now(),
      event: {
        type: 'resolved-approval',
        stepId,
        toolName: pending.toolName,
        args: pending.args,
        action,
        notes,
      },
      status: 'resolved-approval',
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error in POST /api/session/approve:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: message },
      { status: 500 }
    );
  }
}
