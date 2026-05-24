// src/components/ChatMessage.tsx
import React, { useState } from 'react';
import { ChatMessage as Message } from '../lib/chatStore';

interface ParsedBlock {
  type: 'text' | 'thought' | 'call' | 'response' | 'step' | 'json';
  content: string;
  metadata?: Record<string, any>;
}

// Inline helper to parse message into logical structured chunks
function parseMessageContent(text: string): ParsedBlock[] {
  if (!text) return [];
  const blocks: ParsedBlock[] = [];
  let index = 0;

  while (index < text.length) {
    const nextAngle = text.indexOf('<', index);
    const nextCurly = text.indexOf('{', index);

    if (nextAngle === -1 && nextCurly === -1) {
      const remaining = text.substring(index);
      if (remaining.trim()) {
        blocks.push({ type: 'text', content: remaining });
      }
      break;
    }

    let isXML = false;
    let startIdx = -1;

    if (nextAngle !== -1 && (nextCurly === -1 || nextAngle < nextCurly)) {
      isXML = true;
      startIdx = nextAngle;
    } else {
      isXML = false;
      startIdx = nextCurly;
    }

    if (startIdx > index) {
      const preceding = text.substring(index, startIdx);
      if (preceding.trim()) {
        blocks.push({ type: 'text', content: preceding });
      }
      index = startIdx;
    }

    if (isXML) {
      if (text.substring(index).startsWith('<thought>')) {
        const closeIdx = text.indexOf('</thought>', index);
        if (closeIdx !== -1) {
          const content = text.substring(index + 9, closeIdx);
          blocks.push({ type: 'thought', content });
          index = closeIdx + 10;
        } else {
          const content = text.substring(index + 9);
          blocks.push({ type: 'thought', content });
          break;
        }
      } else if (text.substring(index).startsWith('<response>')) {
        const closeIdx = text.indexOf('</response>', index);
        if (closeIdx !== -1) {
          const content = text.substring(index + 10, closeIdx);
          blocks.push({ type: 'response', content });
          index = closeIdx + 11;
        } else {
          const content = text.substring(index + 10);
          blocks.push({ type: 'response', content });
          break;
        }
      } else if (text.substring(index).startsWith('<call')) {
        const tagClose = text.indexOf('>', index);
        if (tagClose !== -1) {
          const tag = text.substring(index, tagClose + 1);
          const nameMatch = tag.match(/name="([^"]+)"/);
          const argsMatch = tag.match(/args="((?:[^"\\]|\\.)*)"/);
          
          const name = nameMatch ? nameMatch[1] : 'unknown_tool';
          let args: Record<string, any> = {};
          if (argsMatch) {
            try {
              args = JSON.parse(argsMatch[1].replace(/\\"/g, '"'));
            } catch {
              args = { raw: argsMatch[1] };
            }
          }
          
          const closeIdx = text.indexOf('</call>', tagClose);
          if (closeIdx !== -1) {
            const inner = text.substring(tagClose + 1, closeIdx);
            blocks.push({ 
              type: 'call', 
              content: inner, 
              metadata: { name, args } 
            });
            index = closeIdx + 7;
          } else {
            const inner = text.substring(tagClose + 1);
            blocks.push({ 
              type: 'call', 
              content: inner, 
              metadata: { name, args } 
            });
            break;
          }
        } else {
          const remaining = text.substring(index);
          blocks.push({ type: 'text', content: remaining });
          break;
        }
      } else if (text.substring(index).startsWith('<step')) {
        const tagClose = text.indexOf('>', index);
        if (tagClose !== -1) {
          const tag = text.substring(index, tagClose + 1);
          const nameMatch = tag.match(/name="([^"]+)"/);
          const name = nameMatch ? nameMatch[1] : 'step';
          
          const closeIdx = text.indexOf('</step>', tagClose);
          if (closeIdx !== -1) {
            const inner = text.substring(tagClose + 1, closeIdx);
            blocks.push({ type: 'step', content: inner, metadata: { name } });
            index = closeIdx + 7;
          } else {
            const inner = text.substring(tagClose + 1);
            blocks.push({ type: 'step', content: inner, metadata: { name } });
            break;
          }
        } else {
          const remaining = text.substring(index);
          blocks.push({ type: 'text', content: remaining });
          break;
        }
      } else {
        blocks.push({ type: 'text', content: '<' });
        index += 1;
      }
    } else {
      let openBraces = 0;
      let closingIdx = -1;
      
      for (let i = index; i < text.length; i++) {
        if (text[i] === '{') openBraces++;
        if (text[i] === '}') {
          openBraces--;
          if (openBraces === 0) {
            closingIdx = i;
            break;
          }
        }
      }
      
      if (closingIdx !== -1) {
        const jsonStr = text.substring(index, closingIdx + 1);
        try {
          const parsedJSON = JSON.parse(jsonStr);
          if (parsedJSON && (parsedJSON.status || parsedJSON.tool || parsedJSON.message)) {
            blocks.push({ type: 'json', content: jsonStr, metadata: parsedJSON });
            index = closingIdx + 1;
          } else {
            blocks.push({ type: 'text', content: '{' });
            index += 1;
          }
        } catch {
          blocks.push({ type: 'text', content: '{' });
          index += 1;
        }
      } else {
        blocks.push({ type: 'text', content: '{' });
        index += 1;
      }
    }
  }

  return blocks;
}

