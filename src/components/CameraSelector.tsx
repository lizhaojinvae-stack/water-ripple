import React from 'react';
import { Camera, RefreshCcw } from 'lucide-react';

interface CameraSelectorProps {
  facingMode: 'user' | 'environment';
  onToggle: () => void;
  availableDevicesCount: number;
}

export default function CameraSelector({ facingMode, onToggle, availableDevicesCount }: CameraSelectorProps) {
  return (
    <div id="camera-controls" className="absolute top-4 right-4 z-40 flex items-center gap-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-950/40 hover:bg-zinc-950/65 border border-zinc-800/80 backdrop-blur-md rounded-full shadow-lg text-white hover:text-emerald-400 transition-all cursor-pointer select-none active:scale-95 group"
        title="Toggle Camera Front/Back"
      >
        <RefreshCcw className="w-4 h-4 text-zinc-300 group-hover:rotate-180 transition-transform duration-500" />
        <Camera className="w-4 h-4" />
        <span className="font-sans text-xs font-semibold tracking-wide">
          {facingMode === 'user' ? 'Front Camera (Mirrored)' : 'Back / Rear Camera'}
        </span>
        {availableDevicesCount > 2 && (
          <span className="flex items-center justify-center w-4 h-4 bg-zinc-800 rounded-full text-[9px] text-zinc-400 font-bold border border-zinc-700">
            {availableDevicesCount}
          </span>
        )}
      </button>
    </div>
  );
}
