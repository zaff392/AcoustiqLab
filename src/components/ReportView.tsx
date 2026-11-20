import { Download, FileJson, FileText, Printer } from 'lucide-react';
import { formatBytes, formatTimecode } from '../dsp/mediaProbe';
import type { ForensicReport, ProcessingResult, SurgicalChainConfig } from '../dsp/types';
import { generateMarkdownReport } from '../plugin/deepseekHarness';

interface ReportViewProps {
  report: ForensicReport;
  surgicalChain: SurgicalChainConfig;
  processingResult: ProcessingResult | null;
  onApplyAllFixes: () => void;
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportView({
  report,
  surgicalChain,
  processingResult,
  onApplyAllFixes,
}: ReportViewProps) {
  const after = processingResult?.afterMetrics;
  const baseName = report.media.fileName.replace(/\.[^/.]+$/, '');

  const handleDownloadMarkdown = () => {
    const md = generateMarkdownReport(report, surgicalChain, processingResult);
    downloadTextFile(`${baseName}_rapport_forensique.md`, md, 'text/markdown;charset=utf-8');
  };

  const handleDownloadJson = () => {
    const payload = {
      reportId: report.id,
      generatedAtIso: report.generatedAtIso,
      analysisLatencyMs: report.analysisLatencyMs,
      complianceStatus: report.complianceStatus,
      complianceStandard: report.complianceStandard,
      executiveSummary: report.executiveSummary,
      media: report.media,
      echoAnalysis: {
        present: report.metrics.echoDetected,
        delayMs: report.metrics.echoDelayMs,
        decayTimeMs: report.metrics.echoDecayTimeMs,
        attenuationDb: report.metrics.echoAttenuationDb,
        taps: report.metrics.echoTaps,
      },
      metricsBefore: report.metrics,
      metricsAfter: after ?? null,
      artifacts: report.artifacts,
      activeSurgicalChain: surgicalChain,
    };
    downloadTextFile(
      `${baseName}_rapport_forensique.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    );
  };

  const statusMeta =
    report.complianceStatus === 'conforme'
      ? { label: '● Conforme Broadcast', cls: 'text-emerald-400' }
      : report.complianceStatus === 'critique'
        ? { label: '✖ Correction critique requise', cls: 'text-rose-400' }
        : { label: '▲ Corrections recommandées', cls: 'text-amber-400' };

  const metricRows = [
    {
      label: 'Loudness intégré',
      before: report.metrics.integratedLufs.toFixed(1),
      after: (after?.integratedLufs ?? report.metrics.integratedLufs).toFixed(1),
      unit: 'LUFS',
      target: '-16.0 à -23.0 LUFS',
    },
    {
      label: 'Crête réelle (True Peak)',
      before: report.metrics.truePeakDbtp.toFixed(1),
      after: (after?.truePeakDbtp ?? report.metrics.truePeakDbtp).toFixed(1),
      unit: 'dBTP',
      target: '≤ -1.0 dBTP',
    },
    {
      label: "Délai d'écho primaire",
      before:
        report.metrics.echoDetected && report.metrics.echoDelayMs !== null
          ? report.metrics.echoDelayMs.toFixed(1)
          : 'Absent',
      after:
        after?.echoDetected && after.echoDelayMs !== null
          ? after.echoDelayMs.toFixed(1)
          : 'Aucun',
      unit: report.metrics.echoDetected ? 'ms' : '',
      target: 'Aucun écho discret',
    },
    {
      label: "Temps de décroissance d'écho (-60 dB)",
      before:
        report.metrics.echoDetected && report.metrics.echoDecayTimeMs !== null
          ? `${report.metrics.echoDecayTimeMs}`
          : '—',
      after:
        after?.echoDetected && after.echoDecayTimeMs !== null
          ? `${after.echoDecayTimeMs}`
          : 'Aucune',
      unit: report.metrics.echoDetected ? 'ms' : '',
      target: '< 150 ms',
    },
    {
      label: 'Temps de réverbération RT60',
      before: report.metrics.estimatedRt60Sec.toFixed(2),
      after: (after?.estimatedRt60Sec ?? report.metrics.estimatedRt60Sec).toFixed(2),
      unit: 's',
      target: '< 0.45 s (voix studio)',
    },
    {
      label: 'Indice de clarté vocale C50',
      before: report.metrics.clarityC50Db.toFixed(1),
      after: (after?.clarityC50Db ?? report.metrics.clarityC50Db).toFixed(1),
      unit: 'dB',
      target: '> +7.0 dB',
    },
    {
      label: 'Plancher de bruit résiduel',
      before: report.metrics.noiseFloorDb.toFixed(1),
      after: (after?.noiseFloorDb ?? report.metrics.noiseFloorDb).toFixed(1),
      unit: 'dBFS',
      target: '< -55.0 dBFS',
    },
    {
      label: 'Indice de pureté spectrale',
      before: `${report.metrics.spectralPurityPct}`,
      after: `${after?.spectralPurityPct ?? report.metrics.spectralPurityPct}`,
      unit: '%',
      target: '≥ 85 %',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Export Toolbar */}
      <div className="bg-[#121722] border border-[#1E2636] rounded-lg p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
              <span>Rapport {report.id}</span>
              <span aria-hidden="true">·</span>
              <span>{report.complianceStandard}</span>
              <span aria-hidden="true">·</span>
              <span className={statusMeta.cls}>{statusMeta.label}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Audit forensique — {report.media.fileName}
            </h1>
            <p className="text-xs font-mono text-slate-400 tabular-nums">
              {report.media.container} · {report.media.videoCodec ?? 'Audio brut'} ·{' '}
              {(report.media.sampleRate / 1000).toFixed(1)} kHz / {report.media.bitDepth}-bit ·{' '}
              {formatTimecode(report.media.durationSec)} · {formatBytes(report.media.fileSizeBytes)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exporter Markdown</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 border border-[#273244] hover:border-slate-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exporter JSON</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 border border-[#273244] hover:border-slate-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Imprimer</span>
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed pt-3 border-t border-[#1E2636]">
          {report.executiveSummary}
        </p>
      </div>

      {/* Dedicated Advanced Echo Analysis Section */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1E2636] flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Analyse avancée des échos (Présence, Délai & Temps de décroissance)
          </h2>
          <span
            className={`text-xs font-mono ${
              report.metrics.echoDetected ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {report.metrics.echoDetected ? '▲ Écho détecté' : '● Aucun écho discret'}
          </span>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400">Présence</p>
              <p className="text-base font-mono font-semibold text-slate-100 mt-1">
                {report.metrics.echoDetected ? 'Oui' : 'Non'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Délai primaire</p>
              <p className="text-base font-mono font-semibold text-amber-300 tabular-nums mt-1">
                {report.metrics.echoDelayMs !== null
                  ? `${report.metrics.echoDelayMs.toFixed(1)} ms`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Décroissance (-60 dB)</p>
              <p className="text-base font-mono font-semibold text-amber-300 tabular-nums mt-1">
                {report.metrics.echoDecayTimeMs !== null
                  ? `${report.metrics.echoDecayTimeMs} ms`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Atténuation / rebond</p>
              <p className="text-base font-mono font-semibold text-slate-100 tabular-nums mt-1">
                {report.metrics.echoAttenuationDb !== null
                  ? `${report.metrics.echoAttenuationDb.toFixed(1)} dB`
                  : '—'}
              </p>
            </div>
          </div>

          {report.metrics.echoTaps.length > 0 && (
            <div className="overflow-x-auto border-t border-[#1E2636] pt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E2636] text-xs font-mono text-slate-400">
                    <th className="py-2 pr-4 font-medium">Rebond</th>
                    <th className="py-2 px-4 font-medium text-right">Délai cumulé</th>
                    <th className="py-2 px-4 font-medium text-right">Atténuation cumulée</th>
                    <th className="py-2 pl-4 font-medium text-right">Corrélation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2636] text-xs font-mono tabular-nums">
                  {report.metrics.echoTaps.map((tap) => (
                    <tr key={tap.tapIndex}>
                      <td className="py-2 pr-4 text-slate-200">Réflexion #{tap.tapIndex}</td>
                      <td className="py-2 px-4 text-right text-amber-300">{tap.delayMs.toFixed(1)} ms</td>
                      <td className="py-2 px-4 text-right text-slate-300">{tap.attenuationDb.toFixed(1)} dB</td>
                      <td className="py-2 pl-4 text-right text-slate-400">
                        {Math.round(tap.correlation * 100)} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Comparative Acoustics Table */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1E2636] flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-100">
            Mesures acoustiques comparatives (Brut vs Post-traitement)
          </h2>
          {!processingResult && report.artifacts.length > 0 && (
            <button
              type="button"
              onClick={onApplyAllFixes}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 border border-amber-500/40 hover:bg-amber-500/10 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Appliquer la chaîne recommandée</span>
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E2636] text-xs font-mono text-slate-400">
                <th className="py-3 px-6 font-medium">Paramètre acoustique</th>
                <th className="py-3 px-4 font-medium text-right">Signal brut</th>
                <th className="py-3 px-4 font-medium text-right">Après correction</th>
                <th className="py-3 px-6 font-medium text-right">Gabarit Broadcast</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2636] text-sm">
              {metricRows.map((row) => (
                <tr key={row.label} className="hover:bg-[#151B28]">
                  <td className="py-3 px-6 text-slate-200 font-medium">{row.label}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-300">
                    {row.before} <span className="text-xs text-slate-500">{row.unit}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-cyan-300">
                    {after ? (
                      <>
                        {row.after} <span className="text-xs text-slate-500">{row.unit}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-right font-mono text-xs text-slate-400 tabular-nums">
                    {row.target}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detailed Surgical Prescription Breakdown */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1E2636]">
          <h2 className="text-sm font-semibold text-slate-100">
            Plan d'intervention chirurgical détaillé ({report.artifacts.length} point{report.artifacts.length > 1 ? 's' : ''})
          </h2>
        </div>

        {report.artifacts.length === 0 ? (
          <div className="p-6 text-sm text-slate-300">
            Le fichier analysé respecte les tolérances acoustiques sans traitement correctif nécessaire.
          </div>
        ) : (
          <div className="divide-y divide-[#1E2636]">
            {report.artifacts.map((art, idx) => (
              <article key={art.id} className="p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-100">
                    {idx + 1}. {art.title}
                  </h3>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    Confiance {art.confidence}% · Module {art.prescription.module}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed">
                  <div className="space-y-2">
                    <p className="text-slate-300">
                      <span className="text-slate-400 block font-medium mb-0.5">Diagnostic mesuré</span>
                      {art.diagnosis}
                    </p>
                    <p className="text-slate-300">
                      <span className="text-slate-400 block font-medium mb-0.5">Cause acoustique probable</span>
                      {art.acousticCause}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-slate-200">
                      <span className="text-amber-400 block font-medium mb-0.5">Prescription chirurgicale</span>
                      {art.prescription.summary}
                    </p>
                    <p className="text-cyan-300">
                      <span className="text-slate-400 block font-medium mb-0.5">Amélioration attendue</span>
                      {art.prescription.expectedImprovement}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
