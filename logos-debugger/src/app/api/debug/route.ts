import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const xmlChunks = [
  "<thought>Initializing the QuickSort debugging process.\nTarget Array: [29, 10, 14, 37, 13]\nArray Size: 5\nSelecting the last element (13) as the initial pivot.</thought>\n",
  
  "<step name=\"quickSort\" args=\"{\\\"arr\\\":[29,10,14,37,13],\\\"low\\\":0,\\\"high\\\":4}\">",
  "<thought>Inside the main quickSort function block. Sorting indices 0 to 4.\nArray portion: [29, 10, 14, 37, 13]\nWe will partition the array and position the pivot element (13) at its correct index.</thought>\n",
  
  "<call name=\"partition\" args=\"{\\\"arr\\\":[29,10,14,37,13],\\\"low\\\":0,\\\"high\\\":4,\\\"pivot\\\":13}\">",
  "Initializing partition indices: low = 0, high = 4. Pivot value = 13. Setting index i = -1 (low - 1). ",
  "Scanning elements j from 0 to 3 to compare with pivot 13... \n",
  
  "Comparing index j = 0: arr[0] = 29. 29 > 13, no swap required. i = -1. ",
  "Comparing index j = 1: arr[1] = 10. 10 <= 13. Incrementing i to 0. Swapping arr[0] (29) with arr[1] (10)... \n",
  "<response>Swapped 29 and 10. Current Array status: [10, 29, 14, 37, 13]</response>\n",
  
  "Comparing index j = 2: arr[2] = 14. 14 > 13, no swap required. i = 0. ",
  "Comparing index j = 3: arr[3] = 37. 37 > 13, no swap required. i = 0. \n",
  
  "Scan complete. Now placing pivot element 13 in its final position. Swapping index i + 1 (1) with index high (4) containing pivot 13... \n",
  "<response>Swapped 29 and 13. Current Array status: [10, 13, 14, 37, 29]. Partition index returned: 1.</response>\n",
  "</call>\n",
  
  "<thought>Partition operation complete. Pivot element 13 is locked at sorted position index 1. ",
  "Array state: [10, 13, 14, 37, 29]\nNext, we recursively sort the left subarray (indices 0 to 0) and the right subarray (indices 2 to 4).</thought>\n",
  
  "<call name=\"quickSort\" args=\"{\\\"arr\\\":[10],\\\"low\\\":0,\\\"high\\\":0}\">",
  "<thought>Left recursive call for indices 0 to 0.\nSubarray length <= 1. This is the recursion base case.</thought>\n",
  "<response>Base case reached. Subarray is already sorted. Returning.</response>",
  "</call>\n",
  
  "<call name=\"quickSort\" args=\"{\\\"arr\\\":[14,37,29],\\\"low\\\":2,\\\"high\\\":4}\">",
  "<thought>Right recursive call for indices 2 to 4. Sorting subarray [14, 37, 29] with length 3.\nSelecting the last element (29) as the pivot.</thought>\n",
  
  "<call name=\"partition\" args=\"{\\\"arr\\\":[14,37,29],\\\"low\\\":2,\\\"high\\\":4,\\\"pivot\\\":29}\">",
  "Scanning elements j from 2 to 3 to compare with pivot 29. Setting index i = 1 (low - 1)... ",
  "Comparing index j = 2: arr[2] = 14. 14 <= 29. Incrementing i to 2. Swapping arr[2] (14) with arr[2] (14) (no-op). ",
  "Comparing j = 3: arr[3] = 37. 37 > 29, no swap required. i = 2. ",
  "Scan complete. Swapping index i + 1 (3) with index high (4) containing pivot 29... \n",
  "<response>Swapped 37 and 29. Current Array status: [10, 13, 14, 29, 37]. Partition index returned: 3.</response>\n",
  "</call>\n",
  
  "<thought>Partition complete. Pivot element 29 is locked at sorted position index 3. ",
  "Array state: [10, 13, 14, 29, 37]\nRecursively sorting left subarray [14] (indices 2 to 2) and right subarray [37] (indices 4 to 4).</thought>\n",
  
  "<call name=\"quickSort\" args=\"{\\\"arr\\\":[14],\\\"low\\\":2,\\\"high\\\":2}\">",
  "<thought>Left recursive call for indices 2 to 2.\nBase case reached. Length <= 1.</thought>\n",
  "<response>Subarray is sorted. Returning.</response>",
  "</call>\n",
  
  "<call name=\"quickSort\" args=\"{\\\"arr\\\":[37],\\\"low\\\":4,\\\"high\\\":4}\">",
  "<thought>Right recursive call for indices 4 to 4.\nBase case reached. Length <= 1.</thought>\n",
  "<response>Subarray is sorted. Returning.</response>",
  "</call>\n",
  
  "</call>\n",
  
  "<thought>All recursive divisions solved successfully.\nNo further operations in call stack. ",
  "Final sorted array is: [10, 13, 14, 29, 37]\nQuickSort compilation and execution trace completed successfully.</thought>",
  "</step>"
];

