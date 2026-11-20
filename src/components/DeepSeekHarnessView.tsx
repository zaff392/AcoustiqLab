import { useState } from 'react';
import { BookOpen, Check, Code2, Copy, Download, Play, Terminal } from 'lucide-react';
import type {
  ExportProfileId,
  ForensicReport,
  ProcessingResult,
  SurgicalChainConfig,
} from '../dsp/types';
import {
  buildAgentIntegrationGuideMarkdown,
  buildDeepSeekHarnessManifest,
  buildDeepSeekPluginSourceCode,
  executeHarnessTool,
  type HarnessExecutionOutput,
  type HarnessToolName,
} from '../plugin/deepseekHarness';

interface DeepSeekHarnessViewProps {
  report: ForensicReport;
  surgicalChain: SurgicalChainConfig;
  processingResult: ProcessingResult | null;
  exportProfile: ExportProfileId;
}

function triggerDownload(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DeepSeekHarnessView({
  report,
  surgicalChain,
  processingResult,
  exportProfile,
}: DeepSeekHarnessViewProps) {
  const [codeTab, setCodeTab] = useState<'agent_guide' | 'manifest' | 'plugin'>('agent_guide');
  const [selectedTool, setSelectedTool] = useState<HarnessToolName>(
    'audio_forensics.analyze_and_prescribe',
  );
  const [executionOutput, setExecutionOutput] = useState<HarnessExecutionOutput | null>(() =>
    executeHarnessTool(
      'audio_forensics.analyze_and_prescribe',
      report,
      surgicalChain,
      processingResult,
      exportProfile,
    ),
  );
  const [copied, setCopied] = useState(false);

  const manifestObj = buildDeepSeekHarnessManifest();
  const manifestJson = JSON.stringify(manifestObj, null, 2);
  const pluginSource = buildDeepSeekPluginSourceCode(report, surgicalChain, exportProfile);
  const agentGuideMd = buildAgentIntegrationGuideMarkdown();
  const activeCode =
    codeTab === 'agent_guide'
      ? agentGuideMd
      : codeTab === 'manifest'
        ? manifestJson
        : pluginSource;

  const handleRunTool = () => {
    const out = executeHarnessTool(
      selectedTool,
      report,
      surgicalChain,
      processingResult,
      exportProfile,
    );
    setExecutionOutput(out);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Plugin Package Downloads */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-lg p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-mono text-slate-400">
              Schéma natif {manifestObj.schemaVersion} · ID {manifestObj.pluginId} · Runtime {manifestObj.runtime}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Intégration Plugin DeepSeek Harness
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Exportez la documentation Markdown dédiée aux agents IA, le manifeste JSON et le module TypeScript conformes aux hooks natifs DeepSeek Harness (<code className="font-mono text-slate-300">onMediaIngest</code>, <code className="font-mono text-slate-300">onAnalyzeAudio</code>, <code className="font-mono text-slate-300">onSurgicalPostProcess</code>, <code className="font-mono text-slate-300">onExportDelivery</code>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                triggerDownload(
                  'DEEPSEEK_HARNESS_AGENT_GUIDE.md',
                  agentGuideMd,
                  'text/markdown;charset=utf-8',
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Guide Agent IA (.md)</span>
            </button>
            <button
              type="button"
              onClick={() =>
                triggerDownload(
                  'deepseek-harness.plugin.json',
                  manifestJson,
                  'application/json;charset=utf-8',
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 border border-[#273244] hover:border-slate-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>manifest.json</span>
            </button>
            <button
              type="button"
              onClick={() =>
                triggerDownload(
                  'audio-forensics-plugin.ts',
                  pluginSource,
                  'text/typescript;charset=utf-8',
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 border border-[#273244] hover:border-slate-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>plugin .ts</span>
            </button>
          </div>
        </div>

        {/* Registered Hooks Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#1E2636] text-xs font-mono">
          <div>
            <span className="text-slate-400 block">Hook Ingestion</span>
            <span className="text-slate-100">{manifestObj.hooks.onMediaIngest}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Hook Analyse</span>
            <span className="text-slate-100">{manifestObj.hooks.onAnalyzeAudio}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Hook Chirurgical</span>
            <span className="text-slate-100">{manifestObj.hooks.onSurgicalPostProcess}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Hook Export ProRes/H.265</span>
            <span className="text-slate-100">{manifestObj.hooks.onExportDelivery}</span>
          </div>
        </div>
      </section>

      {/* Two-Column Split: Live Hook Runner + Plugin Code / Agent Guide Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Live DeepSeek Harness Tool Runner */}
        <section className="lg:col-span-5 bg-[#121722] border border-[#1E2636] rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2636] flex items-center gap-2">
            <Terminal className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-100">
              Testeur de Hooks DeepSeek Harness
            </h2>
          </div>

          <div className="p-4 space-y-4 flex-1 flex flex-col">
            <div className="space-y-1.5">
              <label htmlFor="harness-tool-select" className="text-xs font-medium text-slate-300">
                Outil exposé au harnais
              </label>
              <select
                id="harness-tool-select"
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value as HarnessToolName)}
                className="w-full bg-[#0B0E14] border border-[#1E2636] rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {manifestObj.tools.map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                {manifestObj.tools.find((t) => t.name === selectedTool)?.description}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRunTool}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exécuter le hook sur le média actif</span>
            </button>

            {executionOutput && (
              <div className="flex-1 flex flex-col min-h-0 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-emerald-400">● Réponse JSON-RPC OK</span>
                  <span className="text-slate-400 tabular-nums">
                    Latence {executionOutput.latencyMs.toFixed(1)} ms
                  </span>
                </div>
                <pre
                  data-testid="harness-execution-output"
                  className="flex-1 max-h-[340px] overflow-auto p-3 bg-[#0B0E14] border border-[#1E2636] rounded-md text-[11px] font-mono text-cyan-200 leading-relaxed"
                >
                  <code>{JSON.stringify(executionOutput, null, 2)}</code>
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* Agent Guide, Manifest & TypeScript Entrypoint Viewer */}
        <section className="lg:col-span-7 bg-[#121722] border border-[#1E2636] rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1E2636] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#0B0E14] border border-[#1E2636] rounded-md overflow-x-auto">
              <button
                type="button"
                onClick={() => setCodeTab('agent_guide')}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  codeTab === 'agent_guide'
                    ? 'bg-[#1E2636] text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                AGENT_GUIDE.md
              </button>
              <button
                type="button"
                onClick={() => setCodeTab('manifest')}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  codeTab === 'manifest'
                    ? 'bg-[#1E2636] text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                plugin.json
              </button>
              <button
                type="button"
                onClick={() => setCodeTab('plugin')}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  codeTab === 'plugin'
                    ? 'bg-[#1E2636] text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                plugin.ts
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 border border-[#273244] hover:border-slate-500 rounded-md transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>

          <pre className="flex-1 max-h-[480px] overflow-auto p-4 bg-[#0B0E14] text-xs font-mono text-slate-200 leading-relaxed whitespace-pre-wrap">
            <code>{activeCode}</code>
          </pre>
        </section>
      </div>
    </div>
  );
}
