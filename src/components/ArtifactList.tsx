import { Check, Play, Wrench } from 'lucide-react';
import { formatTimecode } from '../dsp/mediaProbe';
import type { DetectedArtifact, SurgicalChainConfig } from '../dsp/types';

interface ArtifactListProps {
  artifacts: DetectedArtifact[];
  selectedArtifactId: string | null;
  surgicalChain: SurgicalChainConfig;
  onSelectArtifact: (artifactId: string) => void;
  onJumpToTime: (timeSec: number) => void;
  onApplySingleFix: (artifact: DetectedArtifact) => void;
}

function getSeverityDisplay(severity: DetectedArtifact['severity']): {
  label: string;
  className: string;
} {
  if (severity === 'critique') {
    return { label: '✖ Critique', className: 'text-rose-400' };
  }
  if (severity === 'modere') {
    return { label: '▲ Modéré', className: 'text-amber-400' };
  }
  return { label: '● Faible', className: 'text-slate-300' };
}

export function ArtifactList({
  artifacts,
  selectedArtifactId,
  surgicalChain,
  onSelectArtifact,
  onJumpToTime,
  onApplySingleFix,
}: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <section
        aria-label="Artefacts détectés"
        className="bg-[#121722] border border-[#1E2636] rounded-lg p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Diagnostic des artefacts
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Aucun écho, réverbération excessive, résonance métallique, écrêtage ou souffle critique détecté sur ce signal.
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-400 whitespace-nowrap">
            ● Signal conforme
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Artefacts détectés"
      className="bg-[#121722] border border-[#1E2636] rounded-lg overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[#1E2636] flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-100">
          Artefacts détectés et prescriptions chirurgicales
        </h2>
        <span className="text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap">
          {artifacts.length} anomalie{artifacts.length > 1 ? 's' : ''} relevée{artifacts.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="divide-y divide-[#1E2636]">
        {artifacts.map((art) => {
          const isSelected = art.id === selectedArtifactId;
          const sev = getSeverityDisplay(art.severity);
          const moduleActive = surgicalChain[art.prescription.module].enabled;
          const firstRegion = art.regions[0];

          return (
            <div
              key={art.id}
              className={`p-4 transition-colors ${
                isSelected ? 'bg-[#171E2E]' : 'hover:bg-[#151B28]'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono">
                    <span className={sev.className}>{sev.label}</span>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className="text-slate-400 tabular-nums">Confiance {art.confidence}%</span>
                    {art.frequencyHz !== undefined && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-300 tabular-nums">{art.frequencyHz} Hz</span>
                      </>
                    )}
                    {art.delayMs !== undefined && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-300 tabular-nums">
                          Délai {art.delayMs.toFixed(1)} ms
                        </span>
                      </>
                    )}
                    {art.echoDecayTimeMs !== undefined && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-amber-300 tabular-nums">
                          Décroissance {art.echoDecayTimeMs} ms
                        </span>
                      </>
                    )}
                    {art.echoAttenuationDb !== undefined && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-400 tabular-nums">
                          {art.echoAttenuationDb.toFixed(1)} dB/rebond
                        </span>
                      </>
                    )}
                    {art.rt60Sec !== undefined && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-300 tabular-nums">RT60 {art.rt60Sec.toFixed(2)} s</span>
                      </>
                    )}
                    {firstRegion && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-400 tabular-nums">
                          {formatTimecode(firstRegion.startSec)} – {formatTimecode(firstRegion.endSec)}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectArtifact(art.id)}
                    className="text-left text-sm font-semibold text-slate-100 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    {art.title}
                  </button>

                  <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                    {art.diagnosis}
                  </p>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    <span className="text-slate-200 font-medium">Recommandation :</span>{' '}
                    {art.prescription.summary} —{' '}
                    <span className="text-cyan-400">{art.prescription.expectedImprovement}</span>
                  </p>
                </div>

                {/* Row actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {firstRegion && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectArtifact(art.id);
                        onJumpToTime(firstRegion.startSec);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 border border-[#273244] hover:border-slate-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Play className="w-3 h-3" aria-hidden="true" />
                      <span>Écouter</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onApplySingleFix(art)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      moduleActive
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/25'
                        : 'bg-[#1E2636] text-slate-100 hover:bg-amber-500 hover:text-slate-950'
                    }`}
                  >
                    {moduleActive ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Correction active</span>
                      </>
                    ) : (
                      <>
                        <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Corriger</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
