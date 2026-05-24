"use client";

import dynamic from "next/dynamic";

const LogosWorkspace = dynamic(() => import("../components/LogosWorkspace"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-[#090d16] text-white select-none">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent shadow-lg" />
        <div className="text-center">
          <p className="text-sm font-bold tracking-wider text-indigo-400 uppercase">Logos Debugger</p>
          <p className="text-xs text-slate-400 mt-1">Booting high-performance thinking workspace...</p>
        </div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <LogosWorkspace />;
}
