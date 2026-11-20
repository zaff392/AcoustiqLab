import type { MediaContainerInfo } from './types';

export interface StudioSamplePreset {
  id: string;
  label: string;
  shortDesc: string;
  media: MediaContainerInfo;
  injectEchoMs?: number;
  injectEchoGain?: number;
  injectReverbRt60?: number;
  injectMetallicHz?: number;
  injectMetallicGain?: number;
  injectHumHz?: 50 | 60;
  injectHumGain?: number;
  injectNoiseGain?: number;
  injectClipDrive?: number;
}

export const STUDIO_SAMPLE_PRESETS: StudioSamplePreset[] = [
  {
    id: 'interview_echo_reverb',
    label: 'Interview Plateau — Écho & Réverbération',
    shortDesc: 'Rush ProRes 422 HQ avec réflexion murale à 92 ms et réverbération de salle (RT60 élevé)',
    media: {
      fileName: 'interview_plateau_A014.mov',
      fileSizeBytes: 184_320_000,
      category: 'video',
      container: 'QuickTime MOV',
      videoCodec: 'Apple ProRes 422 HQ (apch)',
      audioCodec: 'PCM 24-bit',
      sampleRate: 48000,
      channels: 1,
      bitDepth: 24,
      durationSec: 5.0,
      frameRate: 25,
      proResCompatible: true,
      h265Compatible: true,
      sourcePresetId: 'interview_echo_reverb',
    },
    injectEchoMs: 92,
    injectEchoGain: 0.48,
    injectReverbRt60: 1.15,
    injectNoiseGain: 0.008,
  },
  {
    id: 'broadcast_metallic',
    label: 'Voix Broadcast — Son Métallique & Hum 50 Hz',
    shortDesc: 'Capture H.265/HEVC présentant une résonance métallique aiguë à 2840 Hz et ronflement secteur',
    media: {
      fileName: 'chronique_studio_4k_hevc.mp4',
      fileSizeBytes: 42_650_000,
      category: 'video',
      container: 'MP4 / ISO BMFF',
      videoCodec: 'H.265 / HEVC (hvc1)',
      audioCodec: 'AAC-LC',
      sampleRate: 48000,
      channels: 1,
      bitDepth: 24,
      durationSec: 5.0,
      frameRate: 50,
      proResCompatible: true,
      h265Compatible: true,
      sourcePresetId: 'broadcast_metallic',
    },
    injectMetallicHz: 2840,
    injectMetallicGain: 0.34,
    injectHumHz: 50,
    injectHumGain: 0.09,
    injectNoiseGain: 0.006,
  },
  {
    id: 'dialogue_clipping_full',
    label: 'Prise Extérieure — Écrêtage, Écho & Souffle',
    shortDesc: 'Audio brut WAV 24-bit saturé en crête avec slap-back écho 64 ms et bruit de fond',
    media: {
      fileName: 'dialogue_perche_T08.wav',
      fileSizeBytes: 1_440_044,
      category: 'audio',
      container: 'RIFF / WAV PCM',
      videoCodec: null,
      audioCodec: 'PCM 24-bit',
      sampleRate: 48000,
      channels: 1,
      bitDepth: 24,
      durationSec: 5.0,
      frameRate: null,
      proResCompatible: true,
      h265Compatible: true,
      sourcePresetId: 'dialogue_clipping_full',
    },
    injectEchoMs: 64,
    injectEchoGain: 0.42,
    injectNoiseGain: 0.024,
    injectClipDrive: 2.35,
  },
  {
    id: 'reference_clean',
    label: 'Master Référence — Voix Propre Broadcast',
    shortDesc: 'Signal de référence conforme EBU R128 sans artefact détectable',
    media: {
      fileName: 'master_reference_clean.wav',
      fileSizeBytes: 1_440_044,
      category: 'audio',
      container: 'RIFF / WAV PCM',
      videoCodec: null,
      audioCodec: 'PCM 24-bit',
      sampleRate: 48000,
      channels: 1,
      bitDepth: 24,
      durationSec: 5.0,
      frameRate: null,
      proResCompatible: true,
      h265Compatible: true,
      sourcePresetId: 'reference_clean',
    },
    injectNoiseGain: 0.0008,
  },
];

