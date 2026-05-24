/**
 * Logos Execution Trace Stream Parser
 * 
 * A high-performance, resilient stream parser that handles streaming thoughts,
 * step transitions, function/tool calls, and response outputs. It processes 
 * stream chunks dynamically, manages a stateful execution tree, and emits 
 * state transition events. It is designed to tolerate incomplete tag boundaries
 * across stream packets.
 */

export interface TraceNode {
  id: string;
  type: 'root' | 'thought' | 'call' | 'response' | 'step' | 'text';
  name?: string; // tool name or step name
  args?: Record<string, any>;
  content: string;
  status: 'running' | 'completed' | 'failed';
  timestamp: number;
  parentId?: string;
  childrenIds: string[];
}

export type ParserEvent =
  | { type: 'thought-start'; id: string; parentId?: string; timestamp: number }
  | { type: 'thought-chunk'; id: string; chunk: string }
  | { type: 'thought-end'; id: string; content: string }
  | { type: 'call-start'; id: string; name: string; args: Record<string, any>; parentId?: string; timestamp: number }
  | { type: 'call-chunk'; id: string; chunk: string }
  | { type: 'call-end'; id: string; output?: string }
  | { type: 'response-start'; id: string; callId?: string; parentId?: string; timestamp: number }
  | { type: 'response-chunk'; id: string; chunk: string }
  | { type: 'response-end'; id: string; content: string }
  | { type: 'step-start'; id: string; name: string; args: Record<string, any>; parentId?: string; timestamp: number }
  | { type: 'step-chunk'; id: string; chunk: string }
  | { type: 'step-end'; id: string; content: string }
  | { type: 'text-chunk'; chunk: string }
  | { type: 'node-added'; node: TraceNode }
  | { type: 'node-updated'; node: Partial<TraceNode> & { id: string } };

