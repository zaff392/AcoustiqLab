import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudioBuffer } from './analyzer';
import { buildFastRemuxCommand, probeMediaHeader } from './mediaProbe';
import { encodeWav24Bit, processAudioBuffer } from './processor';
import { STUDIO_SAMPLE_PRESETS, synthesizeStudioSample } from './synthSamples';

test('detects discrete echo (presence, delay, decay time, taps) and room reverb on interview preset', () => {
  const preset = STUDIO_SAMPLE_PRESETS.find((p) => p.id === 'interview_echo_reverb')!;
  const samples = synthesizeStudioSample(preset);
  const report = analyzeAudioBuffer(samples, preset.media);

  const echo = report.artifacts.find((a) => a.kind === 'echo');
  const reverb = report.artifacts.find((a) => a.kind === 'reverb');

  assert.equal(report.metrics.echoDetected, true, 'Expected echoDetected to be true');
  assert.ok(echo, 'Expected echo artifact to be detected');
  assert.ok(
    echo.delayMs !== undefined && Math.abs(echo.delayMs - 92) <= 4,
    `Expected detected echo delay within ±4 ms of 92 ms, got ${echo.delayMs}`,
  );
  assert.ok(
    echo.echoDecayTimeMs !== undefined && echo.echoDecayTimeMs >= 200 && echo.echoDecayTimeMs <= 2200,
    `Expected realistic echo decay time (ms), got ${echo.echoDecayTimeMs}`,
  );
  assert.ok(
    echo.echoAttenuationDb !== undefined && echo.echoAttenuationDb < -1 && echo.echoAttenuationDb > -24,
    `Expected negative bounce attenuation in dB, got ${echo.echoAttenuationDb}`,
  );
  assert.ok(
    report.metrics.echoTaps.length >= 2,
    `Expected multi-tap bounce breakdown, got ${report.metrics.echoTaps.length} taps`,
  );
  assert.ok(reverb, 'Expected excessive reverberation artifact to be detected');
  assert.ok(report.metrics.estimatedRt60Sec >= 0.56, 'Expected elevated RT60');
});

test('detects narrowband metallic resonance and 50Hz hum on broadcast preset and suppresses resonance surgically', () => {
  const preset = STUDIO_SAMPLE_PRESETS.find((p) => p.id === 'broadcast_metallic')!;
  const samples = synthesizeStudioSample(preset);
  const report = analyzeAudioBuffer(samples, preset.media);

  const metallic = report.artifacts.find((a) => a.kind === 'metallic');
  const hum = report.artifacts.find((a) => a.kind === 'hum');

  assert.ok(metallic, 'Expected metallic resonance artifact to be detected');
  assert.ok(
    metallic.frequencyHz !== undefined && Math.abs(metallic.frequencyHz - 2840) <= 120,
    `Expected metallic frequency near 2840 Hz, got ${metallic.frequencyHz}`,
  );
  assert.ok(hum, 'Expected 50 Hz mains hum to be detected');

  const processed = processAudioBuffer(samples, preset.media.sampleRate, report.recommendedChain);
  assert.ok(
    processed.afterMetrics.resonanceProminenceDb < report.metrics.resonanceProminenceDb - 3,
    `Expected surgical notch to reduce resonance prominence (${report.metrics.resonanceProminenceDb} -> ${processed.afterMetrics.resonanceProminenceDb})`,
  );
});

test('detects digital clipping and enforces -1.0 dBTP ceiling after surgical processing', () => {
  const preset = STUDIO_SAMPLE_PRESETS.find((p) => p.id === 'dialogue_clipping_full')!;
  const samples = synthesizeStudioSample(preset);
  const report = analyzeAudioBuffer(samples, preset.media);

  const clip = report.artifacts.find((a) => a.kind === 'clipping');
  assert.ok(clip, 'Expected clipping artifact to be detected');

  const processed = processAudioBuffer(samples, preset.media.sampleRate, report.recommendedChain);
  assert.ok(
    processed.afterMetrics.truePeakDbtp <= -0.6,
    `Expected True Peak controlled near -1.0 dBTP, got ${processed.afterMetrics.truePeakDbtp}`,
  );
  assert.equal(processed.afterMetrics.clippedSamples, 0, 'Expected zero clipped samples after limiter');
});

test('reference clean signal passes as conforme with zero artifacts', () => {
  const preset = STUDIO_SAMPLE_PRESETS.find((p) => p.id === 'reference_clean')!;
  const samples = synthesizeStudioSample(preset);
  const report = analyzeAudioBuffer(samples, preset.media);

  assert.equal(report.artifacts.length, 0, `Expected 0 artifacts on clean reference, got ${report.artifacts.map((a) => a.kind).join(', ')}`);
  assert.equal(report.complianceStatus, 'conforme');
});

test('probes ProRes 422 HQ, H.265 HEVC, and 24-bit WAV binary headers accurately', () => {
  const wavBytes = encodeWav24Bit(new Float32Array([0, 0.25, -0.5, 0.75]), 48000);
  assert.equal(wavBytes.length, 44 + 4 * 3);
  const wavProbe = probeMediaHeader('master.wav', wavBytes);
  assert.equal(wavProbe.container, 'RIFF / WAV PCM');
  assert.equal(wavProbe.detectedBitDepth, 24);

  // Synthetic QuickTime ftyp + ProRes apch FourCC header
  const proResBuf = new Uint8Array(64);
  proResBuf.set(new TextEncoder().encode('\x00\x00\x00\x14ftypqt  \x00\x00\x00\x00qt  moovapch'), 0);
  const proResProbe = probeMediaHeader('rush_camera.mov', proResBuf);
  assert.equal(proResProbe.category, 'video');
  assert.match(proResProbe.videoCodec ?? '', /ProRes 422 HQ/);

  // Synthetic MP4 ftyp + H.265 hvc1 FourCC header
  const hevcBuf = new Uint8Array(64);
  hevcBuf.set(new TextEncoder().encode('\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42trakstsdhvc1'), 0);
  const hevcProbe = probeMediaHeader('clip_4k.mp4', hevcBuf);
  assert.equal(hevcProbe.category, 'video');
  assert.match(hevcProbe.videoCodec ?? '', /H\.265/);

  const cmd = buildFastRemuxCommand(STUDIO_SAMPLE_PRESETS[0].media, 'prores_422_hq');
  assert.match(cmd, /-c:v copy/);
  assert.match(cmd, /pcm_s24le/);
});
