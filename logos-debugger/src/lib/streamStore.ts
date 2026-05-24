/**
 * Logos Stream State Store & RxJS Event Bus
 * 
 * Implements a double-buffered Zustand store for high-performance React updates
 * during intense streaming sessions, and an RxJS event bus for streaming state 
 * transitions and debugger actions. It dynamically builds the execution graph
 * nodes and edges (fully compatible with @xyflow/react) using a dynamic tree layout.
 */

import { create } from 'zustand';
import { Subject, auditTime } from 'rxjs';
import { TraceNode, ParserEvent, LogosParser } from './logosParser';

// Type definitions matching @xyflow/react requirements
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    type: 'root' | 'thought' | 'call' | 'response' | 'step' | 'text';
    content: string;
    status: 'running' | 'completed' | 'failed';
    name?: string;
    args?: Record<string, any>;
    timestamp: number;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  type?: string;
}

export interface VariableMutation {
  id: string;
  variableName: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
  nodeId?: string;
}

export interface DebuggerLog {
  id: string;
  level: 'info' | 'warn' | 'error' | 'trace';
  message: string;
  timestamp: number;
  nodeId?: string;
}

export interface AwaitingApproval {
  sessionId: string;
  stepId: string;
  toolName: string;
  args: any;
}

export interface StreamStoreState {
  // React-reactive states
  nodes: FlowNode[];
  edges: FlowEdge[];
  traceNodes: TraceNode[]; // semantic list
  activeNodeId: string | null;
  selectedNodeId: string | null;
  isStreaming: boolean;
  playbackState: 'playing' | 'paused' | 'stopped';
  playbackSpeed: number; // multiplier (e.g. 1x, 2x)
  variableMutations: VariableMutation[];
  logs: DebuggerLog[];
  awaitingApproval: AwaitingApproval | null;
  isLiveConnected: boolean;
  accessedFiles: Record<string, 'read' | 'write'>;

  // Actions
  setNodes: (nodes: FlowNode[]) => void;
  setEdges: (edges: FlowEdge[]) => void;
  setActiveNodeId: (id: string | null) => void;
  setSelectedNodeId: (id: string | null) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  setPlaybackState: (state: 'playing' | 'paused' | 'stopped') => void;
  setPlaybackSpeed: (speed: number) => void;
  addVariableMutation: (mutation: Omit<VariableMutation, 'id' | 'timestamp'>) => void;
  addLog: (log: Omit<DebuggerLog, 'id' | 'timestamp'>) => void;
  setAwaitingApproval: (awaitingApproval: AwaitingApproval | null) => void;
  setLiveConnected: (connected: boolean) => void;
  connectLiveTelemetry: () => void;
  connectLiveGemmaDebugger: (prompt?: string, workspace?: string, gemmaModel?: string, gemmaApiUrl?: string) => void;
  disconnectLiveTelemetry: () => void;
  resetStore: () => void;
  addAccessedFile: (filePath: string, operation: 'read' | 'write') => void;

  // Double-buffering update & commit actions
  commitBuffer: () => void;
}


// Write buffers (not reactive to avoid React re-renders on every stream packet)
let writeBufferNodes: Map<string, TraceNode> = new Map();
let writeBufferActiveNodeId: string | null = null;
let writeBufferMutations: VariableMutation[] = [];
let writeBufferLogs: DebuggerLog[] = [];
let telemetryEventSource: EventSource | null = null;

/**
 * Handles incoming SSE telemetry events and polymorphic stream packet formats.
 * Integrates, parses, and commits trace actions to store state.
 */
