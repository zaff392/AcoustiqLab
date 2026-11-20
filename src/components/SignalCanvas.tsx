import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { formatTimecode } from '../dsp/mediaProbe';
import { evaluateSurgicalEqCurve } from '../dsp/processor';
import type {
  DetectedArtifact,
  ForensicReport,
  ProcessingResult,
  SurgicalChainConfig,
} from '../dsp/types';

export type SignalViewMode = 'waveform' | 'spectrogram' | 'spectrum';

interface SignalCanvasProps {
  report: ForensicReport;
  processingResult: ProcessingResult | null;
  surgicalChain: SurgicalChainConfig;
  selectedArtifactId: string | null;
  listenMode: 'raw' | 'processed';
  onChangeListenMode: (mode: 'raw' | 'processed') => void;
  isPlaying: boolean;
  currentTimeSec: number;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onResetPlayhead: () => void;
}

function dbToColorRgb(db: number): [number, number, number] {
  // Calibrated dark-obsidian -> deep cobalt -> cyan -> telemetry amber ramp (-90 dB to -12 dB)
  const norm = Math.max(0, Math.min(1, (db + 90) / 76));
  if (norm < 0.35) {
    const t = norm / 0.35;
    return [
      Math.round(11 + t * 10),
      Math.round(14 + t * 28),
      Math.round(24 + t * 62),
    ];
  }
  if (norm < 0.7) {
    const t = (norm - 0.35) / 0.35;
    return [
      Math.round(21 + t * 15),
      Math.round(42 + t * 126),
      Math.round(86 + t * 105),
    ];
  }
  const t = (norm - 0.7) / 0.3;
  return [
    Math.round(36 + t * 214),
    Math.round(168 + t * 14),
    Math.round(191 - t * 175),
  ];
}