// Inline helper to format text tokens with inline formatting (bold, inline code)
function formatTextTokens(text: string) {
  if (!text) return null;
  const tokens = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={i} className="font-extrabold text-white">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-indigo-950/50 text-indigo-300 border border-indigo-500/10 font-mono text-[11px] font-semibold">
          {token.slice(1, -1)}
        </code>
      );
    }
    return token;
  });
}

// Renders visual code blocks and formatted text lines
function renderTextBlock(text: string) {
  const parts = text.split(/(```[a-zA-Z0-9]*\n[\s\S]*?\n```)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('```')) {
      const match = part.match(/```([a-zA-Z0-9]*)\n([\s\S]*?)\n```/);
      const lang = match ? match[1] : '';
      const code = match ? match[2] : part;
      return (
        <div key={idx} className="my-3 bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden font-mono text-xs shadow-inner">
          {lang && (
            <div className="bg-slate-900/60 px-4 py-1.5 border-b border-slate-800/60 text-[9px] font-bold text-slate-500 uppercase tracking-wider flex justify-between select-none">
              <span>{lang}</span>
              <span>Code Block</span>
            </div>
          )}
          <pre className="p-3 overflow-x-auto whitespace-pre text-indigo-200 leading-relaxed">{code}</pre>
        </div>
      );
    }
    
    return (
      <div key={idx} className="whitespace-pre-wrap leading-relaxed text-slate-200 text-xs">
        {formatTextTokens(part)}
      </div>
    );
  });
}

// Visual components for block types
function ThoughtBlock({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="my-2.5 bg-brain/10 hover:bg-brain/15 border border-brain-foreground/15 rounded-xl overflow-hidden backdrop-blur-sm transition-colors duration-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-[10px] font-bold text-brain-foreground uppercase tracking-wider cursor-pointer focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <span className="animate-pulse">🧠</span>
          <span>Thinking Track</span>
        </div>
        <span className="text-[9.5px] text-brain-foreground/60">{isOpen ? '▼ Collapse' : '▲ Expand'}</span>
      </button>
      {isOpen && (
        <div className="px-3.5 pb-3.5 text-xs text-brain-foreground/80 leading-relaxed italic whitespace-pre-wrap font-medium border-t border-brain-foreground/10 pt-2 bg-brain/5">
          {content.trim() || 'Streaming thoughts...'}
        </div>
      )}
    </div>
  );
}

function ToolCallBlock({ content, metadata }: { content: string; metadata?: Record<string, any> }) {
  const [isArgsOpen, setIsArgsOpen] = useState(false);
  const name = metadata?.name || 'unknown_tool';
  const args = metadata?.args || {};

  // Check if it has a nested response block
  let innerResponse = content;
  if (content.includes('<response>')) {
    const start = content.indexOf('<response>') + 10;
    const end = content.indexOf('</response>');
    innerResponse = end !== -1 ? content.substring(start, end) : content.substring(start);
  }

  return (
    <div className="my-3 bg-indigo-950/20 border border-indigo-500/20 rounded-xl overflow-hidden backdrop-blur-sm shadow-md">
      <div className="bg-indigo-950/40 px-3.5 py-2 border-b border-indigo-500/10 flex items-center justify-between text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400 animate-pulse">⚙️</span>
          <span>Tool Execution: {name}</span>
        </div>
        <button
          onClick={() => setIsArgsOpen(!isArgsOpen)}
          className="text-[9px] text-indigo-400/60 hover:text-indigo-400 focus:outline-none cursor-pointer"
        >
          {isArgsOpen ? 'Hide Args' : 'Show Args'}
        </button>
      </div>
      
      {isArgsOpen && (
        <div className="bg-slate-950/60 p-3 border-b border-indigo-500/10 font-mono text-[10px] text-indigo-300/90 overflow-x-auto whitespace-pre-wrap max-h-36">
          <strong>Arguments:</strong>
          <pre className="mt-1 font-mono text-[9px] text-indigo-200">{JSON.stringify(args, null, 2)}</pre>
        </div>
      )}
      
      <div className="p-3 bg-slate-950/20 text-xs">
        <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">
          <span>Return Status / Data</span>
        </div>
        {innerResponse.trim() ? (
          <pre className="font-mono text-[10px] text-emerald-400/90 whitespace-pre-wrap leading-normal bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40">
            {innerResponse.trim()}
          </pre>
        ) : (
          <span className="text-slate-400 italic">Executing tool in local playground...</span>
        )}
      </div>
    </div>
  );
}

