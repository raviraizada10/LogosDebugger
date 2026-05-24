import React, { useEffect, useRef, useState } from 'react';
import { useStreamStore } from '../lib/streamStore';
import { TraceNode } from '../lib/logosParser';
import {
  Brain,
  Terminal,
  PhoneCall,
  Activity,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowDown,
  Clock,
  ExternalLink,
} from 'lucide-react';

export function TemporalStream() {
  // Bind directly to Core Logic Agent's production state
  const traceNodes = useStreamStore((state) => state.traceNodes);
  const selectedNodeId = useStreamStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useStreamStore((state) => state.setSelectedNodeId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto scroll to bottom as traces append in real time
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [traceNodes.length, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const handleEventClick = (node: TraceNode) => {
    setSelectedNodeId(node.id);
  };

  // Return icons and metadata scoped to production tag types
  const getEventMeta = (node: TraceNode) => {
    switch (node.type) {
      case 'thought':
        return {
          icon: <Brain className="w-4 h-4 text-amber-500" />,
          bgColor: 'bg-amber-100 dark:bg-amber-950/40',
          borderColor: 'border-amber-400 dark:border-amber-600',
          title: 'Thinking Process',
        };
      case 'call':
        return {
          icon: <PhoneCall className="w-4 h-4 text-indigo-500" />,
          bgColor: 'bg-indigo-100 dark:bg-indigo-950/40',
          borderColor: 'border-indigo-400 dark:border-indigo-600',
          title: `Call: ${node.name || 'tool'}`,
        };
      case 'response':
        return {
          icon: <Terminal className="w-4 h-4 text-emerald-500" />,
          bgColor: 'bg-emerald-100 dark:bg-emerald-950/40',
          borderColor: 'border-emerald-400 dark:border-emerald-600',
          title: 'Response Payload',
        };
      case 'step':
        if (node.status === 'running') {
          return {
            icon: <Play className="w-4 h-4 text-indigo-500 animate-pulse" />,
            bgColor: 'bg-indigo-50 dark:bg-indigo-950/30',
            borderColor: 'border-indigo-500',
            title: `Step: ${node.name || 'step'}`,
          };
        }
        if (node.status === 'completed') {
          return {
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
            bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
            borderColor: 'border-emerald-500',
            title: `Step: ${node.name || 'step'}`,
          };
        }
        if (node.status === 'failed') {
          return {
            icon: <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce" />,
            bgColor: 'bg-rose-50 dark:bg-rose-950/30',
            borderColor: 'border-rose-500',
            title: `Step: ${node.name || 'step'}`,
          };
        }
        return {
          icon: <Activity className="w-4 h-4 text-slate-500" />,
          bgColor: 'bg-secondary',
          borderColor: 'border-border',
          title: `Step: ${node.name || 'step'}`,
        };
      default:
        return {
          icon: <Terminal className="w-4 h-4 text-slate-500" />,
          bgColor: 'bg-secondary',
          borderColor: 'border-border',
          title: 'Standard Log',
        };
    }
  };

  const formatTime = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border relative">
      
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-slate-50/50 dark:bg-slate-900/50 select-none shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">Temporal Spine</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary text-secondary-foreground border border-border">
            {traceNodes.length} Elements
          </span>
          {!autoScroll && (
            <button
              onClick={() => setAutoScroll(true)}
              className="flex items-center gap-1 text-[9px] px-2 py-0.5 bg-indigo-500 text-white rounded hover:bg-indigo-600 font-bold transition-colors shadow"
              title="Snap timeline to latest updates"
            >
              <ArrowDown className="w-2.5 h-2.5" />
              <span>Live</span>
            </button>
          )}
        </div>
      </div>

      {/* Spinal chronologue scroll content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 relative"
        role="log"
        aria-label="Chronological execution trace list"
      >
        {/* Spinal Connector Line */}
        {traceNodes.length > 0 && (
          <div
            className="absolute left-[33px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-slate-200 via-indigo-200/80 to-slate-200 dark:from-slate-800 dark:via-indigo-950/80 dark:to-slate-800"
            aria-hidden="true"
          />
        )}

        <div className="space-y-6">
          {traceNodes.map((node) => {
            const meta = getEventMeta(node);
            const isSelected = node.id === selectedNodeId;

            return (
              <div
                key={node.id}
                onClick={() => handleEventClick(node)}
                className={`group flex items-start gap-4 cursor-pointer outline-none relative transition-all duration-200 ${
                  isSelected ? 'scale-[1.01]' : 'hover:translate-x-0.5'
                }`}
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleEventClick(node);
                  }
                }}
              >
                {/* Timestamp counter */}
                <span className="text-[9px] font-semibold text-muted-foreground w-11 text-right mt-1.5 select-none shrink-0 font-mono">
                  {formatTime(node.timestamp)}
                </span>

                {/* Timeline status badge */}
                <div
                  className={`z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition-transform duration-200 ${
                    meta.bgColor
                  } ${meta.borderColor} ${isSelected ? 'scale-110 shadow-md ring-2 ring-indigo-500/30' : ''}`}
                >
                  {meta.icon}
                </div>

                {/* Event Bubble Content Block */}
                <div
                  className={`flex-1 p-3 rounded-xl border transition-all duration-200 ${
                    isSelected
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/15 border-indigo-500 shadow-sm'
                      : 'bg-card border-border/80 group-hover:border-slate-400 dark:group-hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground tracking-tight">
                      {meta.title}
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-500 hover:underline">
                      <span>@{node.id.split('-')[0]}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>

                  {/* Render streaming content */}
                  {node.content && (
                    <div className={`mt-1.5 text-xs text-foreground leading-relaxed whitespace-pre-wrap ${
                      node.type === 'thought'
                        ? 'p-2 rounded-lg bg-brain text-brain-foreground border border-brain-foreground/10 italic'
                        : node.type === 'call' || node.type === 'response'
                        ? 'p-2 rounded-lg bg-slate-950 text-slate-200 dark:bg-slate-900/60 border border-slate-800 text-[10px] font-mono'
                        : ''
                    }`}>
                      {node.content}
                    </div>
                  )}

                  {/* Render argument parameters */}
                  {node.args && Object.keys(node.args).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(node.args).map(([key, val]) => (
                        <span
                          key={key}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-secondary text-secondary-foreground border border-border"
                        >
                          <span className="text-muted-foreground mr-1">{key}:</span>
                          <span className="text-foreground font-semibold">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {traceNodes.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-20 text-muted-foreground select-none">
              <Clock className="w-8 h-8 stroke-[1.5] mb-2 opacity-50 text-indigo-500" />
              <h3 className="text-xs font-bold text-foreground">Timeline Empty</h3>
              <p className="text-[10px] mt-1 max-w-[160px] leading-normal">
                No events received. Trigger the simulation trace or stream SSE logs to render.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default TemporalStream;