export function SignalCanvas({
  report,
  processingResult,
  surgicalChain,
  selectedArtifactId,
  listenMode,
  onChangeListenMode,
  isPlaying,
  currentTimeSec,
  onTogglePlay,
  onSeek,
  onResetPlayhead,
}: SignalCanvasProps) {
  const [viewMode, setViewMode] = useState<SignalViewMode>('waveform');
  const [probeText, setProbeText] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 880, height: 290 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100) {
        setCanvasSize({ width: Math.floor(rect.width), height: 290 });
      }
    };
    updateSize();
    const obs = new ResizeObserver(updateSize);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvasSize;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Background field
    ctx.fillStyle = '#0D1119';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 52;
    const padRight = 16;
    const padTop = 18;
    const padBottom = 28;
    const plotW = Math.max(40, width - padLeft - padRight);
    const plotH = Math.max(40, height - padTop - padBottom);

    const selectedArtifact: DetectedArtifact | undefined = report.artifacts.find(
      (a) => a.id === selectedArtifactId,
    );

    if (viewMode === 'waveform') {
      // Subtle horizontal dB grid
      ctx.strokeStyle = '#1B2332';
      ctx.lineWidth = 1;
      const gridRows = 4;
      for (let r = 0; r <= gridRows; r++) {
        const y = padTop + (r / gridRows) * plotH;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();
      }

      // Highlight detected artifact regions
      for (const art of report.artifacts) {
        const isSel = art.id === selectedArtifactId;
        for (const reg of art.regions) {
          const x0 = padLeft + (reg.startSec / Math.max(0.01, report.media.durationSec)) * plotW;
          const x1 = padLeft + (reg.endSec / Math.max(0.01, report.media.durationSec)) * plotW;
          ctx.fillStyle = isSel
            ? 'rgba(245, 158, 11, 0.16)'
            : art.severity === 'critique'
              ? 'rgba(239, 68, 68, 0.08)'
              : 'rgba(245, 158, 11, 0.06)';
          ctx.fillRect(x0, padTop, Math.max(2, x1 - x0), plotH);
          if (isSel) {
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
            ctx.strokeRect(x0, padTop, Math.max(2, x1 - x0), plotH);
          }
        }
      }

      // Draw raw waveform
      const rawPeaks = report.waveformPeaks;
      const buckets = rawPeaks.length / 2;
      const midY = padTop + plotH / 2;
      const halfH = plotH * 0.46;

      ctx.strokeStyle = listenMode === 'processed' && processingResult ? 'rgba(148, 163, 184, 0.32)' : '#F59E0B';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let b = 0; b < buckets; b++) {
        const x = padLeft + (b / buckets) * plotW;
        const minV = rawPeaks[b * 2];
        const maxV = rawPeaks[b * 2 + 1];
        ctx.moveTo(x, midY - maxV * halfH);
        ctx.lineTo(x, midY - minV * halfH);
      }
      ctx.stroke();

      // Overlay processed waveform when available
      if (processingResult) {
        const afterPeaks = processingResult.afterWaveformPeaks;
        const aBuckets = afterPeaks.length / 2;
        ctx.strokeStyle = listenMode === 'processed' ? '#06B6D4' : 'rgba(6, 182, 212, 0.42)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let b = 0; b < aBuckets; b++) {
          const x = padLeft + (b / aBuckets) * plotW;
          const minV = afterPeaks[b * 2];
          const maxV = afterPeaks[b * 2 + 1];
          ctx.moveTo(x, midY - maxV * halfH);
          ctx.lineTo(x, midY - minV * halfH);
        }
        ctx.stroke();
      }

      // Y-axis amplitude labels
      ctx.fillStyle = '#64748B';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('+0 dB', padLeft - 8, padTop + 8);
      ctx.fillText('-∞ dB', padLeft - 8, midY + 3);
      ctx.fillText('-0 dB', padLeft - 8, padTop + plotH - 2);
    } else if (viewMode === 'spectrogram') {
      const { frames, bins, magnitudesDb, maxFreqHz } = report.spectrogram;
      const cellW = plotW / frames;
      const cellH = plotH / bins;

      for (let f = 0; f < frames; f++) {
        const x = padLeft + f * cellW;
        for (let b = 0; b < bins; b++) {
          const db = magnitudesDb[f * bins + b];
          const [r, g, bl] = dbToColorRgb(db);
          ctx.fillStyle = `rgb(${r},${g},${bl})`;
          const y = padTop + plotH - (b + 1) * cellH;
          ctx.fillRect(x, y, Math.ceil(cellW), Math.ceil(cellH));
        }
      }

      // Draw surgical notch band line if metallic frequency detected or active
      const metallicFreq = surgicalChain.deMetallic.enabled
        ? surgicalChain.deMetallic.frequencyHz
        : report.metrics.dominantResonanceHz;
      if (metallicFreq && metallicFreq <= maxFreqHz) {
        const yFreq = padTop + plotH - (metallicFreq / maxFreqHz) * plotH;
        ctx.strokeStyle = surgicalChain.deMetallic.enabled ? '#06B6D4' : '#EF4444';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(padLeft, yFreq);
        ctx.lineTo(padLeft + plotW, yFreq);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#0B0E14';
        ctx.fillRect(padLeft + 8, yFreq - 16, 152, 14);
        ctx.fillStyle = surgicalChain.deMetallic.enabled ? '#22D3EE' : '#F87171';
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
          `${surgicalChain.deMetallic.enabled ? 'Notch actif' : 'Résonance'} ${metallicFreq} Hz`,
          padLeft + 12,
          yFreq - 5,
        );
      }

      // Y-axis frequency ticks
      ctx.fillStyle = '#64748B';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      const ticks = [0, 2000, 4000, 6000, 8000, 10000].filter((f) => f <= maxFreqHz + 200);
      for (const fHz of ticks) {
        const y = padTop + plotH - (fHz / maxFreqHz) * plotH;
        ctx.fillText(fHz >= 1000 ? `${(fHz / 1000).toFixed(0)} kHz` : `${fHz} Hz`, padLeft - 8, y + 3);
      }
    } else {
      // Spectrum & Surgical EQ Response view
      const { frequenciesHz, magnitudesDb } = report.spectrum;
      const maxFreq = frequenciesHz[frequenciesHz.length - 1] || 10000;
      const minDb = -95;
      const maxDb = -5;

      // Grid lines
      ctx.strokeStyle = '#1B2332';
      ctx.lineWidth = 1;
      for (let db = -90; db <= -15; db += 15) {
        const y = padTop + ((maxDb - db) / (maxDb - minDb)) * plotH;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();
        ctx.fillStyle = '#64748B';
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${db} dB`, padLeft - 8, y + 3);
      }

      const drawCurve = (vals: Float32Array, color: string, lineW: number, dash: number[] = []) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 1; i < frequenciesHz.length; i++) {
          const x = padLeft + (frequenciesHz[i] / maxFreq) * plotW;
          const clampedDb = Math.max(minDb, Math.min(maxDb, vals[i]));
          const y = padTop + ((maxDb - clampedDb) / (maxDb - minDb)) * plotH;
          if (i === 1) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };

      // Raw spectrum (amber)
      drawCurve(magnitudesDb, '#F59E0B', 1.6);

      // Processed spectrum (cyan)
      if (processingResult) {
        drawCurve(processingResult.afterSpectrum.magnitudesDb, '#06B6D4', 1.8);
      }

      // Surgical filter transfer curve (dashed white-slate relative to -35dB reference line)
      const eqResponse = evaluateSurgicalEqCurve(frequenciesHz, report.media.sampleRate, surgicalChain);
      const eqShifted = new Float32Array(eqResponse.length);
      for (let i = 0; i < eqResponse.length; i++) {
        eqShifted[i] = -32 + eqResponse[i];
      }
      drawCurve(eqShifted, '#E2E8F0', 1.3, [4, 3]);

      // Selected metallic artifact frequency callout
      if (selectedArtifact?.frequencyHz) {
        const x = padLeft + (selectedArtifact.frequencyHz / maxFreq) * plotW;
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.stroke();
      }

      // X-axis frequency labels
      ctx.fillStyle = '#64748B';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      for (let fHz = 1000; fHz <= maxFreq; fHz += 1000) {
        const x = padLeft + (fHz / maxFreq) * plotW;
        ctx.fillText(`${fHz / 1000}k`, x, height - 9);
      }
    }

    // X-axis timecode labels & playhead for time-domain modes
    if (viewMode !== 'spectrum') {
      ctx.fillStyle = '#64748B';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      const dur = Math.max(0.1, report.media.durationSec);
      for (let i = 0; i <= 5; i++) {
        const t = (i / 5) * dur;
        const x = padLeft + (i / 5) * plotW;
        ctx.fillText(formatTimecode(t), x, height - 9);
      }

      // Playhead vertical line
      const playX = padLeft + (currentTimeSec / dur) * plotW;
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playX, padTop);
      ctx.lineTo(playX, padTop + plotH);
      ctx.stroke();
    }

    // Crisp plot frame border
    ctx.strokeStyle = '#1E2636';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    ctx.restore();
  }, [
    canvasSize,
    viewMode,
    report,
    processingResult,
    surgicalChain,
    selectedArtifactId,
    listenMode,
    currentTimeSec,
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode === 'spectrum') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const padLeft = 52;
    const padRight = 16;
    const plotW = Math.max(40, rect.width - padLeft - padRight);
    const relX = e.clientX - rect.left - padLeft;
    if (relX >= 0 && relX <= plotW) {
      const targetSec = (relX / plotW) * report.media.durationSec;
      onSeek(targetSec);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const padLeft = 52;
    const padRight = 16;
    const padTop = 18;
    const padBottom = 28;
    const plotW = Math.max(40, rect.width - padLeft - padRight);
    const plotH = Math.max(40, rect.height - padTop - padBottom);
    const x = e.clientX - rect.left - padLeft;
    const y = e.clientY - rect.top - padTop;

    if (x < 0 || x > plotW || y < 0 || y > plotH) {
      setProbeText(null);
      return;
    }

    if (viewMode === 'waveform') {
      const t = (x / plotW) * report.media.durationSec;
      const normAmp = Math.abs(1 - (y / plotH) * 2);
      const db = normAmp > 0.001 ? (20 * Math.log10(normAmp)).toFixed(1) : '-∞';
      setProbeText(`t = ${formatTimecode(t)}  ·  niveau ≈ ${db} dBFS`);
    } else if (viewMode === 'spectrogram') {
      const t = (x / plotW) * report.spectrogram.durationSec;
      const freq = Math.round((1 - y / plotH) * report.spectrogram.maxFreqHz);
      const fIdx = Math.min(
        report.spectrogram.frames - 1,
        Math.floor((x / plotW) * report.spectrogram.frames),
      );
      const bIdx = Math.min(
        report.spectrogram.bins - 1,
        Math.floor((1 - y / plotH) * report.spectrogram.bins),
      );
      const db = report.spectrogram.magnitudesDb[fIdx * report.spectrogram.bins + bIdx];
      setProbeText(`t = ${formatTimecode(t)}  ·  f = ${freq} Hz  ·  ${db.toFixed(1)} dB`);
    } else {
      const maxFreq =
        report.spectrum.frequenciesHz[report.spectrum.frequenciesHz.length - 1] || 10000;
      const freq = Math.round((x / plotW) * maxFreq);
      const db = (-5 - (y / plotH) * 90).toFixed(1);
      setProbeText(`f = ${freq} Hz  ·  ${db} dB`);
    }
  };

  return (
    <section className="bg-[#121722] border border-[#1E2636] rounded-lg overflow-hidden">
      {/* Toolbar: Mode selector + Transport + A/B Switch */}
      <div className="px-4 py-3 border-b border-[#1E2636] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#0B0E14] border border-[#1E2636] rounded-md">
          {(
            [
              { id: 'waveform', label: "Forme d'onde" },
              { id: 'spectrogram', label: 'Spectrogramme' },
              { id: 'spectrum', label: 'Spectre & EQ' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setViewMode(m.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === m.id
                  ? 'bg-[#1E2636] text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Transport controls & timecode */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Mettre en pause la lecture' : 'Lancer la lecture audio'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{isPlaying ? 'Pause' : 'Écouter'}</span>
            </button>
            <button
              type="button"
              onClick={onResetPlayhead}
              aria-label="Revenir au début"
              className="p-1.5 text-slate-400 hover:text-slate-100 border border-[#1E2636] rounded-md transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <span className="font-mono text-xs text-slate-300 tabular-nums whitespace-nowrap">
            {formatTimecode(currentTimeSec)}{' '}
            <span className="text-slate-500">/ {formatTimecode(report.media.durationSec)}</span>
          </span>

          {/* A/B Audition Segmented Control */}
          <div
            role="group"
            aria-label="Comparaison audio A/B"
            className="flex items-center gap-1 p-1 bg-[#0B0E14] border border-[#1E2636] rounded-md"
          >
            <button
              type="button"
              onClick={() => onChangeListenMode('raw')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                listenMode === 'raw'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              A · Brut
            </button>
            <button
              type="button"
              onClick={() => onChangeListenMode('processed')}
              disabled={!processingResult}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                listenMode === 'processed'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              B · Traité
            </button>
          </div>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div ref={containerRef} className="relative w-full h-[290px] bg-[#0D1119]">
        <canvas
          ref={canvasRef}
          data-testid="signal-analyzer-canvas"
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setProbeText(null)}
          className="w-full h-full block cursor-crosshair"
        />

        {/* Legend & Crosshair Probe HUD */}
        <div className="pointer-events-none absolute top-2.5 right-4 flex items-center gap-4 text-[11px] font-mono">
          {probeText && (
            <span className="px-2 py-0.5 bg-[#0B0E14]/90 border border-[#1E2636] text-slate-200 rounded tabular-nums">
              {probeText}
            </span>
          )}
          {viewMode !== 'spectrogram' ? (
            <div className="flex items-center gap-3 px-2 py-0.5 bg-[#0B0E14]/85 border border-[#1E2636] rounded text-slate-400">
              <span className="text-amber-400">― Brut</span>
              {processingResult && <span className="text-cyan-400">― Traité</span>}
              {viewMode === 'spectrum' && <span className="text-slate-200">┄ Courbe EQ</span>}
            </div>
          ) : (
            <div className="px-2 py-0.5 bg-[#0B0E14]/85 border border-[#1E2636] rounded text-slate-400">
              -90 dB → -14 dB
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