function StepBlock({ metadata }: { metadata?: Record<string, any> }) {
  const name = metadata?.name || 'step';
  return (
    <div className="my-2 bg-indigo-600/10 border border-indigo-600/35 rounded-xl px-3 py-2 flex items-center gap-2 shadow-sm select-none">
      <span className="text-indigo-400 animate-bounce">⚡</span>
      <div className="flex-1">
        <span className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-wider block">Completed Step</span>
        <span className="text-xs font-semibold text-white">{name}</span>
      </div>
    </div>
  );
}

function JsonTelemetryBlock({ metadata }: { metadata?: Record<string, any> }) {
  const data = metadata || {};
  const isSuccess = data.status === 'SUCCESS';
  return (
    <div className={`my-3 p-3.5 border rounded-xl backdrop-blur-sm shadow-md flex gap-3 ${
      isSuccess 
        ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' 
        : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
    }`}>
      <div className="text-sm select-none">{isSuccess ? '✅' : '❌'}</div>
      <div className="flex-1 text-xs">
        <span className={`text-[9px] font-extrabold uppercase tracking-wider block mb-0.5 ${
          isSuccess ? 'text-emerald-500' : 'text-rose-500'
         }`}>
          {isSuccess ? 'Tool Execution Success' : 'Tool Execution Failed'}
        </span>
        <p className="text-slate-300 leading-relaxed font-sans">{data.message || data.error || 'Mock operation executed successfully.'}</p>
        {data.tool && (
          <span className="inline-block mt-2 px-1.5 py-0.5 rounded bg-slate-950/40 border border-slate-800 text-[9px] font-mono text-slate-400 select-none">
            Tool: {data.tool}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  
  if (isUser) {
    return (
      <div className="flex justify-end mb-2">
        <div
          className="max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed break-words bg-indigo-600 text-white font-medium shadow-md border border-indigo-700 select-text animate-fade-in"
          aria-label="User message"
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Parse structured blocks for AI agent outputs
  const blocks = parseMessageContent(message.content);

  return (
    <div className="flex justify-start mb-2">
      <div
        className="w-full max-w-[90%] p-3.5 rounded-2xl text-xs leading-relaxed break-words bg-slate-800/40 border border-slate-800/50 backdrop-blur-sm text-white shadow-lg select-text animate-fade-in flex flex-col gap-1"
        aria-label="Agent message"
      >
        {blocks.length === 0 ? (
          <span className="text-slate-400 italic">Formatting response stream...</span>
        ) : (
          blocks.map((block, idx) => {
            switch (block.type) {
              case 'thought':
                return <ThoughtBlock key={idx} content={block.content} />;
              case 'call':
                return <ToolCallBlock key={idx} content={block.content} metadata={block.metadata} />;
              case 'step':
                return <StepBlock key={idx} metadata={block.metadata} />;
              case 'json':
                return <JsonTelemetryBlock key={idx} metadata={block.metadata} />;
              case 'response':
                return (
                  <div key={idx} className="my-1 border-l-2 border-emerald-500/30 pl-3.5 bg-emerald-950/5 rounded-r-xl py-1">
                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider block mb-1">Final Result</span>
                    {renderTextBlock(block.content)}
                  </div>
                );
              default:
                return <React.Fragment key={idx}>{renderTextBlock(block.content)}</React.Fragment>;
            }
          })
        )}
      </div>
    </div>
  );
}
