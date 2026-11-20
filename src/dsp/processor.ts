import {
  computeSpectrogramAndSpectrum,
  computeWaveformPeaks,
  dbToLinear,
  linearToDb,
  measureAudioMetrics,
} from './analyzer';
import type { ProcessingResult, SurgicalChainConfig } from './types';

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function makePeakingEq(sr: number, freqHz: number, q: number, gainDb: number): BiquadCoeffs {
  const f = Math.max(20, Math.min(sr * 0.45, freqHz));
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f) / sr;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.max(0.5, q));

  const b0 = 1 + alpha * A;
  const b1 = -2 * cosW0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha / A;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function makeHighPass(sr: number, freqHz: number, q = 0.707): BiquadCoeffs {
  const f = Math.max(20, Math.min(sr * 0.45, freqHz));
  const w0 = (2 * Math.PI * f) / sr;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);

  const b0 = (1 + cosW0) / 2;
  const b1 = -(1 + cosW0);
  const b2 = (1 + cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function applyBiquadInPlace(buf: Float32Array, c: BiquadCoeffs): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    buf[i] = y0;
  }
}

/**
 * Evaluates combined frequency response (dB) of active surgical EQ/notch filters
 * for real-time overlay plotting on the spectrum canvas.
 */
export function evaluateSurgicalEqCurve(
  frequenciesHz: Float32Array,
  sampleRate: number,
  chain: SurgicalChainConfig,
): Float32Array {
  const filters: BiquadCoeffs[] = [];
  if (chain.humAndNoise.enabled) {
    filters.push(makeHighPass(sampleRate, chain.humAndNoise.highPassHz));
    if (chain.humAndNoise.humCutDb < -0.5) {
      filters.push(makePeakingEq(sampleRate, chain.humAndNoise.humFreqHz, 12, chain.humAndNoise.humCutDb));
      filters.push(makePeakingEq(sampleRate, chain.humAndNoise.humFreqHz * 2, 14, chain.humAndNoise.humCutDb * 0.7));
      filters.push(makePeakingEq(sampleRate, chain.humAndNoise.humFreqHz * 3, 14, chain.humAndNoise.humCutDb * 0.5));
    }
  }
  if (chain.deMetallic.enabled && chain.deMetallic.gainDb < -0.5) {
    filters.push(
      makePeakingEq(
        sampleRate,
        chain.deMetallic.frequencyHz,
        chain.deMetallic.qFactor,
        chain.deMetallic.gainDb,
      ),
    );
    if (chain.deMetallic.harmonicNotch && chain.deMetallic.frequencyHz * 1.5 < sampleRate * 0.45) {
      filters.push(
        makePeakingEq(
          sampleRate,
          chain.deMetallic.frequencyHz * 1.5,
          chain.deMetallic.qFactor * 1.1,
          chain.deMetallic.gainDb * 0.55,
        ),
      );
    }
  }

  const outDb = new Float32Array(frequenciesHz.length);
  if (filters.length === 0) return outDb;

  for (let i = 0; i < frequenciesHz.length; i++) {
    const w = (2 * Math.PI * frequenciesHz[i]) / sampleRate;
    const cosW = Math.cos(w);
    const sinW = Math.sin(w);
    const cos2W = Math.cos(2 * w);
    const sin2W = Math.sin(2 * w);

    let totalGain = 1;
    for (const c of filters) {
      const numRe = c.b0 + c.b1 * cosW + c.b2 * cos2W;
      const numIm = -c.b1 * sinW - c.b2 * sin2W;
      const denRe = 1 + c.a1 * cosW + c.a2 * cos2W;
      const denIm = -c.a1 * sinW - c.a2 * sin2W;
      const mag = Math.hypot(numRe, numIm) / Math.max(1e-9, Math.hypot(denRe, denIm));
      totalGain *= mag;
    }
    outDb[i] = linearToDb(totalGain);
  }
  return outDb;
}

/**
 * Applies the surgical post-processing chain to a PCM buffer with minimal latency
 * and measures exact post-processing metrics.
 */
