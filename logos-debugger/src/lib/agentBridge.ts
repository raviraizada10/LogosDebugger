import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';

// ANSI escape codes for professional CLI color output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

interface ChatCompletionResult {
  type: 'complete' | 'tool_call';
  name?: string;
  args?: Record<string, unknown>;
  partialContent?: string;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Sends a POST request to the Next.js telemetry endpoint to update the Logos frontend
 */
async function postTelemetry(
  sessionId: string,
  token?: string,
  event?: unknown,
  status?: string
): Promise<void> {
  const telemetryUrl = 'http://localhost:3000/api/telemetry';
  try {
    await fetch(telemetryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        ...(token !== undefined && { token }),
        ...(event !== undefined && { event }),
        ...(status !== undefined && { status }),
      }),
    });
  } catch {
    // Silently ignore telemetry transmission errors if the debugger server is offline
  }
}

/**
 * Connects to LM Studio's SSE stream and streams tokens back while parsing for tool calls
 */
async function streamChatCompletion(
  sessionId: string,
  messages: Message[],
  gemmaModel?: string,
  gemmaApiUrl?: string
): Promise<ChatCompletionResult> {
  const lmStudioUrl = gemmaApiUrl || 'http://localhost:1234/api/v1/chat';
  const modelName = gemmaModel || 'google/gemma-4-e2b';
  const abortController = new AbortController();

  let accumulatedContent = '';

  // Extract the system prompt
  const systemMessage = messages.find(m => m.role === 'system');
  const systemPrompt = systemMessage ? systemMessage.content : '';

  // Compile conversational history into structured prompt markup inside the "input" field
  const historyText = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
    .join('\n\n') + '\n\nAgent:';

  // Check if standard OpenAI compatible endpoint (contains completions or /v1/chat/completions)
  const isStandardOpenAI = lmStudioUrl.includes('/completions') || 
                           lmStudioUrl.includes('/v1/chat/completions') || 
                           (lmStudioUrl.includes('/v1/chat') && !lmStudioUrl.includes('/api/v1/chat'));

  const requestBody = isStandardOpenAI 
    ? {
        model: modelName,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: true,
        temperature: 0.2
      }
    : {
        model: modelName,
        system_prompt: systemPrompt,
        input: historyText,
        stream: true,
        temperature: 0.2,
      };

  try {
    const response = await fetch(lmStudioUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`LLM provider returned status ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let partialLine = '';

    if (!reader) {
      throw new Error('LM Studio response body is not readable');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = (partialLine + chunk).split('\n');
        partialLine = lines.pop() || '';

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned) continue;
          if (cleaned === 'data: [DONE]') {
            break;
          }

          let token = '';
          if (cleaned.startsWith('data:')) {
            const rawJSON = cleaned.slice(5).trim();
            try {
              const parsed = JSON.parse(rawJSON);
              token =
                parsed.choices?.[0]?.delta?.content ||
                parsed.response ||
                parsed.text ||
                parsed.content ||
                '';
            } catch {
              // If not JSON, treat raw payload as a raw token
              token = rawJSON;
            }
          } else {
            try {
              const parsed = JSON.parse(cleaned);
              token =
                parsed.choices?.[0]?.delta?.content ||
                parsed.response ||
                parsed.text ||
                parsed.content ||
                '';
            } catch {}
          }

          if (token) {
            accumulatedContent += token;

            // Stream token live in the terminal
            process.stdout.write(token);

            // Stream token live to the Logos debugger server
            await postTelemetry(sessionId, token);

            // Check if a complete opening tool call has been generated
            const callMatch = accumulatedContent.match(
              /<call\s+name="([^"]+)"\s+args="((?:[^"\\]|\\.)*)"\s*>/
            );
            if (callMatch) {
              const name = callMatch[1];
              const argsStr = callMatch[2].replace(/\\"/g, '"');
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(argsStr) as Record<string, unknown>;
              } catch {
                args = { raw: argsStr };
              }

              // Extract all content generated prior to the tag opening
              const tagStartIndex = accumulatedContent.indexOf(callMatch[0]);
              const partialContentBeforeCall = accumulatedContent.substring(0, tagStartIndex);

              // Instantly abort the active stream connection
              abortController.abort();

              return {
                type: 'tool_call',
                name,
                args,
                partialContent: partialContentBeforeCall + callMatch[0],
              };
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Stream aborted cleanly due to tool call detection
        const callMatch = accumulatedContent.match(
          /<call\s+name="([^"]+)"\s+args="((?:[^"\\]|\\.)*)"\s*>/
        );
        if (callMatch) {
          const name = callMatch[1];
          const argsStr = callMatch[2].replace(/\\"/g, '"');
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(argsStr) as Record<string, unknown>;
          } catch {
            args = { raw: argsStr };
          }
          const tagStartIndex = accumulatedContent.indexOf(callMatch[0]);
          const partialContentBeforeCall = accumulatedContent.substring(0, tagStartIndex);

          return {
            type: 'tool_call',
            name,
            args,
            partialContent: partialContentBeforeCall + callMatch[0],
          };
        }
      } else {
        throw err;
      }
    } finally {
      reader.releaseLock();
    }

    return {
      type: 'complete',
      partialContent: accumulatedContent,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      const callMatch = accumulatedContent.match(
        /<call\s+name="([^"]+)"\s+args="((?:[^"\\]|\\.)*)"\s*>/
      );
      if (callMatch) {
        const name = callMatch[1];
        const argsStr = callMatch[2].replace(/\\"/g, '"');
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(argsStr) as Record<string, unknown>;
        } catch {
          args = { raw: argsStr };
        }
        const tagStartIndex = accumulatedContent.indexOf(callMatch[0]);
        const partialContentBeforeCall = accumulatedContent.substring(0, tagStartIndex);

        return {
          type: 'tool_call',
          name,
          args,
          partialContent: partialContentBeforeCall + callMatch[0],
        };
      }
    }

    console.log(
      `\n${COLORS.red}[CONNECTION WARNING] Failed to connect to LM Studio at http://localhost:1234/api/v1/chat.${COLORS.reset}`
    );
    console.log(
      `${COLORS.yellow}Make sure LM Studio is running, has the Chat API server started, and a model (e.g. google/gemma-4-e2b) is loaded!${COLORS.reset}\n`
    );
    throw error;
  }
}

