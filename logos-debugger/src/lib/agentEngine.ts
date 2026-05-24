import { spawn } from 'child_process';
import { serverTelemetryBus } from './serverBus';

// Keep track of active processes globally to prevent orphan processes on server hot-reloads
const globalForProcesses = global as unknown as {
  activeProcesses?: Map<string, any>;
};

export const activeProcesses =
  globalForProcesses.activeProcesses ?? new Map<string, any>();

if (process.env.NODE_ENV !== 'production') {
  globalForProcesses.activeProcesses = activeProcesses;
}

// Clean exit handlers to avoid leaving orphan subprocesses
const cleanAllProcesses = () => {
  for (const [sid, child] of activeProcesses.entries()) {
    console.log(`[agentEngine] Cleaning up child process for session ${sid}`);
    try {
      child.kill('SIGKILL');
    } catch {}
  }
  activeProcesses.clear();
};

if (typeof process !== 'undefined') {
  if (!(process as any)._registeredProcessCleanup) {
    (process as any)._registeredProcessCleanup = true;
    process.on('exit', cleanAllProcesses);
    process.on('SIGINT', () => {
      cleanAllProcesses();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanAllProcesses();
      process.exit(0);
    });
  }
}

/**
 * Forcefully terminates an active agent child process for the given sessionId.
 */
export function terminateAgentProcess(sessionId: string) {
  const child = activeProcesses.get(sessionId);
  if (child) {
    console.log(`[agentEngine] Terminating agent child process for session: ${sessionId}`);
    try {
      child.kill('SIGTERM');
    } catch {}
    activeProcesses.delete(sessionId);
  }
}

/**
 * Runs the integrated agent loop by spawning a Python child process
 * running 'python3 logos_agent.py'.
 *
 * @param sessionId Unique session identifier
 * @param prompt The developer prompt/debugging context
 * @param workspace Absolute path of the codebase workspace
 * @param apiKey Google Gemini API Key
 */
export async function runIntegratedAgentLoop(
  sessionId: string,
  prompt: string,
  workspace: string,
  gemmaModel?: string,
  gemmaApiUrl?: string
): Promise<void> {
  console.log(`[agentEngine] Starting integrated local Gemma run for session: ${sessionId}`);
  console.log(`[agentEngine] Workspace: ${workspace}`);

  // Clean up any existing process for this sessionId
  terminateAgentProcess(sessionId);

  // Broadcast initial "thinking" status
  serverTelemetryBus.next({ sessionId, timestamp: Date.now(), status: 'thinking' });

  const modelName = gemmaModel || 'google/gemma-4-e2b';
  const apiUrl = gemmaApiUrl || 'http://localhost:1234/api/v1/chat';

  console.log(`[agentEngine] Routing loop to local Gemma model "${modelName}" at "${apiUrl}"`);

  try {
    // Lazy-import to prevent compilation or startup circular references
    const { runAgentLoop } = await import('./agentBridge');
    
    runAgentLoop(sessionId, prompt, modelName, apiUrl).catch((err: unknown) => {
      console.error('[agentEngine] Local Gemma loop exception:', err);
      serverTelemetryBus.next({
        sessionId,
        timestamp: Date.now(),
        event: {
          type: 'log',
          level: 'error',
          message: `Local Gemma Agent Bridge failed: ${err instanceof Error ? err.message : String(err)}. Please verify LM Studio or Ollama is running and model "${modelName}" is loaded.`
        },
        status: 'error'
      });
    });
  } catch (err: unknown) {
    console.error('[agentEngine] Failed to lazy-load local agentBridge:', err);
    serverTelemetryBus.next({
      sessionId,
      timestamp: Date.now(),
      event: {
        type: 'log',
        level: 'error',
        message: `Failed to initialize local Agent Bridge module: ${err instanceof Error ? err.message : String(err)}`
      },
      status: 'error'
    });
  }
}