export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Handles escaped quotes in attribute values e.g. args="{\"x\": 1}" or args='{"x": 1}'
  const regex = /([a-zA-Z0-9_-]+)=(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let match;
  while ((match = regex.exec(tag)) !== null) {
    const name = match[1];
    const val = match[2] !== undefined ? match[2] : match[3];
    // Unescape escaped quotes
    attrs[name] = val.replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return attrs;
}

/**
 * Resolves a potential tag prefix or full tag match in the buffer
 */
export function parseNextTag(buf: string): { type: string; length: number; data?: any } | { incomplete: true } | null {
  if (!buf.startsWith('<')) return null;

  // 1. Exact matches for complete tags without attributes
  if (buf.startsWith('<thought>')) return { type: 'thoughtStart', length: 9 };
  if (buf.startsWith('</thought>')) return { type: 'thoughtEnd', length: 10 };
  if (buf.startsWith('<response>')) return { type: 'responseStart', length: 10 };
  if (buf.startsWith('</response>')) return { type: 'responseEnd', length: 11 };
  if (buf.startsWith('</call>')) return { type: 'callEnd', length: 7 };
  if (buf.startsWith('</step>')) return { type: 'stepEnd', length: 7 };

  // 2. Call opening with attributes (e.g., <call name="foo" args="...">)
  if (buf.startsWith('<call')) {
    const nextChar = buf[5];
    if (nextChar === undefined) {
      return { incomplete: true };
    }
    if (nextChar === ' ' || nextChar === '>') {
      const closingIdx = buf.indexOf('>');
      if (closingIdx === -1) {
        return { incomplete: true };
      }
      const tagContent = buf.slice(0, closingIdx + 1);
      const data = parseAttributes(tagContent);
      return { type: 'callStart', length: tagContent.length, data };
    }
  }

  // 3. Step opening with attributes (e.g., <step name="foo" args="...">)
  if (buf.startsWith('<step')) {
    const nextChar = buf[5];
    if (nextChar === undefined) {
      return { incomplete: true };
    }
    if (nextChar === ' ' || nextChar === '>') {
      const closingIdx = buf.indexOf('>');
      if (closingIdx === -1) {
        return { incomplete: true };
      }
      const tagContent = buf.slice(0, closingIdx + 1);
      const data = parseAttributes(tagContent);
      return { type: 'stepStart', length: tagContent.length, data };
    }
  }

  // 4. Incomplete tag prefix checks
  const standardTags = ['<thought>', '</thought>', '<response>', '</response>', '</call>', '</step>'];
  for (const tag of standardTags) {
    if (tag.startsWith(buf)) {
      return { incomplete: true };
    }
  }

  if (
    '<call'.startsWith(buf) ||
    '</call>'.startsWith(buf) ||
    '<step'.startsWith(buf) ||
    '</step>'.startsWith(buf)
  ) {
    return { incomplete: true };
  }

  // It's not a tag or prefix, e.g. "x < y"
  return null;
}

export class LogosParser {
  private buffer = '';
  private activeNodes: TraceNode[] = [];
  private allNodes = new Map<string, TraceNode>();
  private onEventCallback?: (event: ParserEvent) => void;

  constructor(onEvent?: (event: ParserEvent) => void) {
    this.onEventCallback = onEvent;
  }

  /**
   * Resets the parser state
   */
  public reset(): void {
    this.buffer = '';
    this.activeNodes = [];
    this.allNodes.clear();
  }

  /**
   * Returns all parsed nodes in the execution tree
   */
  public getNodes(): TraceNode[] {
    return Array.from(this.allNodes.values());
  }

  /**
   * Appends text chunks and parses execution blocks incrementally
   */
  public write(chunk: string): void {
    this.buffer += chunk;
    this.processBuffer();
  }

  /**
   * Feeds a structured log/trace event directly to the parser (bypass streaming text)
   */
  public processTraceEvent(event: {
    type: 'thought' | 'call' | 'response' | 'step';
    name?: string;
    args?: Record<string, any>;
    content: string;
    status?: 'running' | 'completed' | 'failed';
    parentId?: string;
  }): void {
    // Complete any active implicit text nodes
    this.closeImplicitTextNode();

    const id = `${event.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const parentId = event.parentId || this.currentActiveNode?.id;

    const node: TraceNode = {
      id,
      type: event.type,
      name: event.name,
      args: event.args,
      content: event.content,
      status: event.status || 'completed',
      timestamp: Date.now(),
      parentId,
      childrenIds: []
    };

    if (parentId) {
      const parent = this.allNodes.get(parentId);
      if (parent) {
        parent.childrenIds.push(id);
      }
    }

    this.allNodes.set(id, node);
    
    // Emit events
    if (event.type === 'thought') {
      this.emit({ type: 'thought-start', id, parentId, timestamp: node.timestamp });
      if (node.content) this.emit({ type: 'thought-chunk', id, chunk: node.content });
      if (node.status === 'completed') this.emit({ type: 'thought-end', id, content: node.content });
    } else if (event.type === 'call') {
      this.emit({ type: 'call-start', id, name: event.name || 'unknown', args: event.args || {}, parentId, timestamp: node.timestamp });
      if (node.content) this.emit({ type: 'call-chunk', id, chunk: node.content });
      if (node.status === 'completed') this.emit({ type: 'call-end', id, output: node.content });
    } else if (event.type === 'response') {
      this.emit({ type: 'response-start', id, parentId, timestamp: node.timestamp });
      if (node.content) this.emit({ type: 'response-chunk', id, chunk: node.content });
      if (node.status === 'completed') this.emit({ type: 'response-end', id, content: node.content });
    } else if (event.type === 'step') {
      this.emit({ type: 'step-start', id, name: event.name || 'step', args: event.args || {}, parentId, timestamp: node.timestamp });
      if (node.content) this.emit({ type: 'step-chunk', id, chunk: node.content });
      if (node.status === 'completed') this.emit({ type: 'step-end', id, content: node.content });
    }

    this.emit({ type: 'node-added', node });
  }

  private emit(event: ParserEvent): void {
    if (this.onEventCallback) {
      this.onEventCallback(event);
    }
  }

  private get currentActiveNode(): TraceNode | undefined {
    return this.activeNodes[this.activeNodes.length - 1];
  }

  private findLastIndex(predicate: (node: TraceNode) => boolean): number {
    for (let i = this.activeNodes.length - 1; i >= 0; i--) {
      if (predicate(this.activeNodes[i])) {
        return i;
      }
    }
    return -1;
  }

  private processBuffer(): void {
    while (this.buffer.length > 0) {
      const idx = this.buffer.indexOf('<');
      if (idx === -1) {
        // No tag start character found, consume entire buffer as text
        const text = this.buffer;
        this.buffer = '';
        this.handleTextChunk(text);
        break;
      }

      if (idx > 0) {
        // Characters exist before '<', consume as text first
        const text = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx);
        this.handleTextChunk(text);
        continue;
      }

      // Buffer starts with '<'. Parse the next tag.
      const match = parseNextTag(this.buffer);
      if (match) {
        if ('incomplete' in match) {
          // Tag boundary spans across packets, wait for more data
          break;
        }

        // Complete tag match
        const { type, length, data } = match;
        this.buffer = this.buffer.slice(length);
        this.handleTag(type, data);
      } else {
        // Starts with '<' but not a valid tag prefix (e.g. `<` mathematical operator)
        this.buffer = this.buffer.slice(1);
        this.handleTextChunk('<');
      }
    }
  }

  private handleTextChunk(text: string): void {
    let node = this.currentActiveNode;
    
    // Create an implicit text node if there's no active node (i.e. text outside blocks)
    if (!node) {
      const id = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      node = {
        id,
        type: 'text',
        content: '',
        status: 'running',
        timestamp: Date.now(),
        childrenIds: []
      };
      this.activeNodes.push(node);
      this.allNodes.set(id, node);
      this.emit({ type: 'node-added', node });
    }

    node.content += text;

    // Emit the appropriate streaming chunk event
    switch (node.type) {
      case 'thought':
        this.emit({ type: 'thought-chunk', id: node.id, chunk: text });
        break;
      case 'call':
        this.emit({ type: 'call-chunk', id: node.id, chunk: text });
        break;
      case 'response':
        this.emit({ type: 'response-chunk', id: node.id, chunk: text });
        break;
      case 'step':
        this.emit({ type: 'step-chunk', id: node.id, chunk: text });
        break;
      default:
        this.emit({ type: 'text-chunk', chunk: text });
        break;
    }

    this.emit({ type: 'node-updated', node: { id: node.id, content: node.content } });
  }

  private handleTag(type: string, data?: any): void {
    // When a tag is opened, close any open implicit text node
    if (type.endsWith('Start')) {
      this.closeImplicitTextNode();
    }

    const parent = this.currentActiveNode;
    const parentId = parent?.id;

    switch (type) {
      case 'thoughtStart': {
        const id = `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const node: TraceNode = {
          id,
          type: 'thought',
          content: '',
          status: 'running',
          timestamp: Date.now(),
          parentId,
          childrenIds: []
        };
        if (parent) parent.childrenIds.push(id);
        this.activeNodes.push(node);
        this.allNodes.set(id, node);
        this.emit({ type: 'thought-start', id, parentId, timestamp: node.timestamp });
        this.emit({ type: 'node-added', node });
        break;
      }

      case 'thoughtEnd': {
        const idx = this.findLastIndex(n => n.type === 'thought');
        if (idx !== -1) {
          const node = this.activeNodes[idx];
          node.status = 'completed';
          this.emit({ type: 'thought-end', id: node.id, content: node.content });
          this.emit({ type: 'node-updated', node: { id: node.id, status: 'completed' } });
          this.activeNodes.splice(idx);
        }
        break;
      }

      case 'callStart': {
        const id = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const name = data?.name || 'unknown_tool';
        let parsedArgs: Record<string, any> = {};
        if (data?.args) {
          try {
            parsedArgs = JSON.parse(data.args);
          } catch {
            parsedArgs = { raw: data.args };
          }
        }
        const node: TraceNode = {
          id,
          type: 'call',
          name,
          args: parsedArgs,
          content: '',
          status: 'running',
          timestamp: Date.now(),
          parentId,
          childrenIds: []
        };
        if (parent) parent.childrenIds.push(id);
        this.activeNodes.push(node);
        this.allNodes.set(id, node);
        this.emit({ type: 'call-start', id, name, args: parsedArgs, parentId, timestamp: node.timestamp });
        this.emit({ type: 'node-added', node });
        break;
      }

      case 'callEnd': {
        const idx = this.findLastIndex(n => n.type === 'call');
        if (idx !== -1) {
          const node = this.activeNodes[idx];
          node.status = 'completed';
          this.emit({ type: 'call-end', id: node.id, output: node.content });
          this.emit({ type: 'node-updated', node: { id: node.id, status: 'completed' } });
          this.activeNodes.splice(idx);
        }
        break;
      }

      case 'responseStart': {
        const id = `response-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Try to associate with the last call sibling if parent matches
        let callId: string | undefined;
        if (parent) {
          const siblingCalls = parent.childrenIds
            .map(cid => this.allNodes.get(cid))
            .filter(n => n && n.type === 'call');
          if (siblingCalls.length > 0) {
            callId = siblingCalls[siblingCalls.length - 1]?.id;
          }
        }

        const node: TraceNode = {
          id,
          type: 'response',
          content: '',
          status: 'running',
          timestamp: Date.now(),
          parentId,
          childrenIds: []
        };
        if (parent) parent.childrenIds.push(id);
        this.activeNodes.push(node);
        this.allNodes.set(id, node);
        this.emit({ type: 'response-start', id, callId, parentId, timestamp: node.timestamp });
        this.emit({ type: 'node-added', node });
        break;
      }

      case 'responseEnd': {
        const idx = this.findLastIndex(n => n.type === 'response');
        if (idx !== -1) {
          const node = this.activeNodes[idx];
          node.status = 'completed';
          this.emit({ type: 'response-end', id: node.id, content: node.content });
          this.emit({ type: 'node-updated', node: { id: node.id, status: 'completed' } });
          this.activeNodes.splice(idx);
        }
        break;
      }

      case 'stepStart': {
        const id = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const name = data?.name || 'step';
        const node: TraceNode = {
          id,
          type: 'step',
          name,
          args: data || {},
          content: '',
          status: 'running',
          timestamp: Date.now(),
          parentId,
          childrenIds: []
        };
        if (parent) parent.childrenIds.push(id);
        this.activeNodes.push(node);
        this.allNodes.set(id, node);
        this.emit({ type: 'step-start', id, name, args: data || {}, parentId, timestamp: node.timestamp });
        this.emit({ type: 'node-added', node });
        break;
      }

      case 'stepEnd': {
        const idx = this.findLastIndex(n => n.type === 'step');
        if (idx !== -1) {
          const node = this.activeNodes[idx];
          node.status = 'completed';
          this.emit({ type: 'step-end', id: node.id, content: node.content });
          this.emit({ type: 'node-updated', node: { id: node.id, status: 'completed' } });
          this.activeNodes.splice(idx);
        }
        break;
      }
    }
  }

  private closeImplicitTextNode(): void {
    const active = this.currentActiveNode;
    if (active && active.type === 'text') {
      active.status = 'completed';
      this.emit({ type: 'node-updated', node: { id: active.id, status: 'completed' } });
      this.activeNodes.pop();
    }
  }
}