function handleTelemetryMessage(store: StreamStoreState, eventData: string) {
  if (!eventData) return;
  try {
    const parsed = JSON.parse(eventData);
    if (parsed && typeof parsed === 'object') {
      const sessionId = parsed.sessionId || '';
      const token = parsed.token;
      const status = parsed.status;

      if (status) {
        if (status === 'thinking') {
          store.setIsStreaming(true);
          store.setPlaybackState('playing');
        } else if (status === 'completed') {
          store.setIsStreaming(false);
        }
      }

      if (token) {
        parser.write(token);
        return;
      }

      // Handle both nested and flat telemetry envelopes
      const data = parsed.event || parsed;
      const type = data.type || parsed.type;

      if (type) {
        if (type === 'awaiting-approval' || type === 'awaiting_approval') {
          store.setAwaitingApproval({
            sessionId: sessionId || data.sessionId || '',
            stepId: data.stepId,
            toolName: data.toolName,
            args: data.args,
          });
        } else if (type === 'resolved-approval' || type === 'resolved_approval') {
          store.setAwaitingApproval(null);
        } else if (type === 'file-accessed' || type === 'file_accessed') {
          const filePath = data.filePath || data.path || '';
          const operation = data.operation || data.op || 'read';
          store.addAccessedFile(filePath, operation);
        } else if (type === 'log') {
          store.addLog(data);
        } else if (type === 'variable') {
          store.addVariableMutation(data);
        } else if (type === 'trace-event' || type === 'trace_event') {
          parser.processTraceEvent(data);
        }
      }
    }
  } catch (e) {
    parser.write(eventData);
  }
}

/**
 * Computes a clean dynamic hierarchical tree layout for @xyflow/react nodes.
 * Assigns proper parent-child visual coordinates.
 */
export function computeFlowLayout(traceNodes: TraceNode[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodesMap = new Map<string, TraceNode>();
  for (const n of traceNodes) {
    nodesMap.set(n.id, n);
  }

  // Find root nodes
  const roots = traceNodes.filter(n => !n.parentId);
  
  const flowNodes: FlowNode[] = [];
  const flowEdges: FlowEdge[] = [];

  // Track the layout offsets per level
  const levelOffsets: Record<number, number> = {};

  function layoutNode(nodeId: string, depth: number) {
    const node = nodesMap.get(nodeId);
    if (!node) return;

    if (levelOffsets[depth] === undefined) {
      levelOffsets[depth] = 0;
    }

    const xSpacing = 280;
    const ySpacing = 160;
    
    // Position nodes per depth level horizontally
    const x = levelOffsets[depth] * xSpacing;
    levelOffsets[depth] += 1;
    const y = depth * ySpacing;

    flowNodes.push({
      id: node.id,
      type: 'streamingNode', // Maps to custom StreamingNode component in UI
      position: { x, y },
      data: {
        label: node.name || node.type.toUpperCase(),
        type: node.type,
        content: node.content,
        status: node.status,
        name: node.name,
        args: node.args,
        timestamp: node.timestamp
      }
    });

    if (node.parentId) {
      flowEdges.push({
        id: `edge-${node.parentId}-${node.id}`,
        source: node.parentId,
        target: node.id,
        animated: node.status === 'running',
        type: 'smoothstep'
      });
    }

    // Sort children by timestamp
    const children = traceNodes
      .filter(n => n.parentId === nodeId)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const child of children) {
      layoutNode(child.id, depth + 1);
    }
  }

  for (const root of roots) {
    layoutNode(root.id, 0);
  }

  return { nodes: flowNodes, edges: flowEdges };
}

