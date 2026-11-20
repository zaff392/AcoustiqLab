import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileAudio, X } from 'lucide-react';
import { DualBufferAudioPlayer } from './audio/webAudioPlayer';
import { ArtifactList } from './components/ArtifactList';
import { DeepSeekHarnessView } from './components/DeepSeekHarnessView';
import { ExportProView } from './components/ExportProView';
import { ReportView } from './components/ReportView';
import { SignalCanvas } from './components/SignalCanvas';
import { SurgicalRack } from './components/SurgicalRack';
import { TopBar, type WorkspaceTab } from './components/TopBar';
import { analyzeAudioBuffer, createDefaultSurgicalChain } from './dsp/analyzer';
import { formatBytes, formatTimecode, probeMediaHeader } from './dsp/mediaProbe';
import { processAudioBuffer } from './dsp/processor';
import { STUDIO_SAMPLE_PRESETS, synthesizeStudioSample } from './dsp/synthSamples';
import type {
  DetectedArtifact,
  ExportProfileId,
  ForensicReport,
  MediaContainerInfo,
  ProcessingResult,
  SurgicalChainConfig,
} from './dsp/types';

function isAnySurgicalModuleEnabled(chain: SurgicalChainConfig): boolean {
  return (
    chain.deEcho.enabled ||
    chain.deReverb.enabled ||
    chain.deMetallic.enabled ||
    chain.humAndNoise.enabled ||
    chain.dynamics.enabled
  );
}

