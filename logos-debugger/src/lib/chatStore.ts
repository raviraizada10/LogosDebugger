// src/lib/chatStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useStreamStore, streamEventBus$ } from './streamStore';

export type ChatMessage = {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
};

type ChatState = {
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  addMessage: (msg: ChatMessage) => void;
  setInput: (value: string) => void;
  sendPrompt: (workspacePath: string) => Promise<void>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  clear: () => void;
  layoutMode: 'standard' | 'half' | 'maximized';
  setLayoutMode: (mode: 'standard' | 'half' | 'maximized') => void;
};

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set, get) => ({
        messages: [],
        input: '',
        loading: false,
        addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
        setInput: (value) => set({ input: value }),
        sendPrompt: async (workspacePath) => {
          const { input, addMessage, setInput } = get();
          if (!input.trim()) return;
          
          const gemmaModel = typeof window !== 'undefined' ? localStorage.getItem('gemma_model_name') || 'google/gemma-4-e2b' : 'google/gemma-4-e2b';
          const gemmaApiUrl = typeof window !== 'undefined' ? localStorage.getItem('gemma_api_url') || 'http://localhost:1234/api/v1/chat' : 'http://localhost:1234/api/v1/chat';

          addMessage({ role: 'user', content: input, timestamp: Date.now() });
          set({ loading: true });
          try {
            // Add empty agent message placeholder for real-time chunk streaming
            addMessage({ role: 'agent', content: '', timestamp: Date.now() });
            await useStreamStore.getState().connectLiveGemmaDebugger(input, workspacePath, gemmaModel, gemmaApiUrl);
          } catch (e) {
            // Find placeholder and update with error
            const { messages } = get();
            const updated = [...messages];
            const lastAgentIdx = [...updated].reverse().findIndex(m => m.role === 'agent');
            if (lastAgentIdx !== -1) {
              const actualIdx = messages.length - 1 - lastAgentIdx;
              updated[actualIdx] = {
                ...updated[actualIdx],
                content: `Error: ${e instanceof Error ? e.message : String(e)}`
              };
              set({ messages: updated });
            } else {
              addMessage({ role: 'agent', content: `Error: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
            }
          } finally {
            set({ loading: false });
            setInput('');
          }
        },
        isOpen: false,
        setIsOpen: (open) => set({ isOpen: open }),
        clear: () => set({ messages: [], input: '' }),
        layoutMode: 'standard',
        setLayoutMode: (mode) => set({ layoutMode: mode }),
      }),
      {
        name: 'antigravity-chat-history',
        partialize: (state) => ({
          messages: state.messages,
          input: state.input,
          layoutMode: state.layoutMode,
        }),
      }
    )
  )
);

// Global subscription to stream agent telemetry events back to the active chat message
if (typeof window !== 'undefined') {
  streamEventBus$.subscribe((event) => {
    if (event.type === 'response-chunk' || event.type === 'text-chunk') {
      const { messages } = useChatStore.getState();
      const lastAgentIdx = [...messages].reverse().findIndex(m => m.role === 'agent');
      if (lastAgentIdx !== -1) {
        const actualIdx = messages.length - 1 - lastAgentIdx;
        const lastMsg = messages[actualIdx];
        
        const updatedMessages = [...messages];
        updatedMessages[actualIdx] = {
          ...lastMsg,
          content: lastMsg.content + event.chunk
        };
        
        useChatStore.setState({ messages: updatedMessages });
      }
    }
  });
}