// High-performance Zustand store
export const useStreamStore = create<StreamStoreState>((set) => ({
  nodes: [],
  edges: [],
  traceNodes: [],
  activeNodeId: null,
  selectedNodeId: null,
  isStreaming: false,
  playbackState: 'stopped',
  playbackSpeed: 1.0,
  variableMutations: [],
  logs: [],
  awaitingApproval: null,
  isLiveConnected: false,
  accessedFiles: {},

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setActiveNodeId: (activeNodeId) => set({ activeNodeId }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setPlaybackState: (playbackState) => set({ playbackState }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setAwaitingApproval: (awaitingApproval) => set({ awaitingApproval }),
  setLiveConnected: (isLiveConnected) => set({ isLiveConnected }),
  addAccessedFile: (filePath, operation) => set((state) => ({
    accessedFiles: {
      ...state.accessedFiles,
      [filePath]: operation
    }
  })),

  connectLiveTelemetry: () => {
    if (typeof window === 'undefined') return;
    if (telemetryEventSource) return;

    const store = useStreamStore.getState();
    store.resetStore();
    store.setIsStreaming(true);
    store.setPlaybackState('playing');
    store.setLiveConnected(true);

    store.addLog({
      level: 'info',
      message: 'Connecting to live agent telemetry bridge via SSE...'
    });

    try {
      const source = new EventSource('/api/telemetry');
      telemetryEventSource = source;

      source.onopen = () => {
        store.addLog({
          level: 'info',
          message: 'Live agent telemetry bridge connected successfully.'
        });
      };

      source.onerror = (err) => {
        store.addLog({
          level: 'error',
          message: 'Telemetry bridge connection encountered an error or disconnected. Attempting to reconnect...'
        });
      };

      source.onmessage = (event) => {
        handleTelemetryMessage(store, event.data);
      };

      source.addEventListener('awaiting-approval', (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          store.setAwaitingApproval(parsed);
        } catch (err) {
          store.addLog({
            level: 'error',
            message: `Failed to parse awaiting-approval event: ${err}`
          });
        }
      });

      source.addEventListener('resolved-approval', () => {
        store.setAwaitingApproval(null);
      });

      source.addEventListener('log', (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          store.addLog(parsed);
        } catch {}
      });

      source.addEventListener('variable', (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          store.addVariableMutation(parsed);
        } catch {}
      });

      source.addEventListener('trace-event', (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          parser.processTraceEvent(parsed);
        } catch {}
      });

    } catch (e) {
      store.addLog({
        level: 'error',
        message: `Failed to initialize EventSource for live telemetry: ${e}`
      });
      store.setLiveConnected(false);
    }
  },

  connectLiveGemmaDebugger: async (prompt?: string, workspace?: string, gemmaModel?: string, gemmaApiUrl?: string) => {
    if (typeof window === 'undefined') return;
    if (telemetryEventSource) return;

    const store = useStreamStore.getState();
    store.resetStore();
    store.setIsStreaming(true);
    store.setPlaybackState('playing');
    store.setLiveConnected(true);

    const sessionId = `session-live-${Math.random().toString(36).substring(2, 9)}`;

    store.addLog({
      level: 'info',
      message: `Initiating integrated stateful Gemma 4 Debugger (Session: ${sessionId})...`
    });

    try {
      // Connect to telemetry SSE endpoint scoped to our session ID
      const source = new EventSource(`/api/telemetry?sessionId=${sessionId}`);
      telemetryEventSource = source;

      source.onopen = () => {
        store.addLog({
          level: 'info',
          message: 'Telemetry channel connected. Triggering background Agent Bridge loop...'
        });
      };

      source.onerror = (err) => {
        store.addLog({
          level: 'error',
          message: 'Debugger stream connection error or completion. Closing connection...'
        });
        store.disconnectLiveTelemetry();
      };

      source.onmessage = (event) => {
        handleTelemetryMessage(store, event.data);
      };

      // Launch the background agent process using our new integrated start API
      const startRes = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, prompt, workspace, gemmaModel, gemmaApiUrl })
      });

      if (!startRes.ok) {
        throw new Error(`Failed to start integrated background agent: ${startRes.statusText}`);
      }

      store.addLog({
        level: 'info',
        message: 'Integrated background Agent Bridge spawned successfully. Streaming thoughts...'
      });

    } catch (e) {
      store.addLog({
        level: 'error',
        message: `Failed to initialize live integrated debugger: ${e instanceof Error ? e.message : String(e)}`
      });
      store.setLiveConnected(false);
    }
  },

  disconnectLiveTelemetry: () => {
    if (telemetryEventSource) {
      telemetryEventSource.close();
      telemetryEventSource = null;
    }
    const store = useStreamStore.getState();
    store.setLiveConnected(false);
    store.setIsStreaming(false);
    store.setPlaybackState('stopped');
    store.addLog({
      level: 'info',
      message: 'Disconnected live agent telemetry bridge.'
    });
  },

  addVariableMutation: (mutation) => {
    const fullMutation: VariableMutation = {
      ...mutation,
      id: `mut-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    writeBufferMutations.push(fullMutation);
    set((state) => ({ variableMutations: [...state.variableMutations, fullMutation] }));
  },

  addLog: (log) => {
    const fullLog: DebuggerLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    writeBufferLogs.push(fullLog);
    set((state) => ({ logs: [...state.logs, fullLog] }));
  },

  resetStore: () => {
    writeBufferNodes.clear();
    writeBufferActiveNodeId = null;
    writeBufferMutations = [];
    writeBufferLogs = [];
    parser.reset();
    if (telemetryEventSource) {
      telemetryEventSource.close();
      telemetryEventSource = null;
    }
    set({
      nodes: [],
      edges: [],
      traceNodes: [],
      activeNodeId: null,
      selectedNodeId: null,
      isStreaming: false,
      playbackState: 'stopped',
      playbackSpeed: 1.0,
      variableMutations: [],
      logs: [],
      awaitingApproval: null,
      isLiveConnected: false,
      accessedFiles: {}
    });
  },

  commitBuffer: () => {
    const semanticNodes = Array.from(writeBufferNodes.values());
    const { nodes, edges } = computeFlowLayout(semanticNodes);
    
    set({
      nodes,
      edges,
      traceNodes: semanticNodes,
      activeNodeId: writeBufferActiveNodeId,
      variableMutations: [...writeBufferMutations],
      logs: [...writeBufferLogs]
    });
  }
}));

// 1. RxJS Streaming Event Bus
export const streamEventBus$ = new Subject<ParserEvent>();

// 2. Throttled Commit Scheduler (utilizes RxJS auditTime to trigger store commits at 50ms intervals)
const commitTrigger$ = new Subject<void>();
commitTrigger$.pipe(auditTime(50)).subscribe(() => {
  useStreamStore.getState().commitBuffer();
});

function triggerThrottledCommit() {
  commitTrigger$.next();
}

function triggerImmediateCommit() {
  useStreamStore.getState().commitBuffer();
}

// 3. Subscribe to the streaming event bus to feed the write buffers and drive transitions
streamEventBus$.subscribe((event) => {
  const store = useStreamStore.getState();

  switch (event.type) {
    case 'node-added':
      writeBufferNodes.set(event.node.id, { ...event.node });
      // Structural changes trigger immediate commits to keep layout snappy
      triggerImmediateCommit();
      break;

    case 'node-updated': {
      const existing = writeBufferNodes.get(event.node.id);
      if (existing) {
        Object.assign(existing, event.node);
        // Completion/failure changes trigger immediate commit to unlock sequential nodes
        if (event.node.status === 'completed' || event.node.status === 'failed') {
          triggerImmediateCommit();
        } else {
          triggerThrottledCommit();
        }
      }
      break;
    }

    case 'thought-start':
      writeBufferActiveNodeId = event.id;
      triggerImmediateCommit();
      break;

    case 'thought-chunk': {
      const node = writeBufferNodes.get(event.id);
      if (node) {
        node.content += event.chunk;
        triggerThrottledCommit();
      }
      break;
    }

    case 'thought-end':
      writeBufferActiveNodeId = null;
      triggerImmediateCommit();
      break;

    case 'call-start':
      writeBufferActiveNodeId = event.id;
      // Add a helpful debugger execution log automatically
      store.addLog({
        level: 'info',
        message: `Executing tool call: ${event.name}`,
        nodeId: event.id
      });
      triggerImmediateCommit();
      break;

    case 'call-chunk': {
      const node = writeBufferNodes.get(event.id);
      if (node) {
        node.content += event.chunk;
        triggerThrottledCommit();
      }
      break;
    }

    case 'call-end':
      writeBufferActiveNodeId = null;
      store.addLog({
        level: 'trace',
        message: `Tool call ${writeBufferNodes.get(event.id)?.name} finished successfully.`,
        nodeId: event.id
      });
      triggerImmediateCommit();
      break;

    case 'response-start':
      writeBufferActiveNodeId = event.id;
      triggerImmediateCommit();
      break;

    case 'response-chunk': {
      const node = writeBufferNodes.get(event.id);
      if (node) {
        node.content += event.chunk;
        triggerThrottledCommit();
      }
      break;
    }

    case 'response-end':
      writeBufferActiveNodeId = null;
      triggerImmediateCommit();
      break;

    case 'step-start':
      writeBufferActiveNodeId = event.id;
      store.addLog({
        level: 'info',
        message: `Entering step: ${event.name}`,
        nodeId: event.id
      });
      triggerImmediateCommit();
      break;

    case 'step-chunk': {
      const node = writeBufferNodes.get(event.id);
      if (node) {
        node.content += event.chunk;
        triggerThrottledCommit();
      }
      break;
    }

    case 'step-end':
      writeBufferActiveNodeId = null;
      triggerImmediateCommit();
      break;

    case 'text-chunk':
      // Text outside explicit nodes triggers normal throttled commit
      triggerThrottledCommit();
      break;
  }
});

// Single parser instance wired directly to the streaming event bus
export const parser = new LogosParser((event) => {
  streamEventBus$.next(event);
});
