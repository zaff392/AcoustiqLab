import { useState } from 'react';
import { Check, Copy, Download, Film, Terminal } from 'lucide-react';
import {
  buildFastRemuxCommand,
  EXPORT_PROFILES,
  formatBytes,
  formatTimecode,
} from '../dsp/mediaProbe';
import { encodeWav24Bit } from '../dsp/processor';
import type { ExportProfileId, ForensicReport, ProcessingResult } from '../dsp/types';

interface ExportProViewProps {
  report: ForensicReport;
  rawSamples: Float32Array;
  processingResult: ProcessingResult | null;
  selectedProfile: ExportProfileId;
  onSelectProfile: (profile: ExportProfileId) => void;
}

export function ExportProView({
  report,
  rawSamples,
  processingResult,
  selectedProfile,
  onSelectProfile,
}: ExportProViewProps) {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [lastExportStats, setLastExportStats] = useState<{
    fileName: string;
    sizeBytes: number;
    latencyMs: number;
  } | null>(null);

  const activeProfile =
    EXPORT_PROFILES.find((p) => p.id === selectedProfile) ?? EXPORT_PROFILES[0];
  const remuxCommand = buildFastRemuxCommand(report.media, selectedProfile);
  const baseName = report.media.fileName.replace(/\.[^/.]+$/, '');

  const handleDownloadWav24 = () => {
    const t0 = performance.now();
    const targetSamples = processingResult ? processingResult.samples : rawSamples;
    const wavBytes = encodeWav24Bit(targetSamples, report.media.sampleRate);
    const elapsed = Number(Math.max(0.5, performance.now() - t0).toFixed(1));
    const fileName = `${baseName}_chirurgical_24bit.wav`;

    const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setLastExportStats({
      fileName,
      sizeBytes: wavBytes.byteLength,
      latencyMs: elapsed,
    });
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(remuxCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      setCopiedCmd(false);
    }
  };

  const handleDownloadPipelineScript = () => {
    const script = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `# Pipeline d'exportation rapide AcoustiqLab — Profil : ${activeProfile.label}`,
      `# Remuxage vidéo sans ré-encodage (-c:v copy) + piste audio restaurée 24-bit / 48 kHz`,
      '',
      remuxCommand,
      '',
    ].join('\n');
    const blob = new Blob([script], { type: 'text/x-shellscript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_remux_${selectedProfile}.sh`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Container & Codec Probe Summary */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-lg p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Exportation professionnelle & Pipeline ProRes / H.265
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Encodage PCM 24-bit immédiat dans le navigateur et remuxage vidéo sans perte (-c:v copy) pour une latence minimale.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadWav24}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Télécharger Master WAV 24-bit</span>
          </button>
        </div>

        {/* Source media specification strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-[#1E2636]">
          <div>
            <p className="text-xs text-slate-400">Source chargée</p>
            <p className="text-sm font-mono text-slate-100 truncate mt-0.5" title={report.media.fileName}>
              {report.media.fileName}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Conteneur & Vidéo</p>
            <p className="text-sm font-mono text-slate-100 mt-0.5">
              {report.media.videoCodec ?? report.media.container}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Échantillonnage</p>
            <p className="text-sm font-mono text-slate-100 tabular-nums mt-0.5">
              {(report.media.sampleRate / 1000).toFixed(1)} kHz · {report.media.bitDepth}-bit ·{' '}
              {formatTimecode(report.media.durationSec)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">État de la piste audio</p>
            <p className={`text-sm font-mono mt-0.5 ${processingResult ? 'text-cyan-400' : 'text-amber-300'}`}>
              {processingResult
                ? `Traitée (${processingResult.processingLatencyMs.toFixed(1)} ms)`
                : 'Signal brut (aucun filtre actif)'}
            </p>
          </div>
        </div>

        {lastExportStats && (
          <div className="px-4 py-2.5 bg-[#0B0E14] border border-emerald-500/30 rounded-md text-xs font-mono text-emerald-300 flex flex-wrap items-center justify-between gap-2">
            <span>
              ● Export WAV 24-bit généré : {lastExportStats.fileName} ({formatBytes(lastExportStats.sizeBytes)})
            </span>
            <span className="tabular-nums">Encodé en {lastExportStats.latencyMs.toFixed(1)} ms</span>
          </div>
        )}
      </section>

      {/* Format Profile Selector */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">
          Profil de livraison cible
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EXPORT_PROFILES.map((profile) => {
            const isSelected = profile.id === selectedProfile;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile.id)}
                className={`text-left p-5 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#171E2E] border-amber-500'
                    : 'bg-[#121722] border-[#1E2636] hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Film
                      className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-slate-100">{profile.label}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400 uppercase whitespace-nowrap">
                    .{profile.extension}
                  </span>
                </div>

                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {profile.description}
                </p>

                <div className="mt-3 pt-3 border-t border-[#1E2636] space-y-1 text-[11px] font-mono text-slate-300">
                  <p>Audio : {profile.audioCodec}</p>
                  <p className="text-cyan-400">Vitesse : {profile.estimatedSpeedMultiplier}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Zero-Transcode Remux Command & Script Export */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1E2636] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-100">
              Commande de remuxage rapide ({activeProfile.label})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCommand}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 border border-[#273244] hover:border-slate-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedCmd ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copier la commande</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadPipelineScript}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 border border-[#273244] hover:border-slate-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Télécharger script .sh</span>
            </button>
          </div>
        </div>

        <pre className="p-6 bg-[#0B0E14] text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
          <code>{remuxCommand}</code>
        </pre>
      </section>
    </div>
  );
}
