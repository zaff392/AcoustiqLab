export type ArtifactKind =
  | 'echo'
  | 'reverb'
  | 'metallic'
  | 'clipping'
  | 'hum'
  | 'noise';

export type ArtifactSeverity = 'critique' | 'modere' | 'faible';

export type MediaCategory = 'audio' | 'video';

export interface EchoTap {
  tapIndex: number;
  delayMs: number;
  attenuationDb: number;
  correlation: number;
}

export interface MediaContainerInfo {
  fileName: string;
  fileSizeBytes: number;
  category: MediaCategory;
  container: string;
  videoCodec: string | null;
  audioCodec: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  durationSec: number;
  frameRate: number | null;
  proResCompatible: boolean;
  h265Compatible: boolean;
  sourcePresetId?: string;
}

export interface TimeRegion {
  startSec: number;
  endSec: number;
}

export interface SurgicalPrescription {
  module: keyof SurgicalChainConfig;
  summary: string;
  parameters: Record<string, number | boolean | string>;
  expectedImprovement: string;
}

export interface DetectedArtifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  severity: ArtifactSeverity;
  confidence: number; // 0-100
  frequencyHz?: number;
  delayMs?: number;
  echoDecayTimeMs?: number;
  echoAttenuationDb?: number;
  echoTaps?: EchoTap[];
  rt60Sec?: number;
  levelDb?: number;
  qFactor?: number;
  regions: TimeRegion[];
  diagnosis: string;
  acousticCause: string;
  prescription: SurgicalPrescription;
}

export interface AudioMetrics {
  integratedLufs: number;
  truePeakDbtp: number;
  rmsDb: number;
  noiseFloorDb: number;
  crestFactorDb: number;
  estimatedRt60Sec: number;
  clarityC50Db: number;
  spectralPurityPct: number;
  clippedSamples: number;
  dominantResonanceHz: number | null;
  resonanceProminenceDb: number;
  echoDetected: boolean;
  echoStrengthPct: number;
  echoDelayMs: number | null;
  echoDecayTimeMs: number | null;
  echoAttenuationDb: number | null;
  echoTaps: EchoTap[];
}

export interface SpectrogramData {
  frames: number;
  bins: number;
  sampleRate: number;
  durationSec: number;
  maxFreqHz: number;
  magnitudesDb: Float32Array; // frames * bins row-major (frame * bins + bin)
}

export interface SpectrumCurve {
  frequenciesHz: Float32Array;
  magnitudesDb: Float32Array;
}

export interface ForensicReport {
  id: string;
  generatedAtIso: string;
  analysisLatencyMs: number;
  complianceStatus: 'conforme' | 'correction_requise' | 'critique';
  complianceStandard: string;
  executiveSummary: string;
  media: MediaContainerInfo;
  metrics: AudioMetrics;
  artifacts: DetectedArtifact[];
  recommendedChain: SurgicalChainConfig;
  spectrogram: SpectrogramData;
  spectrum: SpectrumCurve;
  waveformPeaks: Float32Array; // 2 * bucketCount (min, max interleaved)
}

export interface SurgicalChainConfig {
  deEcho: {
    enabled: boolean;
    delayMs: number;
    strength: number; // 0..100
  };
  deReverb: {
    enabled: boolean;
    reduction: number; // 0..100
    releaseMs: number; // 40..400
  };
  deMetallic: {
    enabled: boolean;
    frequencyHz: number; // 600..9000
    qFactor: number; // 2..20
    gainDb: number; // -24..0
    harmonicNotch: boolean;
  };
  humAndNoise: {
    enabled: boolean;
    highPassHz: number; // 20..180
    humFreqHz: 50 | 60;
    humCutDb: number; // -30..0
    noiseGateDb: number; // -75..-25
  };
  dynamics: {
    enabled: boolean;
    deClipStrength: number; // 0..100
    ceilingDbtp: number; // -3..-0.1
    targetLufs: number; // -24..-12
  };
}

export type ExportProfileId =
  | 'wav_24_48'
  | 'prores_422_hq'
  | 'prores_4444'
  | 'h265_hevc_main10';

export interface ExportProfile {
  id: ExportProfileId;
  label: string;
  extension: string;
  container: string;
  videoCodec: string | null;
  audioCodec: string;
  sampleRate: number;
  bitDepth: number;
  estimatedSpeedMultiplier: string;
  description: string;
}

export interface ProcessingResult {
  samples: Float32Array;
  sampleRate: number;
  processingLatencyMs: number;
  afterMetrics: AudioMetrics;
  afterSpectrum: SpectrumCurve;
  afterWaveformPeaks: Float32Array;
}