/**
 * Registers the pending tool execution in the debugger session Map and waits for developer approval/steering
 */
async function callSessionWait(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ action: 'approve' | 'steer'; notes?: string }> {
  const stepId = `step-${Date.now()}`;
  const waitUrl = 'http://localhost:3000/api/session/wait';

  try {
    const res = await fetch(waitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        stepId,
        toolName,
        args,
      }),
    });

    if (!res.ok) {
      throw new Error(`Wait endpoint returned status ${res.status}: ${res.statusText}`);
    }

    return (await res.json()) as { action: 'approve' | 'steer'; notes?: string };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `${COLORS.red}[API ERROR] Failed to connect to wait endpoint: ${message}${COLORS.reset}`
    );
    console.log(
      `${COLORS.yellow}Defaulting to AUTO-APPROVING tool call since wait server is offline...${COLORS.reset}`
    );
    return { action: 'approve' };
  }
}

/**
 * Runs a simulated tool execution returning realistic trace variables/logs to feed back to the model
 */
function runSimulatedTool(name: string, args: Record<string, unknown>): Record<string, unknown> | Record<string, unknown>[] {
  console.log(`\n${COLORS.bright}${COLORS.blue}[SIMULATOR] Executing "${name}"...${COLORS.reset}`);
  switch (name) {
    case 'authMiddleware':
      return {
        userId: args.userId || 2049,
        role: args.role || 'pro_tier',
        status: 'authenticated',
        expiresIn: '3600s',
      };
    case 'dbQuery': {
      const sql = typeof args.sql === 'string' ? args.sql : '';
      if (sql.includes('999') || sql.includes('error')) {
        return {
          error: 'SQL error: Row lock contention or user not found',
          code: 'USER_NOT_FOUND',
          rows: [],
        };
      }
      return [
        {
          id: args.userId || 2049,
          username: 'alex_pro_2049',
          status: 'ACTIVE',
          tier: 'PRO',
          balance: 299.0,
        },
      ];
    }
    case 'rateLimiter':
      return {
        window: args.window || '60s',
        limit: args.limit || 1000,
        consumed: 14,
        status: 'PASSED',
      };
    case 'userService':
      return {
        sku: args.sku || 'GEMMA-4X',
        quantity: args.quantity || 1,
        status: 'INVENTORY_LOCKED',
        stockRemaining: 42,
      };
    case 'paymentGateway':
      // Force transaction decline to trigger checkout error handling and rollback logs!
      return {
        success: false,
        error: 'card_declined',
        code: 'INSUFFICIENT_FUNDS',
        message: 'The transaction was declined due to insufficient funds in the linked account.',
      };
    case 'userServiceRollback':
      return {
        sku: args.sku || 'GEMMA-4X',
        status: 'LOCK_RELEASED',
        stockCount: 43,
      };
    case 'analyticsQueue':
      return {
        status: 'PUBLISHED',
        routingKey: args.routingKey || 'checkout.failed',
        exchange: 'amq.direct',
        timestamp: Date.now(),
      };
    default:
      return {
        status: 'SUCCESS',
        tool: name,
        args,
        message: 'Mock execution successful',
      };
  }
}