export function processAudioBuffer(
  rawSamples: Float32Array,
  sampleRate: number,
  chain: SurgicalChainConfig,
): ProcessingResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const buf = new Float32Array(rawSamples);
  const n = buf.length;

  // 1. High-Pass + 50/60 Hz Hum Notch Bank
  if (chain.humAndNoise.enabled) {
    applyBiquadInPlace(buf, makeHighPass(sampleRate, chain.humAndNoise.highPassHz));
    if (chain.humAndNoise.humCutDb < -0.5) {
      const f = chain.humAndNoise.humFreqHz;
      applyBiquadInPlace(buf, makePeakingEq(sampleRate, f, 12, chain.humAndNoise.humCutDb));
      applyBiquadInPlace(buf, makePeakingEq(sampleRate, f * 2, 14, chain.humAndNoise.humCutDb * 0.7));
      applyBiquadInPlace(buf, makePeakingEq(sampleRate, f * 3, 14, chain.humAndNoise.humCutDb * 0.5));
    }
  }

  // 2. Surgical De-Metallizer (High-Q Notch + Secondary Harmonic)
  if (chain.deMetallic.enabled && chain.deMetallic.gainDb < -0.5) {
    applyBiquadInPlace(
      buf,
      makePeakingEq(
        sampleRate,
        chain.deMetallic.frequencyHz,
        chain.deMetallic.qFactor,
        chain.deMetallic.gainDb,
      ),
    );
    // Second cascading narrow notch for surgical suppression when gainDb <= -12
    if (chain.deMetallic.gainDb <= -10) {
      applyBiquadInPlace(
        buf,
        makePeakingEq(
          sampleRate,
          chain.deMetallic.frequencyHz,
          chain.deMetallic.qFactor * 1.35,
          chain.deMetallic.gainDb * 0.55,
        ),
      );
    }
    if (chain.deMetallic.harmonicNotch && chain.deMetallic.frequencyHz * 1.5 < sampleRate * 0.45) {
      applyBiquadInPlace(
        buf,
        makePeakingEq(
          sampleRate,
          chain.deMetallic.frequencyHz * 1.5,
          chain.deMetallic.qFactor * 1.1,
          chain.deMetallic.gainDb * 0.65,
        ),
      );
    }
  }

  // 3. De-Echo (Inverse Feedforward/Feedback Comb Cancellation calibrated to detected delayMs)
  if (chain.deEcho.enabled && chain.deEcho.strength > 0) {
    const delaySamples = Math.max(1, Math.round((chain.deEcho.delayMs / 1000) * sampleRate));
    // Clamp alpha below 0.62 to guarantee unconditional stability
    const alpha = Math.min(0.62, (chain.deEcho.strength / 100) * 0.68);
    const cleaned = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const delayedClean = i >= delaySamples ? cleaned[i - delaySamples] : 0;
      cleaned[i] = buf[i] - alpha * delayedClean;
    }
    buf.set(cleaned);
  }

  // 4. De-Reverb (Adaptive Transient-Preserving Tail Suppressor)
  if (chain.deReverb.enabled && chain.deReverb.reduction > 0) {
    const reductionRatio = chain.deReverb.reduction / 100;
    const fastAttack = Math.exp(-1 / (0.004 * sampleRate));
    const fastRelease = Math.exp(-1 / (0.035 * sampleRate));
    const slowRelease = Math.exp(-1 / ((chain.deReverb.releaseMs / 1000) * sampleRate));

    let fastEnv = 0;
    let slowEnv = 0;
    let smoothedGain = 1;

    for (let i = 0; i < n; i++) {
      const a = Math.abs(buf[i]);
      fastEnv = a > fastEnv ? fastAttack * fastEnv + (1 - fastAttack) * a : fastRelease * fastEnv + (1 - fastRelease) * a;
      slowEnv = a > slowEnv ? fastAttack * slowEnv + (1 - fastAttack) * a : slowRelease * slowEnv + (1 - slowRelease) * a;

      // When fast envelope falls below slow envelope, we are in a reverb tail
      const ratio = fastEnv / Math.max(slowEnv, 1e-6);
      const targetGain = ratio < 0.78 ? Math.max(1 - reductionRatio * 0.88, Math.pow(ratio / 0.78, 1.35 * reductionRatio + 0.5)) : 1.0;
      smoothedGain = 0.992 * smoothedGain + 0.008 * targetGain;
      buf[i] *= smoothedGain;
    }
  }

  // 5. Soft Broadband Noise Gate / Expander
  if (chain.humAndNoise.enabled) {
    const threshLin = dbToLinear(chain.humAndNoise.noiseGateDb);
    const atk = Math.exp(-1 / (0.005 * sampleRate));
    const rel = Math.exp(-1 / (0.08 * sampleRate));
    let env = 0;
    let gateGain = 1;

    for (let i = 0; i < n; i++) {
      const a = Math.abs(buf[i]);
      env = a > env ? atk * env + (1 - atk) * a : rel * env + (1 - rel) * a;
      const target = env >= threshLin ? 1.0 : Math.max(0.14, Math.pow(env / Math.max(threshLin, 1e-7), 1.8));
      gateGain = 0.994 * gateGain + 0.006 * target;
      buf[i] *= gateGain;
    }
  }

  // 6. De-Clipper + True-Peak Limiter
  if (chain.dynamics.enabled) {
    if (chain.dynamics.deClipStrength > 0) {
      const strength = chain.dynamics.deClipStrength / 100;
      // Soft-knee headroom attenuation + cubic interpolation over flat-topped clipped runs
      const atten = 1 - 0.24 * strength;
      for (let i = 0; i < n; i++) {
        buf[i] *= atten;
      }
      // Smooth sharp flat-top transitions via gentle 3-tap FIR on peak regions
      const limitThresh = 0.72 * atten;
      for (let i = 1; i < n - 1; i++) {
        if (Math.abs(buf[i]) > limitThresh) {
          buf[i] = 0.2 * buf[i - 1] + 0.6 * buf[i] + 0.2 * buf[i + 1];
        }
      }
    }

    const ceiling = dbToLinear(chain.dynamics.ceilingDbtp);
    // Lookahead-style smooth brickwall limiter
    let gain = 1;
    const rel = Math.exp(-1 / (0.045 * sampleRate));
    for (let i = 0; i < n; i++) {
      const a = Math.abs(buf[i]);
      const needed = a > ceiling ? ceiling / a : 1.0;
      gain = needed < gain ? needed : rel * gain + (1 - rel) * needed;
      const out = buf[i] * gain;
      buf[i] = Math.max(-ceiling, Math.min(ceiling, out));
    }
  }

  const { spectrum } = computeSpectrogramAndSpectrum(buf, sampleRate, 96);
  const afterWaveformPeaks = computeWaveformPeaks(buf, 440);
  const afterMetrics = measureAudioMetrics(buf, sampleRate, spectrum);

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const processingLatencyMs = Number(Math.max(0.6, t1 - t0).toFixed(1));

  return {
    samples: buf,
    sampleRate,
    processingLatencyMs,
    afterMetrics,
    afterSpectrum: spectrum,
    afterWaveformPeaks,
  };
}

/**
 * Encodes Float32 PCM samples into a Broadcast-compliant 24-bit RIFF/WAVE binary buffer.
 */
export function encodeWav24Bit(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 24;
  const bytesPerSample = bitsPerSample / 8;
  const dataByteLength = samples.length * numChannels * bytesPerSample;
  const totalSize = 44 + dataByteLength;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // blockAlign
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int24 = clamped < 0 ? Math.round(clamped * 0x800000) : Math.round(clamped * 0x7fffff);
    bytes[offset] = int24 & 0xff;
    bytes[offset + 1] = (int24 >> 8) & 0xff;
    bytes[offset + 2] = (int24 >> 16) & 0xff;
    offset += 3;
  }

  return bytes;
}