export default function App() {
  const initialPreset = STUDIO_SAMPLE_PRESETS[0];
  const initialSamples = useMemo(() => synthesizeStudioSample(initialPreset), [initialPreset]);
  const initialReport = useMemo(
    () => analyzeAudioBuffer(initialSamples, initialPreset.media),
    [initialSamples, initialPreset],
  );

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('analyse');
  const [activePresetId, setActivePresetId] = useState<string | null>(initialPreset.id);
  const [rawSamples, setRawSamples] = useState<Float32Array>(initialSamples);
  const [report, setReport] = useState<ForensicReport>(initialReport);
  const [surgicalChain, setSurgicalChain] = useState<SurgicalChainConfig>(
    createDefaultSurgicalChain,
  );
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    initialReport.artifacts[0]?.id ?? null,
  );
  const [exportProfile, setExportProfile] = useState<ExportProfileId>('prores_422_hq');

  const [listenMode, setListenMode] = useState<'raw' | 'processed'>('raw');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    kind: 'error' | 'info';
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playerRef = useRef<DualBufferAudioPlayer | null>(null);

  // Recompute surgical DSP buffer whenever chain or source changes (sub-20ms)
  const processingResult: ProcessingResult | null = useMemo(() => {
    if (!isAnySurgicalModuleEnabled(surgicalChain)) return null;
    return processAudioBuffer(rawSamples, report.media.sampleRate, surgicalChain);
  }, [rawSamples, report.media.sampleRate, surgicalChain]);

  // Initialize & dispose Web Audio player
  useEffect(() => {
    const player = new DualBufferAudioPlayer();
    player.setOnTimeUpdate((timeSec, playing) => {
      setCurrentTimeSec(timeSec);
      setIsPlaying(playing);
    });
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  // Sync processed buffer into active player without disrupting playback
  useEffect(() => {
    if (!playerRef.current) return;
    if (processingResult) {
      playerRef.current.updateProcessedBuffer(
        processingResult.samples,
        report.media.sampleRate,
      );
    } else if (listenMode === 'processed') {
      setListenMode('raw');
      playerRef.current.setMode('raw');
    }
  }, [processingResult, report.media.sampleRate, listenMode]);

  const ensurePlayerLoaded = () => {
    if (!playerRef.current) return;
    playerRef.current.loadBuffers(
      rawSamples,
      processingResult?.samples ?? null,
      report.media.sampleRate,
    );
    playerRef.current.setMode(listenMode);
  };

  const handleTogglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
      return;
    }
    ensurePlayerLoaded();
    playerRef.current.play(currentTimeSec);
  };

  const handleSeek = (timeSec: number) => {
    setCurrentTimeSec(timeSec);
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.seek(timeSec);
    } else {
      ensurePlayerLoaded();
      playerRef.current.seek(timeSec);
    }
  };

  const handleResetPlayhead = () => {
    setCurrentTimeSec(0);
    if (playerRef.current) {
      playerRef.current.seek(0);
    }
  };

  const handleChangeListenMode = (mode: 'raw' | 'processed') => {
    if (mode === 'processed' && !processingResult) return;
    setListenMode(mode);
    playerRef.current?.setMode(mode);
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = STUDIO_SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    playerRef.current?.pause();
    setIsPlaying(false);
    setCurrentTimeSec(0);
    setUploadStatus(null);

    const samples = synthesizeStudioSample(preset);
    const nextReport = analyzeAudioBuffer(samples, preset.media);
    setActivePresetId(preset.id);
    setRawSamples(samples);
    setReport(nextReport);
    setSurgicalChain(createDefaultSurgicalChain());
    setSelectedArtifactId(nextReport.artifacts[0]?.id ?? null);
    setListenMode('raw');
    if (preset.media.videoCodec?.includes('H.265')) {
      setExportProfile('h265_hevc_main10');
    } else if (preset.media.videoCodec?.includes('ProRes')) {
      setExportProfile('prores_422_hq');
    } else {
      setExportProfile('wav_24_48');
    }
  };

  const handleAutoCalibrate = () => {
    setSurgicalChain(structuredClone(report.recommendedChain));
    setListenMode('processed');
    playerRef.current?.setMode('processed');
  };

  const handleResetChain = () => {
    setSurgicalChain(createDefaultSurgicalChain());
    setListenMode('raw');
    playerRef.current?.setMode('raw');
  };

  const handleApplySingleFix = (artifact: DetectedArtifact) => {
    const mod = artifact.prescription.module;
    const recMod = report.recommendedChain[mod];
    setSurgicalChain((prev) => ({
      ...prev,
      [mod]: { ...recMod, enabled: true },
    }));
    setSelectedArtifactId(artifact.id);
    setListenMode('processed');
    playerRef.current?.setMode('processed');
  };

  const handleFileIngest = async (file: File) => {
    setUploadStatus(null);
    playerRef.current?.pause();
    setIsPlaying(false);
    setCurrentTimeSec(0);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const headerSlice = new Uint8Array(arrayBuffer.slice(0, Math.min(arrayBuffer.byteLength, 262144)));
      const probe = probeMediaHeader(file.name, headerSlice);

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const decodeCtx = new AudioCtx();
      try {
        // decodeAudioData detaches its input buffer in Chromium, so pass a copy
        const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
        // Downmix to mono float32 for forensic precision analysis (cap at 45s for low-latency in-browser DSP)
        const maxSamples = Math.min(decoded.length, decoded.sampleRate * 45);
        const mono = new Float32Array(maxSamples);
        const chCount = decoded.numberOfChannels;
        for (let c = 0; c < chCount; c++) {
          const chData = decoded.getChannelData(c);
          for (let i = 0; i < maxSamples; i++) {
            mono[i] += chData[i] / chCount;
          }
        }

        const mediaInfo: MediaContainerInfo = {
          fileName: file.name,
          fileSizeBytes: file.size,
          category: probe.category,
          container: probe.container,
          videoCodec: probe.videoCodec,
          audioCodec: probe.audioCodec,
          sampleRate: decoded.sampleRate,
          channels: chCount,
          bitDepth: probe.detectedBitDepth,
          durationSec: maxSamples / decoded.sampleRate,
          frameRate: probe.category === 'video' ? 25 : null,
          proResCompatible: probe.proResCompatible,
          h265Compatible: probe.h265Compatible,
        };

        const nextReport = analyzeAudioBuffer(mono, mediaInfo);
        setActivePresetId(null);
        setRawSamples(mono);
        setReport(nextReport);
        setSurgicalChain(createDefaultSurgicalChain());
        setSelectedArtifactId(nextReport.artifacts[0]?.id ?? null);
        setListenMode('raw');
        setActiveTab('analyse');

        if (probe.videoCodec?.includes('ProRes')) {
          setExportProfile('prores_422_hq');
        } else if (probe.videoCodec?.includes('H.265')) {
          setExportProfile('h265_hevc_main10');
        } else {
          setExportProfile('wav_24_48');
        }
      } catch {
        setUploadStatus({
          kind: 'error',
          message: `Conteneur détecté (${probe.container}${probe.videoCodec ? ` / ${probe.videoCodec}` : ''}), mais la piste audio de "${file.name}" n’est pas décodable directement par ce navigateur. Utilisez un WAV/FLAC/MP4 ou exécutez le plugin DeepSeek Harness en natif pour les flux ProRes/HEVC bruts.`,
        });
      } finally {
        void decodeCtx.close();
      }
    } catch {
      setUploadStatus({
        kind: 'error',
        message: `Impossible de lire le fichier "${file.name}". Vérifiez les permissions de lecture.`,
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileIngest(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileIngest(file);
    }
  };

  const displayMetrics =
    listenMode === 'processed' && processingResult ? processingResult.afterMetrics : report.metrics;

  return (
    <div
      className="min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingFile(false);
      }}
      onDrop={handleDrop}
    >
      {/* Hidden native file input supporting audio & ProRes/H.265 video containers */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*,.wav,.flac,.aiff,.mov,.mp4,.mkv,.m4a,.webm"
        onChange={handleFileInputChange}
        className="hidden"
        aria-label="Charger un fichier audio ou vidéo"
      />

      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onTriggerUpload={() => fileInputRef.current?.click()}
      />

      {/* Drag & drop overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-[#0B0E14]/90 border-2 border-dashed border-amber-500 flex items-center justify-center p-6">
          <div className="text-center space-y-2">
            <FileAudio className="w-10 h-10 text-amber-400 mx-auto" aria-hidden="true" />
            <p className="text-lg font-semibold text-slate-100">
              Déposez votre fichier audio ou vidéo (WAV, FLAC, ProRes .mov, H.265 .mp4)
            </p>
            <p className="text-xs text-slate-400">
              Analyse forensique immédiate à faible latence
            </p>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 md:px-6 py-5 space-y-5">
        {uploadStatus && (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 px-4 py-3 bg-[#171B26] border border-amber-500/40 rounded-lg text-xs text-amber-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">{uploadStatus.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setUploadStatus(null)}
              aria-label="Fermer la notification"
              className="text-slate-400 hover:text-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {activeTab === 'analyse' && (
          <div className="space-y-5">
            {/* Compact Media Metadata & Acoustic Measurements Strip */}
            <section
              aria-label="Synthèse acoustique du média actif"
              className="bg-[#121722] border border-[#1E2636] rounded-lg px-5 py-4 space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <h1 className="text-lg font-bold tracking-tight text-slate-100 truncate">
                    {report.media.fileName}
                  </h1>
                  <p className="text-xs font-mono text-slate-400 tabular-nums">
                    {report.media.container}
                    <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                    {report.media.videoCodec ?? 'Audio brut'}
                    <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                    {(report.media.sampleRate / 1000).toFixed(1)} kHz / {report.media.bitDepth}-bit
                    <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                    {formatBytes(report.media.fileSizeBytes)}
                    <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                    Analyse {report.analysisLatencyMs.toFixed(1)} ms
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                  <span
                    className={
                      report.complianceStatus === 'conforme'
                        ? 'text-emerald-400'
                        : report.complianceStatus === 'critique'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                    }
                  >
                    {report.complianceStatus === 'conforme'
                      ? '● Conforme EBU R128'
                      : report.complianceStatus === 'critique'
                        ? `✖ ${report.artifacts.length} artefacts critiques`
                        : `▲ ${report.artifacts.length} corrections recommandées`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('rapport')}
                    className="text-slate-300 hover:text-amber-300 underline underline-offset-4 cursor-pointer whitespace-nowrap"
                  >
                    Voir le rapport complet
                  </button>
                </div>
              </div>

              {/* 5 Calibrated Acoustic Readouts */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-3 border-t border-[#1E2636]">
                <div>
                  <p className="text-[11px] text-slate-400">Loudness / True Peak</p>
                  <p className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-100">
                    {displayMetrics.integratedLufs.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-400">LUFS</span>
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    Crête {displayMetrics.truePeakDbtp.toFixed(1)} dBTP
                  </p>
                </div>

                <div>
                  <p className="text-[11px] text-slate-400">Réverbération RT60</p>
                  <p className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-100">
                    {displayMetrics.estimatedRt60Sec.toFixed(2)}{' '}
                    <span className="text-xs font-normal text-slate-400">s</span>
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    Clarté C50 : {displayMetrics.clarityC50Db.toFixed(1)} dB
                  </p>
                </div>

                <div>
                  <p className="text-[11px] text-slate-400">Écho (Délai · Décroissance)</p>
                  <p className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-100">
                    {displayMetrics.echoDetected && displayMetrics.echoDelayMs !== null
                      ? `${displayMetrics.echoDelayMs.toFixed(1)}`
                      : 'Absent'}{' '}
                    <span className="text-xs font-normal text-slate-400">
                      {displayMetrics.echoDetected && displayMetrics.echoDelayMs !== null ? 'ms' : ''}
                    </span>
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {displayMetrics.echoDetected && displayMetrics.echoDecayTimeMs !== null
                      ? `Décr. ${displayMetrics.echoDecayTimeMs} ms · ${displayMetrics.echoAttenuationDb?.toFixed(1) ?? '0'} dB`
                      : `Corrélation ${displayMetrics.echoStrengthPct}%`}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] text-slate-400">Résonance métallique</p>
                  <p className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-100">
                    {displayMetrics.dominantResonanceHz !== null
                      ? displayMetrics.dominantResonanceHz
                      : 'Aucune'}{' '}
                    <span className="text-xs font-normal text-slate-400">
                      {displayMetrics.dominantResonanceHz !== null ? 'Hz' : ''}
                    </span>
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    Saillance +{displayMetrics.resonanceProminenceDb.toFixed(1)} dB
                  </p>
                </div>

                <div>
                  <p className="text-[11px] text-slate-400">Pureté spectrale</p>
                  <p
                    className={`mt-1 font-mono tabular-nums text-lg font-semibold ${
                      listenMode === 'processed' && processingResult
                        ? 'text-cyan-400'
                        : 'text-slate-100'
                    }`}
                  >
                    {displayMetrics.spectralPurityPct}{' '}
                    <span className="text-xs font-normal text-slate-400">%</span>
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    Bruit {displayMetrics.noiseFloorDb.toFixed(1)} dBFS
                  </p>
                </div>
              </div>
            </section>

            {/* Asymmetric Split Console: Left Surgical Rack + Right Signal Stage & Artifact Diagnostics */}
            <div className="grid grid-cols-1 lg:grid-cols-[330px_1fr] gap-5 items-start">
              <SurgicalRack
                activePresetId={activePresetId}
                loadedFileName={report.media.fileName}
                onSelectPreset={handleSelectPreset}
                chain={surgicalChain}
                onChangeChain={(next) => {
                  setSurgicalChain(next);
                  if (isAnySurgicalModuleEnabled(next)) {
                    setListenMode('processed');
                    playerRef.current?.setMode('processed');
                  }
                }}
                onAutoCalibrate={handleAutoCalibrate}
                onResetChain={handleResetChain}
                hasRecommendedFixes={report.artifacts.length > 0}
                processingLatencyMs={processingResult?.processingLatencyMs ?? null}
              />

              <div className="space-y-5 min-w-0">
                <SignalCanvas
                  report={report}
                  processingResult={processingResult}
                  surgicalChain={surgicalChain}
                  selectedArtifactId={selectedArtifactId}
                  listenMode={listenMode}
                  onChangeListenMode={handleChangeListenMode}
                  isPlaying={isPlaying}
                  currentTimeSec={currentTimeSec}
                  onTogglePlay={handleTogglePlay}
                  onSeek={handleSeek}
                  onResetPlayhead={handleResetPlayhead}
                />

                <ArtifactList
                  artifacts={report.artifacts}
                  selectedArtifactId={selectedArtifactId}
                  surgicalChain={surgicalChain}
                  onSelectArtifact={setSelectedArtifactId}
                  onJumpToTime={(sec) => {
                    handleSeek(sec);
                    if (!isPlaying) {
                      ensurePlayerLoaded();
                      playerRef.current?.play(sec);
                    }
                  }}
                  onApplySingleFix={handleApplySingleFix}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rapport' && (
          <ReportView
            report={report}
            surgicalChain={surgicalChain}
            processingResult={processingResult}
            onApplyAllFixes={() => {
              handleAutoCalibrate();
            }}
          />
        )}

        {activeTab === 'export' && (
          <ExportProView
            report={report}
            rawSamples={rawSamples}
            processingResult={processingResult}
            selectedProfile={exportProfile}
            onSelectProfile={setExportProfile}
          />
        )}

        {activeTab === 'harness' && (
          <DeepSeekHarnessView
            report={report}
            surgicalChain={surgicalChain}
            processingResult={processingResult}
            exportProfile={exportProfile}
          />
        )}
      </main>
    </div>
  );
}
