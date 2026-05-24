import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Brain, Terminal, Variable, ShieldAlert, CheckCircle2, Play, Circle } from 'lucide-react';
import { useStreamStore } from '../lib/streamStore';

// Explicitly type the Node Data structure to match what is parsed into the flow nodes
export type StreamingNodeData = {
  label: string;
  type: 'root' | 'thought' | 'call' | 'response' | 'step' | 'text';
  content: string;
  status: 'running' | 'completed' | 'failed';
  name?: string;
  args?: Record<string, any>;
  timestamp: number;
};

type StreamingNodeProps = NodeProps<Node<StreamingNodeData>>;

export const StreamingNode = memo(({ id, data, selected }: StreamingNodeProps) => {
  const { label, type = 'step', status, content, name, args } = data;

  // Retrieve raw arrays and filter them using React.useMemo to keep references stable and prevent getSnapshot loops
  const logs = useStreamStore((state) => state.logs);
  const variableMutations = useStreamStore((state) => state.variableMutations);

  const nodeLogs = React.useMemo(() => logs.filter((l) => l.nodeId === id), [logs, id]);
  const nodeMutations = React.useMemo(() => variableMutations.filter((m) => m.nodeId === id), [variableMutations, id]);

  // Map production statuses ('running', 'completed', 'failed') to active dashboard theme colors
  const statusStyles = {
    running: {
      border: 'border-indigo-500 dark:border-indigo-400',
      bg: 'bg-card',
      glow: 'animate-pulse-glow',
      badge: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
      indicator: 'text-indigo-500 animate-pulse',
    },
    completed: {
      border: 'border-emerald-500 dark:border-emerald-400',
      bg: 'bg-card',
      glow: 'animate-pulse-success',
      badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
      indicator: 'text-emerald-500',
    },
    failed: {
      border: 'border-rose-500 dark:border-rose-400',
      bg: 'bg-card',
      glow: 'animate-pulse-error',
      badge: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
      indicator: 'text-rose-500 animate-bounce',
    },
  }[status] || {
    border: 'border-border',
    bg: 'bg-card',
    glow: '',
    badge: 'bg-secondary text-secondary-foreground',
    indicator: 'text-slate-300 dark:text-slate-700',
  };

  const renderStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Play className="w-3.5 h-3.5 fill-current" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'failed':
        return <ShieldAlert className="w-3.5 h-3.5" />;
      default:
        return <Circle className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div
      className={`w-72 rounded-xl border-2 shadow-lg transition-all duration-300 ${statusStyles.border} ${statusStyles.bg} ${statusStyles.glow} ${
        selected ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-950' : ''
      }`}
      role="region"
      aria-label={`${label} node, status ${status}`}
    >
      {/* Target and Source connectors */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2"
        aria-label="Input connector"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2"
        aria-label="Output connector"
      />

      {/* Node Title & Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/80 bg-slate-50/50 dark:bg-slate-900/50 rounded-t-xl select-none">
        <div className="flex items-center gap-2">
          <div className={`p-1 rounded ${statusStyles.badge}`}>
            {renderStatusIcon()}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-tight text-foreground truncate max-w-[130px]">
              {name || label}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
              {type}
            </span>
          </div>
        </div>

        {/* Dynamic blink status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full bg-current ${statusStyles.indicator}`} />
          <span className="text-[9px] font-extrabold uppercase text-muted-foreground">
            {status}
          </span>
        </div>
      </div>

      {/* Node Interactive Content Body */}
      <div className="p-3 space-y-2.5">
        
        {/* Render thoughts in amber bubbles */}
        {type === 'thought' && content && (
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-brain text-brain-foreground border border-brain-foreground/10 text-xs">
            <div className="flex items-center gap-1 font-bold select-none">
              <Brain className="w-3.5 h-3.5" />
              <span>Thinking Bubble</span>
            </div>
            <p className="italic leading-relaxed whitespace-pre-wrap">
              {content}
            </p>
          </div>
        )}

        {/* Render calls & responses in monospaced terminals */}
        {type === 'call' && (
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-slate-950 text-slate-200 dark:bg-slate-900/70 border border-slate-800 text-[10px] font-mono">
            <div className="flex items-center gap-1 text-slate-400 font-bold select-none">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tool Call</span>
            </div>
            {args && (
              <div className="text-[9px] text-slate-400 border-b border-slate-800/80 pb-1 mb-1 truncate">
                Args: {JSON.stringify(args)}
              </div>
            )}
            <div className="max-h-[60px] overflow-y-auto whitespace-pre-wrap break-all leading-normal">
              {content || 'Awaiting response...'}
            </div>
          </div>
        )}

        {type === 'response' && content && (
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-indigo-950/20 text-indigo-200 border border-indigo-900/20 text-[10px] font-mono">
            <div className="flex items-center gap-1 text-indigo-400 font-bold select-none">
              <Terminal className="w-3.5 h-3.5" />
              <span>Response Payload</span>
            </div>
            <div className="max-h-[60px] overflow-y-auto whitespace-pre-wrap break-all leading-normal">
              {content}
            </div>
          </div>
        )}

        {/* Standard step content */}
        {type === 'step' && content && (
          <div className="text-xs text-foreground p-2 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-border/60 leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        )}

        {/* Scoped log feed */}
        {nodeLogs.length > 0 && type !== 'call' && (
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-slate-950 text-slate-200 dark:bg-slate-900/70 border border-slate-800 text-[10px] font-mono">
            <div className="flex items-center gap-1 text-slate-400 font-bold select-none">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Console Logs</span>
            </div>
            <div className="truncate text-slate-300">
              {nodeLogs[nodeLogs.length - 1].message}
            </div>
          </div>
        )}

        {/* Dynamic variable state badge */}
        {nodeMutations.length > 0 && (
          <div className="flex flex-col gap-1.5 select-none">
            <div className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
              <Variable className="w-3 h-3 text-emerald-500" />
              <span>Bound State</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {nodeMutations.map((mut) => (
                <span
                  key={mut.id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-secondary text-secondary-foreground border border-border"
                >
                  <span className="text-muted-foreground mr-1">{mut.variableName}:</span>
                  <span className="text-foreground font-semibold truncate max-w-[80px]" title={String(mut.newValue)}>
                    {String(mut.newValue)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

StreamingNode.displayName = 'StreamingNode';
export default StreamingNode;
