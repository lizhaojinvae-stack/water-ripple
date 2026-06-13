import React from 'react';
import { AlertOctagon, RefreshCw, X } from 'lucide-react';

interface ShaderErrorDisplayProps {
  error: string;
  onClear: () => void;
  onRetry: () => void;
}

export default function ShaderErrorDisplay({ error, onClear, onRetry }: ShaderErrorDisplayProps) {
  return (
    <div id="shader-error-panel" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-3xl overflow-hidden bg-zinc-950 border border-red-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-red-950/20">
          <div className="flex items-center gap-3">
            <AlertOctagon className="w-6 h-6 text-red-500 animate-pulse" />
            <span className="font-sans font-semibold tracking-wide text-zinc-200">
              WebGL Shader Compilation Failed
            </span>
          </div>
          <button 
            onClick={onClear}
            className="p-1 px-2 text-zinc-400 rounded-lg hover:text-white hover:bg-zinc-800/50 transition-all cursor-pointer"
            aria-label="Dismiss panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto font-mono text-xs leading-relaxed text-zinc-300">
          <p className="mb-4 text-sm font-semibold text-red-400">
            Executable shader compilation or program linkage has encountered fatal GLSL exceptions:
          </p>
          <pre className="p-4 overflow-x-auto text-red-300 rounded-xl bg-red-950/20 border border-red-900/30 whitespace-pre-wrap select-text">
            {error}
          </pre>
          
          <div className="mt-6 font-sans text-sm text-zinc-400 leading-normal">
            <p className="font-medium text-zinc-300 mb-2">Troubleshooting suggestions:</p>
            <ul className="list-disc pl-5 space-y-1.5 list-inside text-zinc-400">
              <li>Ensure your browser and system support modern <span className="text-zinc-300">WebGL 1.0 (GLSL ES 1.0)</span> configurations.</li>
              <li>WebGL bindings may fail within sandboxed or restricted iFrame contexts if hardware acceleration is blocked.</li>
              <li>Try refreshing or restarting the hardware GPU driver in your browser.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-900/40 border-t border-zinc-800/80">
          <button 
            onClick={onClear}
            className="px-4 py-2 font-sans text-sm font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/40 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
          <button 
            onClick={onRetry}
            className="flex items-center gap-2 px-5 py-2 font-sans text-sm font-semibold text-zinc-950 bg-red-500 hover:bg-red-400 rounded-lg transition-colors cursor-pointer shadow-lg shadow-red-500/20"
          >
            <RefreshCw className="w-4 h-4 animate-spin-slow" />
            Recompile Shaders
          </button>
        </div>
        
      </div>
    </div>
  );
}
