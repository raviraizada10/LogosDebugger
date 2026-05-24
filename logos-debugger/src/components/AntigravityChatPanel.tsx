// src/components/AntigravityChatPanel.tsx
import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../lib/chatStore';
import { useStreamStore } from '../lib/streamStore';
import { Brain, Send, X, Trash2, Columns2, Split, Maximize2 } from 'lucide-react';
import ChatMessage from './ChatMessage';

interface AntigravityChatPanelProps {
  workspacePath?: string;
}

interface WorkspaceFile {
  name: string;
  path: string;
  relPath: string;
}

const flattenTree = (nodes: any[]): WorkspaceFile[] => {
  const files: WorkspaceFile[] = [];
  const traverse = (list: any[]) => {
    for (const node of list) {
      if (node.isDir) {
        if (node.children) traverse(node.children);
      } else {
        files.push({
          name: node.name,
          path: node.path,
          relPath: node.relPath,
        });
      }
    }
  };
  traverse(nodes);
  return files;
};

export default function AntigravityChatPanel({ workspacePath = '/Volumes/Study/git/Gemma4Project' }: AntigravityChatPanelProps) {
  const { messages: storeMessages, input, setInput, sendPrompt, loading, isOpen, setIsOpen, layoutMode, setLayoutMode } = useChatStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autocomplete Suggestions State
  const [flatFiles, setFlatFiles] = React.useState<WorkspaceFile[]>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<WorkspaceFile[]>([]);
  const [queryStartIdx, setQueryStartIdx] = React.useState(-1);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = React.useState(0);

  // Hydration safety check to guarantee persistent chat logs are safely rendered on client mount
  const [isHydrated, setIsHydrated] = React.useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const messages = isHydrated ? storeMessages : [];

  // Fetch and flatten workspace tree when workspacePath changes
  useEffect(() => {
    if (!workspacePath) return;
    const fetchAndFlattenFiles = async () => {
      try {
        const res = await fetch(`/api/workspace/tree?path=${encodeURIComponent(workspacePath)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.tree) {
            setFlatFiles(flattenTree(data.tree));
          }
        }
      } catch (err) {
        console.error('Error fetching files for autocomplete:', err);
      }
    };
    fetchAndFlattenFiles();
  }, [workspacePath]);

  // Auto‑scroll to newest message
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    await sendPrompt(workspacePath);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    const selectionEnd = e.target.selectionEnd;
    const textBeforeCursor = val.slice(0, selectionEnd);
    
    // Find the last "@" character before the cursor
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIdx !== -1) {
      // Check if there is whitespace before the "@" or if it is at the start
      const charBeforeAt = lastAtIdx > 0 ? textBeforeCursor[lastAtIdx - 1] : ' ';
      const isWordStart = /\s/.test(charBeforeAt);
      
      if (isWordStart) {
        const query = textBeforeCursor.slice(lastAtIdx + 1);
        // Only show if there's no whitespace inside the query
        if (!/\s/.test(query)) {
          setQueryStartIdx(lastAtIdx);
          
          // Filter files based on query
          const filtered = flatFiles.filter(f => 
            f.name.toLowerCase().includes(query.toLowerCase()) ||
            f.relPath.toLowerCase().includes(query.toLowerCase())
          ).slice(0, 8); // premium cap: 8 entries
          
          setSuggestions(filtered);
          setShowSuggestions(filtered.length > 0);
          setActiveSuggestionIdx(0);
          return;
        }
      }
    }
    
    setShowSuggestions(false);
  };

  const selectSuggestion = (file: WorkspaceFile) => {
    if (queryStartIdx === -1) return;
    const text = input;
    
    const before = text.slice(0, queryStartIdx);
    const cursor = textareaRef.current;
    const after = cursor ? text.slice(cursor.selectionEnd) : '';
    
    const mentionStr = `@${file.relPath}`;
    const refString = `/ref ${file.path}`;
    
    let newInput = `${before}${mentionStr} ${after}`;
    if (!newInput.includes(refString)) {
      newInput = `${newInput.trim()} ${refString} `;
    }
    
    setInput(newInput);
    setShowSuggestions(false);
    
    // Restore focus and update selection cursor
    if (textareaRef.current) {
      textareaRef.current.focus();
      const newCursorPos = before.length + mentionStr.length + 1;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIdx((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  };

  let widthClass = 'w-80 md:w-96';
  if (layoutMode === 'half') {
    widthClass = 'w-[50vw]';
  } else if (layoutMode === 'maximized') {
    widthClass = 'w-[80vw] md:w-[85vw]';
  }

  return (
    <section 
      className={`h-full bg-slate-950 border-border/60 flex flex-col shadow-2xl shrink-0 transition-all duration-300 ease-in-out ${
        isOpen 
          ? `${widthClass} border-l opacity-100` 
          : 'w-0 opacity-0 pointer-events-none border-l-0 overflow-hidden'
      }`}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border-b border-border/60">
        <div className="flex items-center gap-2 text-white">
          <Brain className="w-4 h-4 text-indigo-400 animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Antigravity Chat</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Segmented layout switcher */}
          <div className="flex items-center bg-slate-900 border border-border/40 rounded-lg p-0.5 mr-2">
            <button
              onClick={() => setLayoutMode('standard')}
              className={`p-1 rounded transition-all ${
                layoutMode === 'standard'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-muted-foreground hover:text-white hover:bg-slate-800'
              }`}
              title="Standard Chat Panel"
              aria-label="Standard Chat Panel Layout"
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setLayoutMode('half')}
              className={`p-1 rounded transition-all ${
                layoutMode === 'half'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-muted-foreground hover:text-white hover:bg-slate-800'
              }`}
              title="Split 50/50 View"
              aria-label="Split 50/50 Layout View"
            >
              <Split className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setLayoutMode('maximized')}
              className={`p-1 rounded transition-all ${
                layoutMode === 'maximized'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-muted-foreground hover:text-white hover:bg-slate-800'
              }`}
              title="Maximize Chat View"
              aria-label="Maximize Chat Layout View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => useChatStore.getState().clear()}
            className="text-muted-foreground hover:text-rose-400 p-1 hover:bg-slate-800 rounded transition-colors"
            title="Clear Chat History"
            aria-label="Clear Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-muted-foreground hover:text-white p-1 hover:bg-slate-800 rounded transition-colors"
            aria-label="Close Chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
            <Brain className="w-10 h-10 text-indigo-500/40 mb-3" />
            <h3 className="text-xs font-bold text-foreground">Antigravity AI Agent</h3>
            <p className="text-[10px] mt-1 leading-normal max-w-[200px]">
              Ask me to inspect files, explain concepts, or orchestrate execution plans directly from your workspace. Type <code className="text-indigo-400 bg-indigo-950/45 px-1 py-0.5 rounded border border-indigo-500/20 font-bold">@</code> to mention files.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <ChatMessage key={idx} message={msg} />
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <footer className="p-4 border-t border-border/60 bg-slate-900/40 relative">
        {/* Autocomplete suggestions panel */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-slate-900 border border-indigo-500/45 rounded-xl shadow-2xl overflow-hidden z-30 max-h-48 overflow-y-auto backdrop-blur-md">
            <div className="bg-slate-950 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-indigo-400 uppercase tracking-wider select-none">
              Mentions (Workspace Files)
            </div>
            <ul className="divide-y divide-border/30">
              {suggestions.map((file, idx) => (
                <li
                  key={file.path}
                  onClick={() => selectSuggestion(file)}
                  className={`px-3 py-2 text-xs cursor-pointer flex flex-col transition-colors ${
                    idx === activeSuggestionIdx
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'hover:bg-slate-800 text-foreground hover:text-foreground'
                  }`}
                >
                  <span className="truncate">{file.name}</span>
                  <span className={`text-[10px] truncate ${
                    idx === activeSuggestionIdx ? 'text-indigo-200' : 'text-muted-foreground'
                  }`}>
                    {file.relPath}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={2}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a prompt (e.g. explain @file) or press Enter..."
          className="w-full resize-none rounded-xl bg-slate-900 text-white placeholder-gray-500 p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 border border-border/60 disabled:opacity-50"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2 text-xs font-semibold shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{loading ? 'Thinking...' : 'Send Message'}</span>
        </button>
      </footer>
    </section>
  );
}