interface TraceEvent {
  type: 'thought' | 'call' | 'response' | 'step';
  name?: string;
  args?: Record<string, any>;
  content: string;
  status?: 'running' | 'completed' | 'failed';
  parentId?: string;
  log?: {
    level: 'info' | 'warn' | 'error' | 'trace';
    message: string;
  };
  variable?: {
    name: string;
    oldValue: any;
    newValue: any;
  };
}

const jsonEvents: TraceEvent[] = [
  {
    type: 'thought',
    content: "Initializing the QuickSort debugging process. Target Array: [29, 10, 14, 37, 13] (Size: 5). Selecting the last element (13) as the initial pivot.",
    status: 'completed',
    log: { level: 'info', message: "QuickSort debug run initiated." },
    variable: { name: "arr", oldValue: null, newValue: [29, 10, 14, 37, 13] }
  },
  {
    type: 'step',
    name: 'quickSort',
    args: { arr: [29, 10, 14, 37, 13], low: 0, high: 4 },
    content: "Inside the main quickSort function block. Sorting indices 0 to 4. Array portion: [29, 10, 14, 37, 13]. We will partition the array and position the pivot element (13) at its correct index.",
    status: 'running',
    log: { level: 'info', message: "Entering quickSort low=0 high=4." }
  },
  {
    type: 'call',
    name: 'partition',
    args: { arr: [29, 10, 14, 37, 13], low: 0, high: 4, pivot: 13 },
    content: "Initializing partition indices: low = 0, high = 4. Pivot value = 13. Setting index i = -1 (low - 1). Scanning elements j from 0 to 3 to compare with pivot 13...",
    status: 'running',
    log: { level: 'info', message: "Executing tool call: partition" }
  },
  {
    type: 'response',
    content: "Swapped 29 and 10. Current Array status: [10, 29, 14, 37, 13]",
    status: 'completed',
    log: { level: 'trace', message: "Partition swap performed at indices 0 and 1." },
    variable: { name: "arr", oldValue: [29, 10, 14, 37, 13], newValue: [10, 29, 14, 37, 13] }
  },
  {
    type: 'response',
    content: "Swapped 29 and 13. Current Array status: [10, 13, 14, 37, 29]. Partition index returned: 1.",
    status: 'completed',
    log: { level: 'trace', message: "Partition swap pivot to final index 1." },
    variable: { name: "arr", oldValue: [10, 29, 14, 37, 13], newValue: [10, 13, 14, 37, 29] }
  },
  {
    type: 'thought',
    content: "Partition operation complete. Pivot element 13 is locked at sorted position index 1. Array state: [10, 13, 14, 37, 29]. Next, we recursively sort the left subarray (indices 0 to 0) and the right subarray (indices 2 to 4).",
    status: 'completed'
  },
  {
    type: 'call',
    name: 'quickSort',
    args: { arr: [10], low: 0, high: 0 },
    content: "Left recursive call for indices 0 to 0. Subarray length <= 1. This is the recursion base case.",
    status: 'running',
    log: { level: 'info', message: "Executing tool call: quickSort left subarray" }
  },
  {
    type: 'response',
    content: "Base case reached. Subarray is already sorted. Returning.",
    status: 'completed',
    log: { level: 'info', message: "quickSort (0,0) finished." }
  },
  {
    type: 'call',
    name: 'quickSort',
    args: { arr: [14, 37, 29], low: 2, high: 4 },
    content: "Right recursive call for indices 2 to 4. Sorting subarray [14, 37, 29] with length 3. Selecting the last element (29) as the pivot.",
    status: 'running',
    log: { level: 'info', message: "Executing tool call: quickSort right subarray" }
  },
  {
    type: 'call',
    name: 'partition',
    args: { arr: [14, 37, 29], low: 2, high: 4, pivot: 29 },
    content: "Scanning elements j from 2 to 3 to compare with pivot 29. Setting index i = 1 (low - 1)... Comparing index j = 2: arr[2] = 14 <= 29. Incrementing i to 2. Swapping arr[2] (14) with arr[2] (14) (no-op). Comparing j = 3: arr[3] = 37 > 29, no swap required. Scan complete. Swapping index i + 1 (3) with index high (4) containing pivot 29...",
    status: 'running',
    log: { level: 'info', message: "Executing partition on right subarray." }
  },
  {
    type: 'response',
    content: "Swapped 37 and 29. Current Array status: [10, 13, 14, 29, 37]. Partition index returned: 3.",
    status: 'completed',
    log: { level: 'trace', message: "Partition swap pivot to final index 3." },
    variable: { name: "arr", oldValue: [10, 13, 14, 37, 29], newValue: [10, 13, 14, 29, 37] }
  },
  {
    type: 'thought',
    content: "Partition complete. Pivot element 29 is locked at sorted position index 3. Array state: [10, 13, 14, 29, 37]. Recursively sorting left subarray [14] (indices 2 to 2) and right subarray [37] (indices 4 to 4).",
    status: 'completed'
  },
  {
    type: 'call',
    name: 'quickSort',
    args: { arr: [14], low: 2, high: 2 },
    content: "Left recursive call for indices 2 to 2. Base case reached. Length <= 1.",
    status: 'running',
    log: { level: 'info', message: "quickSort (2,2) running." }
  },
  {
    type: 'response',
    content: "Subarray is sorted. Returning.",
    status: 'completed',
    log: { level: 'info', message: "quickSort (2,2) completed." }
  },
  {
    type: 'call',
    name: 'quickSort',
    args: { arr: [37], low: 4, high: 4 },
    content: "Right recursive call for indices 4 to 4. Base case reached. Length <= 1.",
    status: 'running',
    log: { level: 'info', message: "quickSort (4,4) running." }
  },
  {
    type: 'response',
    content: "Subarray is sorted. Returning.",
    status: 'completed',
    log: { level: 'info', message: "quickSort (4,4) completed." }
  },
  {
    type: 'thought',
    content: "All recursive divisions solved successfully. No further operations in call stack. Final sorted array is: [10, 13, 14, 29, 37]. QuickSort compilation and execution trace completed successfully.",
    status: 'completed',
    log: { level: 'info', message: "QuickSort algorithm execution completed." },
    variable: { name: "status", oldValue: "sorting", newValue: "completed" }
  }
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'text'; // 'text' or 'json'
  const delayMs = parseInt(searchParams.get('delay') || '40', 10);
  const modelName = searchParams.get('model') || 'gemma2'; // default to gemma2 or gemma4

  const encoder = new TextEncoder();

  // Try to connect to local runners (Ollama on 11434 or LM Studio on 1234)
  let useLiveModel = false;
  let provider: 'ollama' | 'lmstudio' | null = null;
  let modelResponse: Response | null = null;

  const systemPrompt = `You are Logos, an elite Interactive Thinking Mode Code Debugger.
Your task is to analyze the codebase context and output a precise resolution.
CRITICAL: You MUST structure your entire response using the following XML tags:
1. <thought id="step_id" title="Step Title">Your analytical reasoning here...</thought>
2. <step name="step_name" args="{}">Your structural step context here...</step>
3. <call name="tool_name" args="{}">Simulate a tool execution...</call>
4. <response>Your code changes or tool output here...</response>`;

  const promptText = `DEBUGGING CONTEXT:
Target File: src/components/paymentService.ts
Error Log: TypeError: Cannot read properties of undefined (reading 'charge') at billing.ts:L45

Please analyze this error stack and suggest a fix. Ensure you utilize the required XML tags <thought>, <step>, <call>, and <response> throughout your reasoning chain.`;

  // 1. Try Ollama (Port 11434)
  try {
    const checkController = new AbortController();
    const checkTimeout = setTimeout(() => checkController.abort(), 1500);
    const checkRes = await fetch('http://localhost:11434/api/tags', { signal: checkController.signal });
    clearTimeout(checkTimeout);

    if (checkRes.ok) {
      modelResponse = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: promptText,
          system: systemPrompt,
          stream: true,
          options: { temperature: 0.2, num_ctx: 16384 }
        }),
      });
      if (modelResponse.ok) {
        useLiveModel = true;
        provider = 'ollama';
      }
    }
  } catch (err) {
    // Ollama not active, proceed to check LM Studio
  }

  // 2. Try LM Studio (Port 1234) if Ollama is not active
  if (!useLiveModel) {
    try {
      const checkController = new AbortController();
      const checkTimeout = setTimeout(() => checkController.abort(), 1500);
      // Ping the models endpoint for an instantaneous pre-flight check
      const checkRes = await fetch('http://localhost:1234/v1/models', {
        method: 'GET',
        signal: checkController.signal
      });
      clearTimeout(checkTimeout);

      if (checkRes.ok) {
        // Endpoint is active! Now initiate the streaming connection
        modelResponse = await fetch('http://localhost:1234/api/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemma-4-e2b',
            system_prompt: systemPrompt,
            input: promptText,
            stream: true
          }),
        });
        if (modelResponse.ok) {
          useLiveModel = true;
          provider = 'lmstudio';
        }
      }
    } catch (err) {
      // Both runners offline
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // Ignore write failure on client disconnect
        }
      };

      const sendRawSSE = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Ignore
        }
      };

      // 1. LIVE GEMMA 4 STREAM ROUTE (Ollama or LM Studio)
      if (useLiveModel && modelResponse) {
        sendSSE('log', JSON.stringify({
          level: 'info',
          message: `[SYSTEM] Successfully established live connection to Gemma via ${provider === 'ollama' ? 'Ollama' : 'LM Studio'} at ${provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/api/v1/chat'}`
        }));

        const reader = modelResponse.body?.getReader();
        const decoder = new TextDecoder();
        let partialLine = '';

        if (reader) {
          try {
            while (true) {
              if (req.signal.aborted) break;
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = (partialLine + chunk).split('\n');
              partialLine = lines.pop() || '';

              for (const line of lines) {
                const cleanedLine = line.trim();
                if (!cleanedLine) continue;

                // Handle Ollama generation tokens
                if (provider === 'ollama') {
                  try {
                    const parsed = JSON.parse(cleanedLine);
                    const token = parsed.response;
                    if (token) {
                      sendRawSSE(token);
                      if (token.includes('<call')) {
                        sendSSE('log', JSON.stringify({ level: 'info', message: 'Model initiated tool execution' }));
                      }
                    }
                  } catch {
                    // Split line
                  }
                } 
                // Handle LM Studio Polymorphic Ingestion (supports custom api/v1/chat and standard OpenAI)
                else if (provider === 'lmstudio') {
                  if (cleanedLine.startsWith('data:')) {
                    const rawData = cleanedLine.slice(5).trim();
                    if (rawData === '[DONE]') break;
                    
                    try {
                      const parsed = JSON.parse(rawData);
                      const token = parsed.choices?.[0]?.delta?.content || parsed.response || parsed.text || parsed.content;
                      if (token) {
                        sendRawSSE(token);
                        if (token.includes('<call')) {
                          sendSSE('log', JSON.stringify({ level: 'info', message: 'Model initiated tool execution' }));
                        }
                      }
                    } catch {
                      // Fallback: If data: prefix but not JSON, treat raw data as literal token
                      sendRawSSE(rawData);
                    }
                  } else {
                    // Handle raw text chunk or raw NDJSON line (no "data:" prefix)
                    try {
                      const parsed = JSON.parse(cleanedLine);
                      const token = parsed.choices?.[0]?.delta?.content || parsed.response || parsed.text || parsed.content;
                      if (token) {
                        sendRawSSE(token);
                        if (token.includes('<call')) {
                          sendSSE('log', JSON.stringify({ level: 'info', message: 'Model initiated tool execution' }));
                        }
                      }
                    } catch {
                      // Fallback: Treat whole line as literal text
                      sendRawSSE(cleanedLine);
                    }
                  }
                }
              }
            }
          } catch (err) {
            sendSSE('log', JSON.stringify({ level: 'error', message: 'Error reading local model stream: ' + String(err) }));
          } finally {
            reader.releaseLock();
          }
        }
      } 
      // 2. BACKUP SANDBOX SIMULATOR ROUTE
      else {
        // Send a prominent notification to the developer terminal UI indicating the fallback
        sendSSE('log', JSON.stringify({
          level: 'warn',
          message: `[SYSTEM] Local model daemon not detected (Ollama on 11434 / LM Studio on 1234). Defaulting to Sandbox Simulation Mode. (Tip: Start LM Studio or Ollama to connect live!)`
        }));

        if (format === 'json') {
          // Stream structured trace events one by one with a delay
          for (let i = 0; i < jsonEvents.length; i++) {
            if (req.signal.aborted) break;

            const event = jsonEvents[i];
            sendSSE('trace-event', JSON.stringify(event));

            if (event.log) {
              sendSSE('log', JSON.stringify(event.log));
            }
            if (event.variable) {
              sendSSE('variable', JSON.stringify(event.variable));
            }

            await sleep(delayMs * 15);
          }
        } else {
          // Stream text chunk-by-chunk segmenting the XML trace
          for (let i = 0; i < xmlChunks.length; i++) {
            if (req.signal.aborted) break;

            const chunk = xmlChunks[i];
            const words = chunk.split(/(\s+)/);

            for (const word of words) {
              if (req.signal.aborted) break;
              if (word.length === 0) continue;

              sendRawSSE(word);

              if (word.includes('partition')) {
                sendSSE('log', JSON.stringify({ level: 'info', message: 'Entering partition routine' }));
              }
              if (word.includes('[10, 29, 14, 37, 13]')) {
                sendSSE('variable', JSON.stringify({ variableName: 'arr', oldValue: [29, 10, 14, 37, 13], newValue: [10, 29, 14, 37, 13] }));
              }
              if (word.includes('[10, 13, 14, 37, 29]')) {
                sendSSE('variable', JSON.stringify({ variableName: 'arr', oldValue: [10, 29, 14, 37, 13], newValue: [10, 13, 14, 37, 29] }));
              }

              await sleep(delayMs);
            }
          }
        }
      }

      try {
        controller.close();
      } catch {
        // Safe check
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
