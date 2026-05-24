import React, { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Node,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStreamStore } from '../lib/streamStore';
import { StreamingNode } from './StreamingNode';
import { RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const nodeTypes = {
  streamingNode: StreamingNode,
};

function FlowCanvasInner() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  
  // Bind directly to Core Logic Agent's production Zustand store
  const nodes = useStreamStore((state) => state.nodes);
  const edges = useStreamStore((state) => state.edges);
  const selectedNodeId = useStreamStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useStreamStore((state) => state.setSelectedNodeId);

  // Auto-fit view when nodes are added or when the hierarchy expands
  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.15, duration: 600 });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, fitView]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  // Sync selected highlight with the current store selection ID
  const nodesWithSelection = nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
  }));

  return (
    <div className="w-full h-full relative" role="application" aria-label="Interactive execution canvas">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        minZoom={0.2}
        maxZoom={1.5}
        defaultEdgeOptions={{
          style: { stroke: 'var(--border)', strokeWidth: 2 },
          animated: false,
        }}
        aria-label="Execution layout graph"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        
        {/* Floating MiniMap for fast navigation */}
        <MiniMap
          style={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
          nodeColor={(node) => {
            const status = node.data?.status || 'idle';
            if (status === 'running') return 'var(--primary)';
            if (status === 'completed') return '#10b981';
            if (status === 'failed') return '#ef4444';
            return 'var(--border)';
          }}
          maskColor="rgba(0, 0, 0, 0.05)"
          className="dark:opacity-85"
        />

        {/* Custom Canvas Tool Belt Panel */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-card border border-border p-1 rounded-lg shadow-md select-none">
          <button
            onClick={() => zoomIn()}
            className="p-1.5 hover:bg-secondary rounded text-foreground transition-colors"
            title="Zoom In"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => zoomOut()}
            className="p-1.5 hover:bg-secondary rounded text-foreground transition-colors"
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => fitView({ padding: 0.15, duration: 400 })}
            className="p-1.5 hover:bg-secondary rounded text-foreground transition-colors"
            title="Fit View"
            aria-label="Fit execution graph to window"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-[1px] text-center p-6 select-none pointer-events-none">
          <div className="w-12 h-12 rounded-full border border-dashed border-border flex items-center justify-center mb-4 text-muted-foreground animate-spin">
            <RefreshCw className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Waiting for active runtime trace streams...</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
            Press the &quot;Play Simulation&quot; action button or connect your Server-Sent Events stream to render execution graphs.
          </p>
        </div>
      )}
    </div>
  );
}

export function TopologicalCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
export default TopologicalCanvas;
