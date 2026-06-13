/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class OceanWaveSynth {
  private ctx: AudioContext | null = null;
  private noiseNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private masterGain: GainNode | null = null;
  private chordsInterval: any = null;
  private activeOscillators: { osc: OscillatorNode; gain: GainNode }[] = [];

  // Pentatonic serene scale frequencies (F3, G3, Bb3, C4, D4, F4, G4, Bb4)
  private SereneScale = [174.61, 196.00, 233.08, 261.63, 293.66, 349.23, 392.00, 466.16];

  constructor() {}

  public init() {
    if (this.ctx) return;

    // Support standard dynamic cross-browser formats safely
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.setupOceanNoise();
    this.startAmbientSerenade();
  }

  // Generate procedural organic ambient wave sounds via noise synthesis
  private setupOceanNoise() {
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = 4 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Generate beautiful white noise
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Water filter
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(450, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    // Slow ambient wave LFO to modulate filter
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // 12 seconds cyclic period for high tide/low tide

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(180, this.ctx.currentTime); // sweep filter between 270Hz and 630Hz

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

    // Hookups
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);
    
    noiseSource.connect(this.filter);
    this.filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noiseSource.start();
    this.lfo.start();
  }

  // Generates automatic warm celestial music chords
  private startAmbientSerenade() {
    if (!this.ctx) return;

    const playAmbientNote = () => {
      if (!this.ctx || !this.masterGain) return;

      // Select 2 or 3 random harmonious notes from our serene scale
      const notesToPlay = [
        this.SereneScale[Math.floor(Math.random() * 3)], // Bass/Root note
        this.SereneScale[3 + Math.floor(Math.random() * 5)] // Melody note
      ];

      const now = this.ctx.currentTime;
      
      notesToPlay.forEach((freq) => {
        if (!this.ctx || !this.masterGain) return;

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();

        // Soft sine wave for clean organic ocean ambient resonance or sweet triangle wave
        osc.type = Math.random() > 0.4 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        // Highly-stylized envelope: slow attack (1-2s), long decaying tail (5-7s)
        oscGain.gain.setValueAtTime(0.0, now);
        oscGain.gain.linearRampToValueAtTime(0.045, now + 2.0);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 7.5);

        // Subtle resonance filter
        const noteFilter = this.ctx.createBiquadFilter();
        noteFilter.type = 'lowpass';
        noteFilter.frequency.setValueAtTime(550, now);

        osc.connect(noteFilter);
        noteFilter.connect(oscGain);
        oscGain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 8.0);

        const oscObject = { osc, gain: oscGain };
        this.activeOscillators.push(oscObject);

        setTimeout(() => {
          this.activeOscillators = this.activeOscillators.filter(item => item !== oscObject);
        }, 8500);
      });
    };

    // Play chord sweeps every 6 to 9 seconds dynamically
    const runScheduler = () => {
      playAmbientNote();
      const delay = 6000 + Math.random() * 3500;
      this.chordsInterval = setTimeout(runScheduler, delay);
    };

    runScheduler();
  }

  // Adjust ocean and synth qualities dynamically based on real-time screen interactions!
  public modulateBasedOnInteraction(activeFingersCount: number) {
    if (!this.ctx || !this.filter || !this.masterGain) return;

    const now = this.ctx.currentTime;
    // Boost overall volume/intensity subtly when active finger interactions happen
    const intensity = Math.min(1.0, activeFingersCount / 5.0);
    
    // Sweeps main water wave noise filter higher during active physical splash ripples
    const targetFreq = 450 + intensity * 250;
    this.filter.frequency.setTargetAtTime(targetFreq, now, 0.5);

    // Warm master envelope adjustment
    const targetVolume = 0.3 + intensity * 0.15;
    this.masterGain.gain.setTargetAtTime(targetVolume, now, 0.8);
  }

  public setVolume(volume: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(volume * 0.5, this.ctx.currentTime, 0.1);
    }
  }

  public pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  public resume() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } else {
      this.init();
    }
  }

  public destroy() {
    if (this.chordsInterval) {
      clearTimeout(this.chordsInterval);
    }
    this.activeOscillators.forEach((item) => {
      try {
        item.osc.stop();
      } catch (e) {}
    });
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const ambientSynth = new OceanWaveSynth();
