/**
 * Low-latency Web Audio A/B playback controller supporting instantaneous switching
 * between raw (Brut) and surgically processed (Traité) PCM buffers without clicks.
 */
export class DualBufferAudioPlayer {
  private ctx: AudioContext | null = null;
  private rawSource: AudioBufferSourceNode | null = null;
  private procSource: AudioBufferSourceNode | null = null;
  private rawGain: GainNode | null = null;
  private procGain: GainNode | null = null;

  private rawBuffer: AudioBuffer | null = null;
  private procBuffer: AudioBuffer | null = null;

  private isPlaying = false;
  private startCtxTime = 0;
  private pauseOffsetSec = 0;
  private durationSec = 0;
  private mode: 'raw' | 'processed' = 'raw';
  private rafId: number | null = null;
  private onTimeUpdate: ((timeSec: number, playing: boolean) => void) | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public loadBuffers(
    rawSamples: Float32Array,
    processedSamples: Float32Array | null,
    sampleRate: number,
  ): void {
    const wasPlaying = this.isPlaying;
    const prevTime = this.getCurrentTime();
    this.stopInternal(false);

    const ctx = this.ensureContext();
    const rawBuf = ctx.createBuffer(1, rawSamples.length, sampleRate);
    rawBuf.getChannelData(0).set(rawSamples);
    this.rawBuffer = rawBuf;

    const procSrc = processedSamples ?? rawSamples;
    const procBuf = ctx.createBuffer(1, procSrc.length, sampleRate);
    procBuf.getChannelData(0).set(procSrc);
    this.procBuffer = procBuf;

    this.durationSec = rawBuf.duration;
    this.pauseOffsetSec = Math.min(prevTime, Math.max(0, this.durationSec - 0.05));

    if (wasPlaying) {
      this.play(this.pauseOffsetSec);
    }
  }

  public updateProcessedBuffer(processedSamples: Float32Array, sampleRate: number): void {
    if (!this.ctx || !this.rawBuffer) return;
    const procBuf = this.ctx.createBuffer(1, processedSamples.length, sampleRate);
    procBuf.getChannelData(0).set(processedSamples);
    this.procBuffer = procBuf;

    // Hot-swap active playback seamlessly if currently playing
    if (this.isPlaying) {
      const currentPos = this.getCurrentTime();
      this.stopInternal(false);
      this.play(currentPos);
    }
  }

  public setMode(mode: 'raw' | 'processed'): void {
    this.mode = mode;
    if (this.ctx && this.rawGain && this.procGain) {
      const now = this.ctx.currentTime;
      // 8ms click-free linear crossfade for true A/B auditioning
      this.rawGain.gain.cancelScheduledValues(now);
      this.procGain.gain.cancelScheduledValues(now);
      this.rawGain.gain.setTargetAtTime(mode === 'raw' ? 1 : 0, now, 0.008);
      this.procGain.gain.setTargetAtTime(mode === 'processed' ? 1 : 0, now, 0.008);
    }
  }

  public setOnTimeUpdate(cb: (timeSec: number, playing: boolean) => void): void {
    this.onTimeUpdate = cb;
  }

  public getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) return this.pauseOffsetSec;
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    return Math.min(this.durationSec, Math.max(0, this.pauseOffsetSec + elapsed));
  }

  public play(fromSec?: number): void {
    if (!this.rawBuffer || !this.procBuffer) return;
    const ctx = this.ensureContext();
    this.stopInternal(false);

    const startOffset =
      fromSec !== undefined
        ? Math.max(0, Math.min(this.durationSec - 0.02, fromSec))
        : this.pauseOffsetSec >= this.durationSec - 0.05
          ? 0
          : this.pauseOffsetSec;

    const rawSrc = ctx.createBufferSource();
    rawSrc.buffer = this.rawBuffer;
    const procSrc = ctx.createBufferSource();
    procSrc.buffer = this.procBuffer;

    const rawGain = ctx.createGain();
    const procGain = ctx.createGain();
    rawGain.gain.value = this.mode === 'raw' ? 1 : 0;
    procGain.gain.value = this.mode === 'processed' ? 1 : 0;

    rawSrc.connect(rawGain).connect(ctx.destination);
    procSrc.connect(procGain).connect(ctx.destination);

    this.rawSource = rawSrc;
    this.procSource = procSrc;
    this.rawGain = rawGain;
    this.procGain = procGain;

    this.pauseOffsetSec = startOffset;
    this.startCtxTime = ctx.currentTime;
    this.isPlaying = true;

    rawSrc.start(0, startOffset);
    procSrc.start(0, startOffset);

    rawSrc.onended = () => {
      if (this.isPlaying && this.getCurrentTime() >= this.durationSec - 0.05) {
        this.pauseOffsetSec = 0;
        this.isPlaying = false;
        this.stopRaf();
        this.onTimeUpdate?.(0, false);
      }
    };

    this.startRaf();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.pauseOffsetSec = this.getCurrentTime();
    this.stopInternal(true);
  }

  public seek(timeSec: number): void {
    const clamped = Math.max(0, Math.min(this.durationSec, timeSec));
    this.pauseOffsetSec = clamped;
    if (this.isPlaying) {
      this.play(clamped);
    } else {
      this.onTimeUpdate?.(clamped, false);
    }
  }

  private stopInternal(notify: boolean): void {
    this.isPlaying = false;
    this.stopRaf();
    try {
      this.rawSource?.stop();
      this.procSource?.stop();
    } catch {
      // Source may have already ended
    }
    this.rawSource?.disconnect();
    this.procSource?.disconnect();
    this.rawGain?.disconnect();
    this.procGain?.disconnect();
    this.rawSource = null;
    this.procSource = null;
    this.rawGain = null;
    this.procGain = null;
    if (notify) {
      this.onTimeUpdate?.(this.pauseOffsetSec, false);
    }
  }

  private startRaf(): void {
    this.stopRaf();
    const tick = () => {
      if (!this.isPlaying) return;
      const t = this.getCurrentTime();
      this.onTimeUpdate?.(t, true);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public dispose(): void {
    this.stopInternal(false);
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
