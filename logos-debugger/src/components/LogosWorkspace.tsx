import React, { useEffect, useState } from 'react';
import AntigravityChatPanel from '../components/AntigravityChatPanel';
import { useStreamStore } from '../lib/streamStore';
import { useChatStore } from '../lib/chatStore';
import { runTraceSimulation, stopTraceSimulation } from '../lib/simulation';
import { TemporalStream } from './TemporalStream';
import { TopologicalCanvas } from './TopologicalCanvas';
import {
  Play,
  Pause,
  Trash2,
  Cpu,
  Brain,
  Terminal,
  Variable,
  Sun,
  Moon,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FolderTree,
  Settings,
  X,
} from 'lucide-react';
import { WorkspaceTree } from './WorkspaceTree';

export default function LogosWorkspace() {
  // Production stores bindings
  const nodes = useStreamStore((state) => state.nodes);
  const traceNodes = useStreamStore((state) => state.traceNodes);
  const playbackState = useStreamStore((state) => state.playbackState);
  const selectedNodeId = useStreamStore((state) => state.selectedNodeId);
  const logs = useStreamStore((state) => state.logs);
  const variableMutations = useStreamStore((state) => state.variableMutations);

  const awaitingApproval = useStreamStore((state) => state.awaitingApproval);
  const isLiveConnected = useStreamStore((state) => state.isLiveConnected);
  const connectLiveTelemetry = useStreamStore((state) => state.connectLiveTelemetry);
  const connectLiveGemmaDebugger = useStreamStore((state) => state.connectLiveGemmaDebugger);
  const disconnectLiveTelemetry = useStreamStore((state) => state.disconnectLiveTelemetry);
  const setAwaitingApproval = useStreamStore((state) => state.setAwaitingApproval);
  const addLog = useStreamStore((state) => state.addLog);

  const setSelectedNodeId = useStreamStore((state) => state.setSelectedNodeId);
  const setPlaybackState = useStreamStore((state) => state.setPlaybackState);
  const resetStore = useStreamStore((state) => state.resetStore);

  // Chat panel state
  const chatOpen = useChatStore((s) => s.isOpen);
  const setChatOpen = useChatStore((s) => s.setIsOpen);

  // Layout-only state triggers
  const [activeTab, setActiveTab] = useState<'thoughts' | 'logs' | 'variables'>('thoughts');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [steeringNotes, setSteeringNotes] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [showHubSetup, setShowHubSetup] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  const [gemmaApiUrl, setGemmaApiUrl] = useState('http://localhost:1234/api/v1/chat');
  const [gemmaModelName, setGemmaModelName] = useState('google/gemma-4-e2b');

  // Spawning process local states
  const [workspacePath, setWorkspacePath] = useState('/Volumes/Study/git/Gemma4Project');
  const [leftPanelTab, setLeftPanelTab] = useState<'timeline' | 'explorer'>('explorer');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [isPickingWorkspace, setIsPickingWorkspace] = useState(false);

  const handlePickWorkspace = async () => {
    setIsPickingWorkspace(true);
    try {
      const response = await fetch('/api/workspace/pick', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.path) {
          setWorkspacePath(data.path);
          addLog({
            level: 'info',
            message: `Workspace path updated to selected folder: ${data.path}`
          });
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        if (errData.error && errData.error !== 'Selection cancelled') {
          addLog({
            level: 'error',
            message: `Failed to open folder: ${errData.error}`
          });
        }
      }
    } catch (error) {
      console.error('Folder picker error:', error);
      addLog({
        level: 'error',
        message: `Failed to open folder: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setIsPickingWorkspace(false);
    }
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.add('dark');

    if (typeof window !== 'undefined') {
      const savedUrl = localStorage.getItem('gemma_api_url');
      const savedModel = localStorage.getItem('gemma_model_name');
      const savedWorkspace = localStorage.getItem('workspace_path');
      if (savedUrl) setGemmaApiUrl(savedUrl);
      if (savedModel) setGemmaModelName(savedModel);
      if (savedWorkspace) setWorkspacePath(savedWorkspace);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('workspace_path', workspacePath);
    }
  }, [workspacePath]);

  const toggleTheme = () => {
    const root = window.document.documentElement;
    if (root.classList.contains('dark')) {
      root.classList.remove('dark');
      root.classList.add('light');
      setTheme('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      setTheme('dark');
    }
  };

  const toggleLiveTelemetry = () => {
    if (isLiveConnected) {
      disconnectLiveTelemetry();
    } else {
      setShowHubSetup(true);
    }
  };

  const handleEnableTelemetryHub = () => {
    setShowHubSetup(false);
    connectLiveTelemetry();
  };

  const handleApprovalAction = async (action: 'approve' | 'steer') => {
    if (!awaitingApproval) return;
    setIsSubmittingApproval(true);
    
    const payload = {
      sessionId: awaitingApproval.sessionId,
      stepId: awaitingApproval.stepId,
      action,
      notes: steeringNotes
    };

    try {
      addLog({
        level: 'info',
        message: `Sending approval action '${action}' for tool '${awaitingApproval.toolName}'...`
      });

      const response = await fetch('/api/session/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      addLog({
        level: 'info',
        message: `Successfully sent ${action} response for session ${awaitingApproval.sessionId}.`
      });
    } catch (error) {
      console.error('Failed to submit approval:', error);
      addLog({
        level: 'error',
        message: `Failed to submit approval: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setIsSubmittingApproval(false);
      setAwaitingApproval(null);
      setSteeringNotes('');
    }
  };

  const isPlaying = playbackState === 'playing';

  const togglePlayback = () => {
    if (playbackState === 'playing') {
      setPlaybackState('paused');
    } else {
      setPlaybackState('playing');
    }
  };

  const handleClear = () => {
    stopTraceSimulation();
    resetStore();
  };

  // Find active node selection
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Filter logs & mutations dynamically based on active selection
  const selectedLogs = selectedNode ? logs.filter((l) => l.nodeId === selectedNode.id) : [];
  const selectedMutations = selectedNode ? variableMutations.filter((m) => m.nodeId === selectedNode.id) : [];

  // Metrics summary calculated from the production store
  const runningCount = nodes.filter((n) => n.data?.status === 'running').length;
  const completedCount = nodes.filter((n) => n.data?.status === 'completed').length;
  const failedCount = nodes.filter((n) => n.data?.status === 'failed').length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-200">
      
      {/* Control Header Bar */}
      <header className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 border-b border-border/80 bg-card gap-4 select-none shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500 text-white rounded-lg flex items-center justify-center shadow-md animate-pulse">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Logos Debugger</span>
              <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-400 border border-indigo-200/50 uppercase tracking-widest leading-none">
                Interactive Thinking Mode
              </span>
            </h1>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
              High-Performance Reactive Stream Graph Visualizer
            </p>
          </div>
        </div>

        {/* Header Toolbar Actions */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Setup & Connect Telemetry Hub */}
          <button
            onClick={toggleLiveTelemetry}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 border ${
              isLiveConnected
                ? 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-500/50 text-emerald-400 font-semibold'
                : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-700 text-white animate-pulse'
            }`}
            title={isLiveConnected ? "Active Telemetry HUD. Click to disconnect." : "Open Setup instructions for Cline/IDE Integration"}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isLiveConnected ? 'bg-emerald-400 animate-ping' : 'bg-white'}`} />
            <span>{isLiveConnected ? 'HUD Streaming Active' : 'Setup Telemetry Hub'}</span>
          </button>

          <div className="h-6 w-px bg-border" />

          {/* Start Real Agent Button */}
          

          <div className="h-6 w-px bg-border" />

          {/* Play Mock Stream Trace */}
          <button
            onClick={() => runTraceSimulation()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
            title="Start testing the flow using live text streaming simulator"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play Simulation</span>
          </button>

          <div className="h-6 w-px bg-border" />

          {/* Toggle Stream Playback state */}
          <button
            onClick={togglePlayback}
            className={`p-2 rounded-lg border transition-colors ${
              isPlaying
                ? 'bg-secondary border-border text-foreground hover:bg-secondary/80'
                : 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600 animate-pulse'
            }`}
            title={isPlaying ? 'Pause Stream Rendering' : 'Resume Stream Rendering'}
            aria-label={isPlaying ? 'Pause playback' : 'Resume playback'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          {/* Clear Store and Simulation */}
          <button
            onClick={handleClear}
            className="p-2 rounded-lg border border-border bg-secondary text-muted-foreground hover:text-rose-500 hover:bg-secondary/80 transition-colors"
            title="Reset active state traces and canvas"
            aria-label="Reset workspace logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Mode Switcher */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
            title="Toggle theme mode"
            aria-label="Toggle theme mode"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Workspace Sidebar Toggle */}
          <button
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
              leftPanelOpen
                ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                : 'bg-secondary border-border text-foreground hover:bg-secondary/80'
            }`}
            title="Toggle Workspace Sidebar"
            aria-label="Toggle Left Sidebar"
          >
            <FolderTree className="w-4 h-4" />
            <span className="text-xs font-bold leading-none hidden lg:inline">Workspace Explorer</span>
          </button>

          {/* Antigravity Chat Toggle */}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
              chatOpen
                ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                : 'bg-secondary border-border text-foreground hover:bg-secondary/80'
            }`}
            title="Toggle Antigravity AI Chat Panel"
            aria-label="Toggle Antigravity Chat"
          >
            <Brain className="w-4 h-4" />
            <span className="text-xs font-bold leading-none hidden lg:inline">Antigravity Chat</span>
          </button>

          {/* Settings Trigger */}
          <button
            onClick={() => {
              setGemmaApiUrl(localStorage.getItem('gemma_api_url') || 'http://localhost:1234/api/v1/chat');
              setGemmaModelName(localStorage.getItem('gemma_model_name') || 'google/gemma-4-e2b');
              setShowSettingsModal(true);
            }}
            className="p-2 rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
            title="Configure Local Gemma Settings"
            aria-label="Gemma settings"
          >
            <Settings className="w-4 h-4" />
            <span className="text-xs font-bold leading-none hidden lg:inline">Gemma Settings</span>
          </button>
        </div>
      </header>

      {/* Main split work space */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left column: Chronological stream spine list or Workspace explorer */}
        <section 
          className={`h-full flex flex-col z-10 border-r border-border bg-card shrink-0 transition-all duration-300 ease-in-out ${
            leftPanelOpen 
              ? 'w-80 md:w-96 opacity-100' 
              : 'w-0 opacity-0 pointer-events-none border-r-0 overflow-hidden'
          }`}
          aria-label="Sidebar navigation explorer"
        >
          
          {/* Sidebar Header: Workspace selector & status counters */}
          <div className="p-4 border-b border-border bg-slate-50/50 dark:bg-slate-900/10 flex flex-col gap-3 shrink-0">
            {/* Workspace selector */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Workspace Path</span>
                <button
                  onClick={() => setLeftPanelOpen(false)}
                  className="text-muted-foreground hover:text-foreground p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
                  title="Collapse Workspace Explorer"
                  aria-label="Collapse Left Sidebar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  placeholder="e.g. /Volumes/Study/git/Gemma4Project"
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handlePickWorkspace}
                  disabled={isPickingWorkspace}
                  className="px-2.5 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50 shrink-0"
                  title="Pick folder from native OS dialog"
                >
                  {isPickingWorkspace ? (
                    <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>📂 Open</span>
                  )}
                </button>
              </div>
            </div>

            {/* Dynamic Counters Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 bg-slate-100/50 dark:bg-slate-900/50 border border-border/60 rounded-lg">
                <Activity className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-muted-foreground font-semibold leading-none">Running</span>
                  <span className="font-bold text-foreground mt-0.5 leading-none">{runningCount}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-slate-100/50 dark:bg-slate-900/50 border border-border/60 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-muted-foreground font-semibold leading-none">Completed</span>
                  <span className="font-bold text-foreground mt-0.5 leading-none">{completedCount}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-slate-100/50 dark:bg-slate-900/50 border border-border/60 rounded-lg">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-muted-foreground font-semibold leading-none">Failed</span>
                  <span className="font-bold text-foreground mt-0.5 leading-none">{failedCount}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-slate-100/50 dark:bg-slate-900/50 border border-border/60 rounded-lg">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-muted-foreground font-semibold leading-none">Traces</span>
                  <span className="font-bold text-foreground mt-0.5 leading-none">{traceNodes.length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex bg-slate-50/50 dark:bg-slate-900/50 p-1.5 border-b border-border shrink-0 select-none items-center gap-1.5">
            <button
              onClick={() => setLeftPanelTab('explorer')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                leftPanelTab === 'explorer'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Workspace Explorer</span>
            </button>
            <button
              onClick={() => setLeftPanelTab('timeline')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                leftPanelTab === 'timeline'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Temporal Spine</span>
            </button>
          </div>
          
          <div className="flex-1 min-h-0">
            {leftPanelTab === 'explorer' ? (
              <WorkspaceTree workspacePath={workspacePath} />
            ) : (
              <TemporalStream />
            )}
          </div>
        </section>

        {/* Right column: 2D topology canvas and Inspector panels */}
        <main className="flex-1 h-full flex flex-col overflow-hidden relative bg-slate-50/50 dark:bg-slate-950/20" aria-label="Workspace visualization and inspection details">
          
          {/* Top section: React Flow canvas */}
          <div className="flex-1 relative border-b border-border">
            <TopologicalCanvas />
          </div>

          {/* Bottom section: Inspector panel for nodes */}
          <div className="h-64 md:h-72 border-t border-border bg-card shrink-0 flex flex-col z-10 overflow-hidden shadow-inner">
            {selectedNode ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                
                {/* Node descriptor banner */}
                <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/80 bg-slate-50/50 dark:bg-slate-900/50 shrink-0 select-none">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-current ${
                      selectedNode.data?.status === 'running' ? 'text-indigo-500 animate-pulse' :
                      selectedNode.data?.status === 'completed' ? 'text-emerald-500' :
                      selectedNode.data?.status === 'failed' ? 'text-rose-500' : 'text-slate-400'
                    }`} />
                    <span className="text-xs font-bold text-foreground truncate max-w-sm">
                      {selectedNode.data?.name || selectedNode.data?.label || selectedNode.id}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-secondary text-[9px] font-semibold text-muted-foreground uppercase">
                      {selectedNode.data?.type || 'Service'}
                    </span>
                  </div>

                  {/* Panel navigation tabs */}
                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                    <button
                      onClick={() => setActiveTab('thoughts')}
                      className={`flex items-center gap-1 px-3 py-1 rounded-md transition-colors ${
                        activeTab === 'thoughts'
                          ? 'bg-brain text-brain-foreground font-bold'
                          : 'hover:bg-secondary text-muted-foreground'
                      }`}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>Thinking Trace</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('logs')}
                      className={`flex items-center gap-1 px-3 py-1 rounded-md transition-colors ${
                        activeTab === 'logs'
                          ? 'bg-indigo-500 text-white font-bold'
                          : 'hover:bg-secondary text-muted-foreground'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Transaction Logs</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('variables')}
                      className={`flex items-center gap-1 px-3 py-1 rounded-md transition-colors ${
                        activeTab === 'variables'
                          ? 'bg-emerald-500 text-white font-bold'
                          : 'hover:bg-secondary text-muted-foreground'
                      }`}
                    >
                      <Variable className="w-3.5 h-3.5" />
                      <span>Variables</span>
                    </button>
                    <button
                      onClick={() => setSelectedNodeId(null)}
                      className="px-2 py-1 hover:bg-secondary rounded text-muted-foreground text-xs ml-2 font-normal"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Selected tab output content */}
                <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-slate-50/20 dark:bg-slate-900/10">
                  
                  {/* Streaming thoughts pane */}
                  {activeTab === 'thoughts' && (
                    <div className="h-full flex flex-col">
                      {selectedNode.data?.type === 'thought' || selectedNode.data?.content ? (
                        <div className="flex flex-col gap-2 p-3 bg-brain text-brain-foreground border border-brain-foreground/15 rounded-xl text-xs leading-relaxed italic whitespace-pre-wrap font-medium shadow-sm">
                          <p>{selectedNode.data.content || 'Streaming thinking tracks...'}</p>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground select-none py-10">
                          <Brain className="w-7 h-7 stroke-[1.5] mb-1.5 opacity-40 text-amber-500" />
                          <p className="text-xs font-bold text-foreground">No active thoughts recorded</p>
                          <p className="text-[10px] mt-0.5 max-w-xs">This node represents a direct service invocation without custom thought processes.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scoped logs console pane */}
                  {activeTab === 'logs' && (
                    <div className="h-full font-mono text-[11.5px] leading-relaxed text-slate-200 bg-slate-950 dark:bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-1.5 select-text overflow-y-auto">
                      {selectedLogs.length > 0 ? (
                        selectedLogs.map((log, idx) => (
                          <div key={log.id} className="flex gap-2 items-start">
                            <span className="text-indigo-400 select-none shrink-0 font-semibold">[{idx + 1}]</span>
                            <span className="whitespace-pre-wrap">{log.message}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 select-none py-10">
                          <Terminal className="w-7 h-7 stroke-[1.5] mb-1.5 opacity-40 text-indigo-400" />
                          <p className="text-xs font-bold">Terminal logs are clear</p>
                          <p className="text-[10px] mt-0.5">No logged stdout events recorded for this connection node step.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scoped state variables table pane */}
                  {activeTab === 'variables' && (
                    <div className="h-full">
                      {selectedMutations.length > 0 ? (
                        <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-border text-[9px] uppercase font-bold tracking-wider text-muted-foreground select-none">
                                <th className="px-4 py-2">Variable State Key</th>
                                <th className="px-4 py-2">Value Transition</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border font-mono text-xs text-foreground">
                              {selectedMutations.map((mut) => (
                                <tr key={mut.id} className="hover:bg-secondary/40">
                                  <td className="px-4 py-2 text-indigo-500 dark:text-indigo-400 font-semibold">{mut.variableName}</td>
                                  <td className="px-4 py-2 text-foreground truncate max-w-lg">
                                    <span className="text-muted-foreground mr-1.5 font-normal">{String(mut.oldValue)}</span>
                                    <span className="text-indigo-500 mr-1.5 font-bold">➔</span>
                                    <span className="font-semibold">{String(mut.newValue)}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground select-none py-10">
                          <Variable className="w-7 h-7 stroke-[1.5] mb-1.5 opacity-40 text-emerald-500" />
                          <p className="text-xs font-bold text-foreground">Zero state variables bound</p>
                          <p className="text-[10px] mt-0.5">No variable mutations occurred during this step of the execution lifecycle.</p>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-center text-muted-foreground select-none p-6 pointer-events-none">
                <HelpCircle className="w-8 h-8 stroke-[1.5] mb-2 opacity-30 text-indigo-500" />
                <h3 className="text-xs font-bold text-foreground">Memory & State Inspector</h3>
                <p className="text-[10px] mt-1 max-w-sm leading-normal">
                  Select any service node on the topological 2D canvas to audit its active state variables, complete transaction logs, and real-time reasoning thoughts.
                </p>
              </div>
            )}
          </div>

        </main>
        <AntigravityChatPanel workspacePath={workspacePath} />
      </div>

      {showHubSetup && !isLiveConnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300">
          <div className="w-[560px] max-w-[90vw] bg-slate-900 border-2 border-indigo-500/70 shadow-[0_0_60px_rgba(99,102,241,0.25)] rounded-2xl overflow-hidden flex flex-col transform transition-all duration-300 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-indigo-950/90 px-6 py-4 border-b border-indigo-500/40 flex items-center gap-3">
              <div className="p-1.5 bg-indigo-600 rounded-lg shadow-md animate-pulse">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-white tracking-wide uppercase">Logos Telemetry Hub Setup</h3>
                <p className="text-[10px] text-indigo-300 mt-0.5">Configure your IDE to stream Gemma 4's thoughts live to this UI</p>
              </div>
            </div>
            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
              {/* Endpoint Config Info */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex flex-col gap-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Telemetry Proxy Status
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Proxy Host Address:</span>
                  <code className="text-indigo-400 font-mono font-bold bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-500/20">http://localhost:3000/api/v1</code>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Target Gemma Provider:</span>
                  <code className="text-emerald-400 font-mono bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-500/10" title="LM Studio Default Completion Endpoint">http://localhost:1234 (LM Studio)</code>
                </div>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  IDE Connection Guide (For Cline Extension)
                </span>
                
                <div className="flex flex-col gap-4 text-xs">
                  {/* Step 1 */}
                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/50 text-indigo-400 flex items-center justify-center font-extrabold text-[10px] shrink-0 mt-0.5 shadow-sm">1</div>
                    <div>
                      <span className="font-bold text-white block">Open Cline Settings</span>
                      <span className="text-slate-400 text-[11px] mt-0.5 block leading-normal">
                        Open the **Cline** panel inside VS Code, and click the gear/settings icon in the top right.
                      </span>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/50 text-indigo-400 flex items-center justify-center font-extrabold text-[10px] shrink-0 mt-0.5 shadow-sm">2</div>
                    <div className="flex-1">
                      <span className="font-bold text-white block">Set API Provider Config</span>
                      <span className="text-slate-400 text-[11px] mt-0.5 block leading-normal">
                        Select **OpenAI Compatible** (or Custom) and enter the details:
                      </span>
                      <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[10.5px] bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-slate-500 block text-[9px] font-semibold font-sans uppercase">Base URL</span>
                          <span className="text-slate-300 font-bold block truncate" title="http://localhost:3000/api/v1">http://localhost:3000/api/v1</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-semibold font-sans uppercase">Model ID</span>
                          <span className="text-slate-300 font-bold block truncate" title="google/gemma-4-e2b">google/gemma-4-e2b</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/50 text-indigo-400 flex items-center justify-center font-extrabold text-[10px] shrink-0 mt-0.5 shadow-sm">3</div>
                    <div>
                      <span className="font-bold text-white block">Prompt & Stream Live HUD</span>
                      <span className="text-slate-400 text-[11px] mt-0.5 block leading-normal">
                        Enable the Live HUD using the button below. Then, type your prompt in Cline. Gemma's raw thought blocks will automatically render live in this browser dashboard!
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center gap-3">
              <button
                onClick={() => setShowHubSetup(false)}
                className="px-4 py-2 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-colors hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleEnableTelemetryHub}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 active:scale-95 flex items-center gap-2"
              >
                <Zap className="w-3.5 h-3.5 animate-bounce" />
                <span>Enable Live Telemetry HUD</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {awaitingApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md transition-all duration-300">
          <div className="w-[500px] max-w-[90vw] bg-white/10 dark:bg-slate-900/40 border border-white/20 dark:border-indigo-500/30 shadow-[0_8px_32px_0_rgba(99,102,241,0.3)] backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col transform transition-transform animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-indigo-950/40 backdrop-blur-md px-6 py-4 border-b border-indigo-500/20 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-white tracking-wide uppercase">
                  Awaiting Developer Consent
                </h3>
                <p className="text-[10px] text-indigo-300 mt-0.5">
                  Agent execution paused. Input required to continue safely.
                </p>
              </div>
            </div>
            {/* Modal Content */}
            <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
              {/* Session and Step ID */}
              <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-400">
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="font-semibold block text-slate-500">Session ID</span>
                  <span className="font-mono text-white truncate block mt-0.5" title={awaitingApproval.sessionId}>
                    {awaitingApproval.sessionId}
                  </span>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="font-semibold block text-slate-500">Step ID</span>
                  <span className="font-mono text-white truncate block mt-0.5" title={awaitingApproval.stepId}>
                    {awaitingApproval.stepId}
                  </span>
                </div>
              </div>

              {/* Tool Information */}
              <div className="bg-indigo-950/30 p-4 rounded-xl border border-indigo-500/20">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Target Tool: {awaitingApproval.toolName}</span>
                </div>
                <div className="mt-2.5">
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">Arguments</span>
                  <pre className="text-[10.5px] font-mono text-indigo-200 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 overflow-x-auto whitespace-pre-wrap max-h-36">
                    {JSON.stringify(awaitingApproval.args, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Steering Overrides Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex justify-between">
                  <span>Steering & Feedback Notes</span>
                  <span className="text-slate-500 font-normal">Optional for approval, required for overrides</span>
                </label>
                <textarea
                  value={steeringNotes}
                  onChange={(e) => setSteeringNotes(e.target.value)}
                  placeholder="Inject steering feedback, schema overrides, or constraints here..."
                  className="w-full min-h-[90px] text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 transition-colors resize-y font-sans"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center gap-3">
              <button
                onClick={() => setAwaitingApproval(null)}
                className="px-4 py-2 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-colors hover:bg-slate-900"
              >
                Dismiss View
              </button>
              
              <div className="flex gap-2">
                <button
                  disabled={isSubmittingApproval}
                  onClick={() => handleApprovalAction('steer')}
                  className="px-4 py-2 border border-amber-500/50 text-amber-400 hover:bg-amber-950/30 text-xs font-bold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-95"
                >
                  Inject Steering Override
                </button>
                <button
                  disabled={isSubmittingApproval}
                  onClick={() => handleApprovalAction('approve')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 disabled:opacity-50 disabled:pointer-events-none active:scale-95"
                >
                  Approve Execution
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300">
          <div className="w-[500px] max-w-[90vw] bg-slate-900 border-2 border-indigo-500/70 shadow-[0_0_60px_rgba(99,102,241,0.25)] rounded-2xl overflow-hidden flex flex-col transform transition-all duration-300 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-indigo-950/90 px-6 py-4 border-b border-indigo-500/40 flex items-center gap-3">
              <div className="p-1.5 bg-indigo-600 rounded-lg shadow-md animate-pulse">
                <Settings className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-white tracking-wide uppercase">Local Gemma Agent Settings</h3>
                <p className="text-[10px] text-indigo-300 mt-0.5">Configure your local Gemma LLM endpoint URL and model identifier</p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4">
              {/* Endpoint Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Quick Presets</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGemmaApiUrl('http://localhost:1234/api/v1/chat');
                      setGemmaModelName('google/gemma-4-e2b');
                    }}
                    className="flex-1 px-3 py-2 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl text-left transition-all active:scale-[0.98]"
                  >
                    <span className="text-xs font-bold text-white block">💻 LM Studio Preset</span>
                    <span className="text-[9.5px] text-slate-400 block mt-0.5">Port 1234 · Custom prompt format</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGemmaApiUrl('http://localhost:11434/v1/chat/completions');
                      setGemmaModelName('gemma2');
                    }}
                    className="flex-1 px-3 py-2 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl text-left transition-all active:scale-[0.98]"
                  >
                    <span className="text-xs font-bold text-white block">🦙 Ollama Preset</span>
                    <span className="text-[9.5px] text-slate-400 block mt-0.5">Port 11434 · OpenAI API compatible</span>
                  </button>
                </div>
              </div>

              {/* Endpoint URL Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Gemma Server API URL
                </label>
                <input
                  type="text"
                  value={gemmaApiUrl}
                  onChange={(e) => setGemmaApiUrl(e.target.value)}
                  placeholder="e.g. http://localhost:1234/api/v1/chat"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-700"
                />
              </div>

              {/* Model Identifier Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Model Name / Identifier
                </label>
                <input
                  type="text"
                  value={gemmaModelName}
                  onChange={(e) => setGemmaModelName(e.target.value)}
                  placeholder="e.g. google/gemma-4-e2b"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-700 font-mono"
                />
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">How to load Gemma</span>
                <p className="text-[10.5px] leading-relaxed text-slate-400">
                  Ensure you have downloaded and run either <strong>LM Studio</strong> or <strong>Ollama</strong> locally. Load a Gemma 2/4 model inside the daemon and keep the chat server running.
                </p>
                <p className="text-[10.5px] leading-relaxed text-slate-400 mt-1">
                  💡 **Pro Tip**: If using standard OpenAI completions endpoints like Ollama's, the server automatically maps conversational turns cleanly.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center gap-3">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-colors hover:bg-slate-900"
              >
                Close
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('gemma_api_url', gemmaApiUrl.trim());
                  localStorage.setItem('gemma_model_name', gemmaModelName.trim());
                  setShowSettingsModal(false);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
              >
                Save Gemma Settings
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
