import { RotateCcw, Sliders, Sparkles } from 'lucide-react';
import { STUDIO_SAMPLE_PRESETS } from '../dsp/synthSamples';
import type { SurgicalChainConfig } from '../dsp/types';

interface SurgicalRackProps {
  activePresetId: string | null;
  loadedFileName: string;
  onSelectPreset: (presetId: string) => void;
  chain: SurgicalChainConfig;
  onChangeChain: (next: SurgicalChainConfig) => void;
  onAutoCalibrate: () => void;
  onResetChain: () => void;
  hasRecommendedFixes: boolean;
  processingLatencyMs: number | null;
}

export function SurgicalRack({
  activePresetId,
  loadedFileName,
  onSelectPreset,
  chain,
  onChangeChain,
  onAutoCalibrate,
  onResetChain,
  hasRecommendedFixes,
  processingLatencyMs,
}: SurgicalRackProps) {
  const activeCount = [
    chain.deEcho.enabled,
    chain.deReverb.enabled,
    chain.deMetallic.enabled,
    chain.humAndNoise.enabled,
    chain.dynamics.enabled,
  ].filter(Boolean).length;

  return (
    <aside
      aria-label="Chaîne de post-traitement chirurgical"
      className="bg-[#121722] border border-[#1E2636] rounded-lg flex flex-col divide-y divide-[#1E2636]"
    >
      {/* Source preset selector */}
      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <label htmlFor="studio-sample-select" className="text-xs font-semibold text-slate-200">
            Source de démonstration
          </label>
          <span className="text-[11px] font-mono text-slate-400 truncate max-w-[160px]" title={loadedFileName}>
            {loadedFileName}
          </span>
        </div>
        <select
          id="studio-sample-select"
          value={activePresetId ?? 'custom'}
          onChange={(e) => {
            if (e.target.value !== 'custom') {
              onSelectPreset(e.target.value);
            }
          }}
          className="w-full bg-[#0B0E14] border border-[#1E2636] rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
        >
          {!activePresetId && <option value="custom">Fichier local : {loadedFileName}</option>}
          {STUDIO_SAMPLE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Rack Header + 1-click Auto-Calibrate */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-100">Post-traitement chirurgical</h2>
          </div>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {activeCount}/5 actifs
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAutoCalibrate}
            disabled={!hasRecommendedFixes}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Appliquer toutes les corrections</span>
          </button>
          <button
            type="button"
            onClick={onResetChain}
            aria-label="Réinitialiser la chaîne DSP"
            className="p-2 text-slate-400 hover:text-slate-100 border border-[#1E2636] hover:border-slate-600 rounded-md transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {processingLatencyMs !== null && (
          <p className="text-[11px] font-mono text-slate-400 tabular-nums">
            Latence passe DSP : <span className="text-cyan-400">{processingLatencyMs.toFixed(1)} ms</span>
          </p>
        )}
      </div>

      {/* Module 1: Anti-Écho */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="toggle-deecho" className="text-xs font-semibold text-slate-200 cursor-pointer">
            1. Anti-Écho (Peigne inverse)
          </label>
          <input
            id="toggle-deecho"
            type="checkbox"
            checked={chain.deEcho.enabled}
            onChange={(e) =>
              onChangeChain({
                ...chain,
                deEcho: { ...chain.deEcho, enabled: e.target.checked },
              })
            }
            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
          />
        </div>
        <div className={`space-y-2.5 ${chain.deEcho.enabled ? 'opacity-100' : 'opacity-45'}`}>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <label htmlFor="slider-echo-delay">Délai de réflexion</label>
              <span className="font-mono text-slate-200 tabular-nums">{chain.deEcho.delayMs} ms</span>
            </div>
            <input
              id="slider-echo-delay"
              type="range"
              min={20}
              max={250}
              step={1}
              value={chain.deEcho.delayMs}
              onChange={(e) =>
                onChangeChain({
                  ...chain,
                  deEcho: { ...chain.deEcho, enabled: true, delayMs: Number(e.target.value) },
                })
              }
              className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
            />
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <label htmlFor="slider-echo-strength">Atténuation</label>
              <span className="font-mono text-slate-200 tabular-nums">{chain.deEcho.strength} %</span>
            </div>
            <input
              id="slider-echo-strength"
              type="range"
              min={0}
              max={95}
              step={1}
              value={chain.deEcho.strength}
              onChange={(e) =>
                onChangeChain({
                  ...chain,
                  deEcho: { ...chain.deEcho, enabled: true, strength: Number(e.target.value) },
                })
              }
              className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Module 2: Dé-Réverbération */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="toggle-dereverb" className="text-xs font-semibold text-slate-200 cursor-pointer">
            2. Dé-Réverbération adaptative
          </label>
          <input
            id="toggle-dereverb"
            type="checkbox"
            checked={chain.deReverb.enabled}
            onChange={(e) =>
              onChangeChain({
                ...chain,
                deReverb: { ...chain.deReverb, enabled: e.target.checked },
              })
            }
            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
          />
        </div>
        <div className={`space-y-2.5 ${chain.deReverb.enabled ? 'opacity-100' : 'opacity-45'}`}>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <label htmlFor="slider-reverb-red">Réduction de traîne</label>
              <span className="font-mono text-slate-200 tabular-nums">{chain.deReverb.reduction} %</span>
            </div>
            <input
              id="slider-reverb-red"
              type="range"
              min={0}
              max={95}
              step={1}
              value={chain.deReverb.reduction}
              onChange={(e) =>
                onChangeChain({
                  ...chain,
                  deReverb: { ...chain.deReverb, enabled: true, reduction: Number(e.target.value) },
                })
              }
              className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
            />
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <label htmlFor="slider-reverb-rel">Relâchement</label>
              <span className="font-mono text-slate-200 tabular-nums">{chain.deReverb.releaseMs} ms</span>
            </div>
            <input
              id="slider-reverb-rel"
              type="range"
              min={40}
              max={360}
              step={5}
              value={chain.deReverb.releaseMs}
              onChange={(e) =>
                onChangeChain({
                  ...chain,
                  deReverb: { ...chain.deReverb, enabled: true, releaseMs: Number(e.target.value) },
                })
              }
              className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Module 3: Dé-Métallisation */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="toggle-demetallic" className="text-xs font-semibold text-slate-200 cursor-pointer">
            3. Dé-Métallisation (Notch Q)
          </label>
          <input
            id="toggle-demetallic"
            type="checkbox"
            checked={chain.deMetallic.enabled}
            onChange={(e) =>
              onChangeChain({
                ...chain,
                deMetallic: { ...chain.deMetallic, enabled: e.target.checked },
              })
            }
            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
          />
        </div>
        <div className={`space-y-2.5 ${chain.deMetallic.enabled ? 'opacity-100' : 'opacity-45'}`}>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <label htmlFor="slider-metal-freq">Fréquence modale</label>
              <span className="font-mono text-slate-200 tabular-nums">{chain.deMetallic.frequencyHz} Hz</span>
            </div>
            <input
              id="slider-metal-freq"
              type="range"
              min={800}
              max={8000}
              step={20}
              value={chain.deMetallic.frequencyHz}
              onChange={(e) =>
                onChangeChain({
                  ...chain,
                  deMetallic: { ...chain.deMetallic, enabled: true, frequencyHz: Number(e.target.value) },
                })
              }
              className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <label htmlFor="slider-metal-q">Facteur Q</label>
                <span className="font-mono text-slate-200 tabular-nums">{chain.deMetallic.qFactor.toFixed(1)}</span>
              </div>
              <input
                id="slider-metal-q"
                type="range"
                min={2}
                max={18}
                step={0.5}
                value={chain.deMetallic.qFactor}
                onChange={(e) =>
                  onChangeChain({
                    ...chain,
                    deMetallic: { ...chain.deMetallic, enabled: true, qFactor: Number(e.target.value) },
                  })
                }
                className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <label htmlFor="slider-metal-gain">Coupure</label>
                <span className="font-mono text-slate-200 tabular-nums">{chain.deMetallic.gainDb} dB</span>
              </div>
              <input
                id="slider-metal-gain"
                type="range"
                min={-24}
                max={0}
                step={1}
                value={chain.deMetallic.gainDb}
                onChange={(e) =>
                  onChangeChain({
                    ...chain,
                    deMetallic: { ...chain.deMetallic, enabled: true, gainDb: Number(e.target.value) },
                  })
                }
                className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Module 4: Secteur & Souffle */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="toggle-hum" className="text-xs font-semibold text-slate-200 cursor-pointer">
            4. Secteur (50/60 Hz) & Souffle
          </label>
          <input
            id="toggle-hum"
            type="checkbox"
            checked={chain.humAndNoise.enabled}
            onChange={(e) =>
              onChangeChain({
                ...chain,
                humAndNoise: { ...chain.humAndNoise, enabled: e.target.checked },
              })
            }
            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
          />
        </div>
        <div className={`space-y-2.5 ${chain.humAndNoise.enabled ? 'opacity-100' : 'opacity-45'}`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <label htmlFor="slider-hp">Passe-haut</label>
                <span className="font-mono text-slate-200 tabular-nums">{chain.humAndNoise.highPassHz} Hz</span>
              </div>
              <input
                id="slider-hp"
                type="range"
                min={20}
                max={160}
                step={5}
                value={chain.humAndNoise.highPassHz}
                onChange={(e) =>
                  onChangeChain({
                    ...chain,
                    humAndNoise: { ...chain.humAndNoise, enabled: true, highPassHz: Number(e.target.value) },
                  })
                }
                className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <label htmlFor="slider-gate">Seuil Gate</label>
                <span className="font-mono text-slate-200 tabular-nums">{chain.humAndNoise.noiseGateDb} dB</span>
              </div>
              <input
                id="slider-gate"
                type="range"
                min={-72}
                max={-28}
                step={1}
                value={chain.humAndNoise.noiseGateDb}
                onChange={(e) =>
                  onChangeChain({
                    ...chain,
                    humAndNoise: { ...chain.humAndNoise, enabled: true, noiseGateDb: Number(e.target.value) },
                  })
                }
                className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Module 5: Dynamique & Limiteur True Peak */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="toggle-dynamics" className="text-xs font-semibold text-slate-200 cursor-pointer">
            5. Dé-écrêtage & Limiteur True Peak
          </label>
          <input
            id="toggle-dynamics"
            type="checkbox"
            checked={chain.dynamics.enabled}
            onChange={(e) =>
              onChangeChain({
                ...chain,
                dynamics: { ...chain.dynamics, enabled: e.target.checked },
              })
            }
            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
          />
        </div>
        <div className={`space-y-2.5 ${chain.dynamics.enabled ? 'opacity-100' : 'opacity-45'}`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <label htmlFor="slider-declip">Dé-écrêtage</label>
                <span className="font-mono text-slate-200 tabular-nums">{chain.dynamics.deClipStrength} %</span>
              </div>
              <input
                id="slider-declip"
                type="range"
                min={0}
                max={100}
                step={5}
                value={chain.dynamics.deClipStrength}
                onChange={(e) =>
                  onChangeChain({
                    ...chain,
                    dynamics: { ...chain.dynamics, enabled: true, deClipStrength: Number(e.target.value) },
                  })
                }
                className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <label htmlFor="slider-ceiling">Plafond</label>
                <span className="font-mono text-slate-200 tabular-nums">{chain.dynamics.ceilingDbtp.toFixed(1)} dBTP</span>
              </div>
              <input
                id="slider-ceiling"
                type="range"
                min={-3.0}
                max={-0.1}
                step={0.1}
                value={chain.dynamics.ceilingDbtp}
                onChange={(e) =>
                  onChangeChain({
                    ...chain,
                    dynamics: { ...chain.dynamics, enabled: true, ceilingDbtp: Number(e.target.value) },
                  })
                }
                className="w-full h-1.5 bg-[#0B0E14] rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