// Deterministic PRNG (Mulberry32) so analysis & tests are 100% reproducible
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthesizes a realistic human-voice-like cadence with clean syllabic pulses,
 * vowel formants, and silence gaps, then injects exact controlled acoustic artifacts
 * so DSP detectors and surgical processors can be audited deterministically.
 */
export function synthesizeStudioSample(preset: StudioSamplePreset): Float32Array {
  const sr = preset.media.sampleRate;
  const totalSamples = Math.floor(preset.media.durationSec * sr);
  const dry = new Float32Array(totalSamples);
  const rand = mulberry32(1337 + preset.id.length * 97);

  // Define realistic syllabic speech bursts across 5.0s with clean inter-syllable pauses
  const syllables: Array<{ start: number; dur: number; f0: number; amp: number }> = [
    { start: 0.18, dur: 0.24, f0: 138, amp: 0.44 },
    { start: 0.50, dur: 0.19, f0: 156, amp: 0.39 },
    { start: 0.80, dur: 0.28, f0: 132, amp: 0.46 },
    { start: 1.48, dur: 0.22, f0: 162, amp: 0.42 },
    { start: 1.80, dur: 0.30, f0: 144, amp: 0.48 },
    { start: 2.52, dur: 0.21, f0: 152, amp: 0.41 },
    { start: 2.86, dur: 0.27, f0: 129, amp: 0.45 },
    { start: 3.55, dur: 0.24, f0: 168, amp: 0.43 },
    { start: 3.92, dur: 0.26, f0: 136, amp: 0.40 },
  ];

  for (const syl of syllables) {
    const startIdx = Math.floor(syl.start * sr);
    const len = Math.floor(syl.dur * sr);
    for (let i = 0; i < len && startIdx + i < totalSamples; i++) {
      const u = i / len;
      // Smooth attack / sustain / fast release envelope
      const env =
        u < 0.12
          ? Math.sin((u / 0.12) * (Math.PI / 2))
          : u > 0.78
            ? Math.cos(((u - 0.78) / 0.22) * (Math.PI / 2))
            : 1.0;
      const t = i / sr;
      // Slight natural pitch inflection
      const f0 = syl.f0 * (1 + 0.04 * Math.sin(2 * Math.PI * 2.2 * t));
      // Warm voice harmonics (fundamental + formant-weighted harmonics up to 1.8 kHz)
      const sig =
        0.52 * Math.sin(2 * Math.PI * f0 * t) +
        0.34 * Math.sin(2 * Math.PI * f0 * 2 * t + 0.3) +
        0.22 * Math.sin(2 * Math.PI * f0 * 3 * t + 0.7) +
        0.14 * Math.sin(2 * Math.PI * f0 * 5 * t + 1.1) +
        0.08 * Math.sin(2 * Math.PI * f0 * 7 * t + 0.4);

      dry[startIdx + i] += sig * env * syl.amp;
    }
  }

  let working: Float32Array = new Float32Array(dry);

  // 1. Inject Metallic Modal Resonance (sharp high-Q ringing resonator + harmonic shimmer)
  if (preset.injectMetallicHz && preset.injectMetallicGain) {
    const freq = preset.injectMetallicHz;
    const gain = preset.injectMetallicGain;
    const omega = (2 * Math.PI * freq) / sr;
    const r = 0.9968; // High-Q metallic ring
    const a1 = -2 * r * Math.cos(omega);
    const a2 = r * r;
    const norm = (1 - r) * 1.45;
    let y1 = 0;
    let y2 = 0;

    // Secondary harmonic ring at 2 * freq if below Nyquist
    const omega2 = (2 * Math.PI * Math.min(freq * 1.5, sr * 0.42)) / sr;
    const r2 = 0.9955;
    const b1 = -2 * r2 * Math.cos(omega2);
    const b2 = r2 * r2;
    let z1 = 0;
    let z2 = 0;

    for (let i = 0; i < totalSamples; i++) {
      // Excite resonator with speech + faint excitation noise during active signal
      const envProbe = Math.abs(dry[i]);
      const excite = dry[i] + (envProbe > 0.02 ? (rand() * 2 - 1) * 0.14 : (rand() * 2 - 1) * 0.004);
      const y0 = norm * excite - a1 * y1 - a2 * y2;
      y2 = y1;
      y1 = y0;

      const z0 = (1 - r2) * excite - b1 * z1 - b2 * z2;
      z2 = z1;
      z1 = z0;

      // Combine dry voice with prominent narrowband metallic ringing
      working[i] += y0 * gain * 2.4 + z0 * gain * 0.75 + Math.sin(omega * i) * gain * 0.18 * (0.35 + envProbe * 2.2);
    }
  }

  // 2. Inject Multi-Tap Feedback Echo (exact delay tap with natural exponential decay across bounces)
  if (preset.injectEchoMs && preset.injectEchoGain) {
    const delaySamples = Math.round((preset.injectEchoMs / 1000) * sr);
    const echoGain = Math.min(0.75, preset.injectEchoGain);
    const echoed = new Float32Array(working);
    for (let i = delaySamples; i < totalSamples; i++) {
      // Recursive feedback echo produces realistic exponential multi-tap decay (tau, 2*tau, 3*tau...)
      echoed[i] = working[i] + echoed[i - delaySamples] * echoGain;
    }
    working = echoed;
  }

  // 3. Inject Diffuse Room Reverberation (multi-tap Schroeder comb network)
  if (preset.injectReverbRt60 && preset.injectReverbRt60 > 0.2) {
    const rt60 = preset.injectReverbRt60;
    const tapMs = [29.7, 37.1, 43.3, 53.9, 67.3, 83.1];
    const wet = new Float32Array(totalSamples);
    for (const ms of tapMs) {
      const delay = Math.round((ms / 1000) * sr);
      // Feedback gain g for target RT60: g = 10^(-3 * delaySec / RT60)
      const g = Math.min(0.86, Math.pow(10, (-3 * (ms / 1000)) / rt60));
      const comb = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        const delayed = i >= delay ? comb[i - delay] : 0;
        comb[i] = working[i] + delayed * g;
        wet[i] += (comb[i] - working[i]) / tapMs.length;
      }
    }
    for (let i = 0; i < totalSamples; i++) {
      working[i] = working[i] * 0.86 + wet[i] * 0.72;
    }
  }

  // 4. Inject 50/60 Hz Mains Hum + harmonics
  if (preset.injectHumHz && preset.injectHumGain) {
    const f = preset.injectHumHz;
    const g = preset.injectHumGain;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sr;
      working[i] +=
        g * Math.sin(2 * Math.PI * f * t) +
        g * 0.45 * Math.sin(2 * Math.PI * f * 2 * t + 0.5) +
        g * 0.25 * Math.sin(2 * Math.PI * f * 3 * t + 1.0);
    }
  }

  // 5. Inject Broadband Noise Floor
  if (preset.injectNoiseGain) {
    const ng = preset.injectNoiseGain;
    let prev = 0;
    for (let i = 0; i < totalSamples; i++) {
      const white = (rand() * 2 - 1) * ng;
      // Mild pinking filter
      prev = 0.75 * prev + 0.25 * white;
      working[i] += white * 0.55 + prev * 0.65;
    }
  }

  // 6. Inject Hard Digital Clipping if requested
  if (preset.injectClipDrive && preset.injectClipDrive > 1) {
    const drive = preset.injectClipDrive;
    for (let i = 0; i < totalSamples; i++) {
      const driven = working[i] * drive;
      working[i] = Math.max(-0.999, Math.min(0.999, driven));
    }
  } else {
    // Safety clamp for non-clipping presets
    for (let i = 0; i < totalSamples; i++) {
      if (working[i] > 0.96) working[i] = 0.96;
      if (working[i] < -0.96) working[i] = -0.96;
    }
  }

  return working;
}
