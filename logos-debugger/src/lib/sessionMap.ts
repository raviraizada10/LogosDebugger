export interface ApprovalDecision {
  action: 'approve' | 'steer';
  notes?: string;
}

export interface PendingApproval {
  sessionId: string;
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
  resolve: (decision: ApprovalDecision) => void;
  reject: (err: unknown) => void;
  createdAt: number;
}

// Persist the map on the global object during Next.js hot-reloads
const globalForSessionMap = global as unknown as {
  sessionApprovalMap?: Map<string, PendingApproval>;
};

export const sessionApprovalMap =
  globalForSessionMap.sessionApprovalMap ?? new Map<string, PendingApproval>();

if (process.env.NODE_ENV !== 'production') {
  globalForSessionMap.sessionApprovalMap = sessionApprovalMap;
}

/**
 * Returns a composite key to look up pending approvals uniquely in the map.
 */
export function getApprovalKey(sessionId: string, stepId: string): string {
  return `${sessionId}:${stepId}`;
}