/**
 * Streams characters of a text segment sequentially to the telemetry route to simulate real-time typing
 */
async function streamTelemetryTokens(sessionId: string, text: string): Promise<void> {
  const words = text.split(/(\s+)/);
  for (const word of words) {
    if (!word) continue;
    process.stdout.write(word);
    await postTelemetry(sessionId, word);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

/**
 * Orchestrates the main recursive interactive agent loop
 */
export async function runAgentLoop(
  sessionId: string, 
  customPrompt?: string,
  gemmaModel?: string,
  gemmaApiUrl?: string
): Promise<void> {
  const systemPrompt = `You are Logos, an elite Interactive Thinking Mode Code Debugger.
Your task is to analyze the codebase context and output a precise resolution.
CRITICAL: You MUST structure your entire response using the following XML tags:
1. <thought>Your analytical reasoning here...</thought>
2. <step name="step_name" args="{}">Your structural step context here...</step>
3. <call name="tool_name" args="{}">Simulate a tool execution...</call>
4. <response>Your code changes or tool output here...</response>
Ensure every tool call is enclosed in <call name="..." args="{}">...</call> and you wait for execution results.`;

  let userContent = customPrompt || `DEBUGGING CONTEXT:
Target File: src/components/paymentService.ts
Error Log: TypeError: Cannot read properties of undefined (reading 'charge') at billing.ts:L45

Please analyze this error stack and suggest a fix. Ensure you utilize the required XML tags <thought>, <step>, <call>, and <response> throughout your reasoning chain.`;

  // Parse and inject referenced files dynamically
  if (userContent && userContent.includes('/ref ')) {
    try {
      const refRegex = /\/ref\s+([^\s\n]+)/g;
      let match;
      let filesContext = '';
      
      // Reset regex state
      refRegex.lastIndex = 0;
      
      while ((match = refRegex.exec(userContent)) !== null) {
        const filePath = match[1];
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.basename(filePath);
            filesContext += `\n\n--- FILE CONTENTS: ${relativePath} (${filePath}) ---\n\`\`\`\n${content}\n\`\`\`\n`;
            
            // Post telemetry so file tree explorer shows orange glows in the UI
            await postTelemetry(sessionId, undefined, {
              type: 'file-accessed',
              filePath,
              operation: 'read'
            });
          }
        }
      }
      
      if (filesContext) {
        // Build rich visual prompt
        userContent = `[LOCAL FILE SYSTEM ATTACHMENTS]${filesContext}\n\nUSER QUESTION & INSTRUCTIONS: ${userContent}`;
      }
    } catch (err: unknown) {
      console.error('[agentBridge] File reference injection error:', err);
    }
  }

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userContent,
    },
  ];

  let loop = true;
  let turn = 1;

  while (loop) {
    console.log(
      `\n${COLORS.bright}${COLORS.blue}[TURN ${turn}] Contacting LM Studio Chat Daemon...${COLORS.reset}`
    );

    // Update telemetry state to thinking
    await postTelemetry(sessionId, undefined, undefined, 'thinking');

    const result = await streamChatCompletion(sessionId, messages, gemmaModel, gemmaApiUrl);

    if (result.type === 'complete') {
      console.log(
        `\n\n${COLORS.bright}${COLORS.green}[COMPLETE] Agent execution completed successfully!${COLORS.reset}`
      );
      await postTelemetry(sessionId, undefined, undefined, 'completed');
      loop = false;
    } else if (result.type === 'tool_call') {
      const { name, args, partialContent } = result;
      if (!name || !args) continue;
      turn++;

      console.log(
        `\n\n${COLORS.bright}${COLORS.yellow}[WAITING] Intercepted tool call: "${name}"${COLORS.reset}`
      );
      console.log(`${COLORS.dim}Arguments: ${JSON.stringify(args, null, 2)}${COLORS.reset}`);

      // Consult the wait endpoint
      const decision = await callSessionWait(sessionId, name, args);

      console.log(
        `\n${COLORS.bright}${
          decision.action === 'approve' ? COLORS.green : COLORS.red
        }[DECISION] Developer ${
          decision.action === 'approve' ? 'APPROVED' : 'STEERED'
        } execution.${COLORS.reset}`
      );
      if (decision.notes) {
        console.log(`${COLORS.dim}Developer Instructions: ${decision.notes}${COLORS.reset}`);
      }

      if (decision.action === 'approve') {
        // Run simulation
        const toolResult = runSimulatedTool(name, args);

        // Format telemetry response block
        const responseTokens = `\n<response>${JSON.stringify(
          toolResult
        )}</response>\n</call>\n`;

        // Typographically stream response tokens to UI
        await streamTelemetryTokens(sessionId, responseTokens);

        // Append complete tool transaction back into chat history
        const updatedAssistantMessage = (partialContent || '') + responseTokens;
        messages.push({ role: 'assistant', content: updatedAssistantMessage });
      } else {
        console.log(
          `${COLORS.yellow}[STEERING] Injecting developer guidance into context history...${COLORS.reset}`
        );

        // Save progress before the tool call
        messages.push({ role: 'assistant', content: partialContent || '' });
        messages.push({
          role: 'user',
          content: `[DEVELOPER INTERCEPTION] Tool execution for "${name}" was blocked/steered by the developer with notes: "${
            decision.notes || 'Do not execute. Please find an alternate solution.'
          }". Please adjust your approach, do not run the tool with the previous parameters, and proceed.`,
        });
      }
    }
  }
}

// Check if running as standard node entry-point
const isMain =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('agentBridge.ts') ||
    process.argv[1].endsWith('agentBridge'));

if (isMain) {
  const sessionId =
    process.argv[2] || `session-${Math.random().toString(36).substring(2, 9)}`;
  const customPrompt = process.argv[3] || undefined;
  
  console.log(
    `\n${COLORS.bright}${COLORS.cyan}=== Logos Interactive Agent Bridge Active ===${COLORS.reset}`
  );
  console.log(`${COLORS.dim}Session ID: ${sessionId}${COLORS.reset}\n`);
  if (customPrompt) {
    console.log(`${COLORS.dim}Prompt: ${customPrompt}${COLORS.reset}\n`);
  }

  runAgentLoop(sessionId, customPrompt).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${COLORS.red}Agent Loop Fatal Exception:${COLORS.reset}`, message);
  });
}
