import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudioBuffer } from '../dsp/analyzer';
import { processAudioBuffer } from '../dsp/processor';
import { STUDIO_SAMPLE_PRESETS, synthesizeStudioSample } from '../dsp/synthSamples';
import {
  buildAgentIntegrationGuideMarkdown,
  buildDeepSeekHarnessManifest,
  buildDeepSeekPluginSourceCode,
  executeHarnessTool,
  generateMarkdownReport,
} from './deepseekHarness';

test('generates valid DeepSeek Harness plugin manifest with ProRes/H.265 compatibility', () => {
  const manifest = buildDeepSeekHarnessManifest();
  assert.equal(manifest.schemaVersion, 'deepseek-harness/plugin-v1');
  assert.equal(manifest.tools.length, 3);
  assert.ok(manifest.compatibility.videoCodecs.includes('prores_422_hq'));
  assert.ok(manifest.compatibility.videoCodecs.includes('h265_hevc'));
  assert.equal(manifest.performance.zeroCopyVideoRemux, true);
});

test('executes all DeepSeek Harness plugin tools, reports echo delay/decay, and generates AI agent Markdown guide', () => {
  const preset = STUDIO_SAMPLE_PRESETS[0];
  const samples = synthesizeStudioSample(preset);
  const report = analyzeAudioBuffer(samples, preset.media);
  const processed = processAudioBuffer(samples, preset.media.sampleRate, report.recommendedChain);

  const analyzeRes = executeHarnessTool(
    'audio_forensics.analyze_and_prescribe',
    report,
    report.recommendedChain,
    processed,
    'prores_422_hq',
  );
  assert.equal(analyzeRes.status, 'ok');
  assert.equal(analyzeRes.payload.reportId, report.id);
  const echoAnalysis = analyzeRes.payload.echoAnalysis as Record<string, unknown>;
  assert.equal(echoAnalysis.present, true);
  assert.equal(typeof echoAnalysis.delayMs, 'number');
  assert.equal(typeof echoAnalysis.decayTimeMs, 'number');

  const exportRes = executeHarnessTool(
    'audio_forensics.prepare_fast_export',
    report,
    report.recommendedChain,
    processed,
    'h265_hevc_main10',
  );
  assert.match(String(exportRes.payload.remuxCommand), /-c:v copy/);

  const pluginTs = buildDeepSeekPluginSourceCode(report, report.recommendedChain, 'prores_422_hq');
  assert.match(pluginTs, /onAnalyzeAudio/);
  assert.match(pluginTs, /onSurgicalPostProcess/);

  const md = generateMarkdownReport(report, report.recommendedChain, processed);
  assert.match(md, /Rapport d'analyse forensique audio/);
  assert.match(md, /Temps de décroissance \(-60 dB\)/);
  assert.match(md, /Prescriptions chirurgicales/i);

  const agentGuide = buildAgentIntegrationGuideMarkdown();
  assert.match(agentGuide, /deepseek-harness\/plugin-v1/);
  assert.match(agentGuide, /harness\.config\.json/);
  assert.match(agentGuide, /-c:v copy/);
  assert.match(agentGuide, /echoDecayTimeMs/);
});
