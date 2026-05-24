import React, { useEffect, useState } from 'react';
import { useStreamStore } from '../lib/streamStore';
import { useChatStore } from '../lib/chatStore';
import { Folder, FolderOpen, File, ChevronDown, ChevronRight, RefreshCw, FolderTree } from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  relPath: string;
  isDir: boolean;
  children?: FileNode[];
}

interface TreeNodeProps {
  node: FileNode;
  accessedFiles: Record<string, 'read' | 'write'>;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, accessedFiles }) => {
  const [isOpen, setIsOpen] = useState(true);

  const getFileDot = (relPath: string) => {
    if (accessedFiles[relPath]) return accessedFiles[relPath];
    for (const [key, op] of Object.entries(accessedFiles)) {
      if (key === relPath || key.endsWith('/' + relPath) || key.endsWith('\\' + relPath)) {
        return op;
      }
    }
    return null;
  };

  const status = !node.isDir ? getFileDot(node.relPath) : null;

  if (node.isDir) {
    return (
      <div className="pl-3 select-none">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 py-1 px-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 rounded cursor-pointer text-xs font-medium text-foreground/80 transition-colors"
        >
          <span className="text-muted-foreground shrink-0">
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
          <span className="text-indigo-400 shrink-0">
            {isOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
          </span>
          <span className="truncate">{node.name}</span>
        </div>
        
        {isOpen && node.children && node.children.length > 0 && (
          <div className="border-l border-border/60 ml-3 pl-1 mt-0.5 space-y-0.5">
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} accessedFiles={accessedFiles} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const handleFileClick = () => {
    const chatStore = useChatStore.getState();
    chatStore.setIsOpen(true);
    const currentInput = chatStore.input;
    const refString = `/ref ${node.path}`;
    if (!currentInput.includes(refString)) {
      chatStore.setInput(currentInput ? `${currentInput} ${refString}` : `${refString} `);
    }
  };

  return (
    <div className="pl-7 select-none">
      <div 
        onClick={handleFileClick}
        className="flex items-center justify-between py-1 px-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 rounded text-xs font-normal text-foreground/70 hover:text-indigo-400 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-1.5 truncate">
          <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{node.name}</span>
        </div>
        
        {status === 'read' && (
          <span
            className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_10px_#f97316] shrink-0 mr-1.5 animate-pulse"
            title="File read by agent"
          />
        )}
        {status === 'write' && (
          <span
            className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_10px_#2dd4bf] shrink-0 mr-1.5 animate-pulse"
            title="File modified by agent"
          />
        )}
      </div>
    </div>
  );
};

interface WorkspaceTreeProps {
  workspacePath: string;
}

export function WorkspaceTree({ workspacePath }: WorkspaceTreeProps) {
  const accessedFiles = useStreamStore((state) => state.accessedFiles);
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = async () => {
    if (!workspacePath) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspace/tree?path=${encodeURIComponent(workspacePath)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `HTTP error ${res.status}`);
      }
      const data = await res.json();
      setTreeData(data.tree || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace files');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, [workspacePath]);

  return (
    <div className="flex flex-col h-full bg-card border-r border-border relative">
      {/* Tree Explorer Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-slate-50/50 dark:bg-slate-900/50 select-none shrink-0">
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-indigo-500" />
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">Workspace Files</h2>
        </div>
        <button
          onClick={fetchTree}
          disabled={isLoading}
          className="p-1 hover:bg-secondary rounded text-muted-foreground transition-colors disabled:opacity-50"
          title="Refresh Workspace Tree"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tree Data Container */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {isLoading && treeData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground select-none">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-500 mb-2" />
            <span className="text-[10px]">Scanning workspace tree...</span>
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-rose-500 bg-rose-950/20 rounded-xl border border-rose-500/20 select-text">
            <span className="font-bold block">Error scanning workspace:</span>
            <p className="mt-1 leading-normal break-all text-[11px]">{error}</p>
            <button
              onClick={fetchTree}
              className="mt-3 px-3 py-1 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-750 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : treeData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center select-none p-4">
            <FolderTree className="w-6 h-6 stroke-[1.5] mb-2 opacity-50 text-indigo-500" />
            <h3 className="text-xs font-bold text-foreground">Workspace Empty</h3>
            <p className="text-[10px] mt-1 leading-normal">
              No directories or files found under the specified path.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {treeData.map((node) => (
              <TreeNode key={node.path} node={node} accessedFiles={accessedFiles} />
            ))}
          </div>
        )}
      </div>

      {/* Legend footer */}
      <div className="p-2 border-t border-border bg-slate-50/50 dark:bg-slate-900/50 flex gap-4 text-[9px] font-bold text-muted-foreground select-none shrink-0 justify-center">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_#f97316]" />
          <span>Orange (Read)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_6px_#2dd4bf]" />
          <span>Teal (Modified)</span>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceTree;
