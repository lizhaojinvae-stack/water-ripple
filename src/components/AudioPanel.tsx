import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Radio, Music, Sliders, Play, Pause } from 'lucide-react';
import { ambientSynth } from '../utils/audio-synth';

// @ts-ignore
import bgMusicUrl from '../../assets/bg_music.mp3';

interface AudioPanelProps {
  activeInteractionCount: number;
}

export default function AudioPanel({ activeInteractionCount }: AudioPanelProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioSource, setAudioSource] = useState<'synth' | 'piano' | 'custom'>('custom');
  const [volume, setVolume] = useState<number>(0.5);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Soothing royalty-free piano background ambient stream fallback
  const PIANO_STREAM_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

  // Respond to user interactive waves by modulating the Web Audio synth instantly!
  useEffect(() => {
    if (isPlaying && audioSource === 'synth') {
      ambientSynth.modulateBasedOnInteraction(activeInteractionCount);
    }
  }, [activeInteractionCount, isPlaying, audioSource]);

  // Handle Play/Pause toggling
  const togglePlay = () => {
    const nextPlayState = !isPlaying;
    setIsPlaying(nextPlayState);

    if (nextPlayState) {
      if (audioSource === 'synth') {
        ambientSynth.resume();
        ambientSynth.setVolume(volume);
        if (audioRef.current) {
          audioRef.current.pause();
        }
      } else {
        ambientSynth.pause();
        const streamUrl = audioSource === 'piano' ? PIANO_STREAM_URL : bgMusicUrl;
        
        if (!audioRef.current || audioRef.current.src !== streamUrl) {
          if (audioRef.current) {
            audioRef.current.pause();
          }
          const audio = new Audio(streamUrl);
          audio.loop = true;
          audio.volume = volume * 0.35; // keep soft
          audioRef.current = audio;
        } else {
          audioRef.current.volume = volume * 0.35;
        }
        
        audioRef.current.play().catch((err) => {
          console.warn('Audio play restricted by browser autoplay policy', err);
        });
      }
    } else {
      ambientSynth.pause();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  };

  // Switch between synthesis styles
  const handleSourceChange = (src: 'synth' | 'piano' | 'custom') => {
    setAudioSource(src);
    if (!isPlaying) return;

    if (src === 'synth') {
      if (audioRef.current) audioRef.current.pause();
      ambientSynth.resume();
      ambientSynth.setVolume(volume);
    } else {
      ambientSynth.pause();
      const streamUrl = src === 'piano' ? PIANO_STREAM_URL : bgMusicUrl;
      
      if (!audioRef.current || audioRef.current.src !== streamUrl) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(streamUrl);
        audio.loop = true;
        audioRef.current = audio;
      }
      audioRef.current.volume = volume * 0.35;
      audioRef.current.play().catch((err) => console.warn(err));
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    
    ambientSynth.setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v * 0.35;
    }
  };

  // Safely cleanup audio contexts on dismount
  useEffect(() => {
    return () => {
      ambientSynth.destroy();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Display label for current playing track
  const getSourceLabel = () => {
    if (audioSource === 'custom') return '🎵 Custom BG Music (Local)';
    if (audioSource === 'synth') return '🌊 Serene Synth (Interactive)';
    return '🎹 Serenade Harmony';
  };

  return (
    <div id="audio-soundscape-panel" className="absolute top-4 left-4 sm:left-auto sm:right-4 md:right-80 z-40 flex flex-col items-end gap-1.5 pointer-events-auto">
      <div className="flex items-center gap-2 bg-zinc-950/40 border border-zinc-900/40 backdrop-blur-md rounded-full shadow-lg p-1 px-3 text-white transition-all">
        
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className={`p-2 rounded-full cursor-pointer transition-all ${
            isPlaying 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'hover:bg-zinc-800/40 text-zinc-300'
          }`}
          title={isPlaying ? "Pause Ambient BGM" : "Play Serene Water Sounds / music"}
        >
          {isPlaying ? (
            <div className="flex items-center gap-0.5 justify-center h-4 w-4">
              <span className="w-0.5 h-3 bg-emerald-400 animate-pulse rounded-full" />
              <span className="w-0.5 h-4 bg-emerald-400 animate-pulse rounded-full [animation-delay:0.2s]" />
              <span className="w-0.5 h-2.5 bg-emerald-400 animate-pulse rounded-full [animation-delay:0.4s]" />
            </div>
          ) : (
            <VolumeX className="w-4 h-4 text-zinc-400" />
          )}
        </button>

        {/* Dynamic description of playing track */}
        <div className="flex flex-col select-none pr-1">
          <span className="font-sans text-[10px] font-bold text-zinc-300 leading-none">
            {isPlaying ? 'Playing BGM' : 'BGM Off'}
          </span>
          <span className="text-[9px] font-mono text-zinc-400 capitalize leading-relaxed select-text">
            {getSourceLabel()}
          </span>
        </div>

        {/* Audio Volume & Tracks Settings Button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-full hover:bg-zinc-850/50 cursor-pointer transition-all ${showSettings ? 'text-emerald-400 bg-zinc-900/35' : 'text-zinc-400 tooltip'}`}
          title="Audio Soundscape Configuration"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expandable Advanced Settings Box */}
      {showSettings && (
        <div className="w-64 p-4 bg-zinc-950/85 backdrop-blur-xl border border-zinc-900 rounded-2xl shadow-2xl flex flex-col gap-4 text-zinc-200 animate-fade-in animate-slide-up select-none">
          
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
            <span className="font-sans text-xs font-bold tracking-wide uppercase text-zinc-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-zinc-400" />
              Soundscape Options
            </span>
            {isPlaying && (
              <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-md font-mono font-bold animate-pulse">
                LIVE INTERACTION
              </span>
            )}
          </div>

          {/* Sound choice selectors */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => handleSourceChange('custom')}
              className={`flex items-center gap-2.5 p-2 rounded-xl text-left border cursor-pointer transition-all text-xs font-sans ${
                audioSource === 'custom'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-transparent text-zinc-400 border-transparent hover:bg-zinc-900/30'
              }`}
            >
              <Music className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold">Custom Background Music</span>
                <span className="text-[9px] text-zinc-500">Play uploaded bg_music.mp3 directly</span>
              </div>
            </button>

            <button
              onClick={() => handleSourceChange('synth')}
              className={`flex items-center gap-2.5 p-2 rounded-xl text-left border cursor-pointer transition-all text-xs font-sans ${
                audioSource === 'synth'
                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                  : 'bg-transparent text-zinc-400 border-transparent hover:bg-zinc-900/30'
              }`}
            >
              <Radio className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold">Interactive Fluid Synth</span>
                <span className="text-[9px] text-zinc-500">Audio sweep updates with ripple velocity</span>
              </div>
            </button>

            <button
              onClick={() => handleSourceChange('piano')}
              className={`flex items-center gap-2.5 p-2 rounded-xl text-left border cursor-pointer transition-all text-xs font-sans ${
                audioSource === 'piano'
                  ? 'bg-zinc-800/40 text-zinc-300 border-zinc-700/30'
                  : 'bg-transparent text-zinc-400 border-transparent hover:bg-zinc-900/30'
              }`}
            >
              <Music className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold">Serenade Harmony</span>
                <span className="text-[9px] text-zinc-500">Relaxing piano & sound chords streaming</span>
              </div>
            </button>
          </div>

          {/* Volume control slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" /> Volume
              </span>
              <span className="font-mono">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
            />
          </div>

          <p className="text-[9px] font-mono text-zinc-500 leading-tight">
            * Note: Audio playing requires standard browser interaction layout before unlocking media constraints.
          </p>
        </div>
      )}
    </div>
  );
}
