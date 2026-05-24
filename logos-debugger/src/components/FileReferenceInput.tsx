// src/components/FileReferenceInput.tsx
import React, { useState } from 'react';
import { useChatStore } from '../lib/chatStore';
import { useStreamStore } from '../lib/streamStore';

interface FileReferenceInputProps {
  workspacePath?: string;
}

export default function FileReferenceInput({ workspacePath = '/Volumes/Study/git/Gemma4Project' }: FileReferenceInputProps) {
  const [path, setPath] = useState('');
  const { setInput, sendPrompt } = useChatStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;
    const command = `/ref ${path.trim()}`;
    setInput(command);
    await sendPrompt(workspacePath);
    setPath('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        placeholder="File path"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        className="rounded-md bg-slate-700 text-white placeholder-gray-400 p-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        aria-label="File reference path"
      />
      <button
        type="submit"
        className="bg-indigo-600 hover:bg-indigo-700 text-white p-1 rounded-md"
        aria-label="Reference file"
      >
        Ref
      </button>
    </form>
  );
}
