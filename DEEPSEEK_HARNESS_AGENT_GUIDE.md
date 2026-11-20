---
title: "DeepSeek Harness Integration Guide — AcoustiqLab Audio Forensics Plugin"
plugin_id: "acoustiqlab.audio-forensics-surgical"
schema_version: "deepseek-harness/plugin-v1"
target_audience: "AI Coding Agents (autonomous integration)"
runtime: "node-22"
zero_copy_video_remux: true
---

# Guide d'intégration DeepSeek Harness (Format Agent IA)

Ce document est conçu pour permettre à un agent d'intelligence artificielle d'intégrer **AcoustiqLab** dans **DeepSeek Harness** rapidement, de manière déterministe et sans ambiguïté.

## 1. Résumé technique & Capacités

- **Sources supportées** : Audio brut (`WAV 24-bit`, `FLAC`, `AIFF`, `PCM`) et conteneurs vidéo professionnels (`Apple ProRes 422 HQ / 4444 .mov`, `H.265 / HEVC .mp4 / .mkv`, `WebM`).
- **Détection avancée d'écho** :
  - `echoDetected` (`boolean`) : présence confirmée par autocorrélation d'enveloppe + affinage intercorrélation échantillon.
  - `echoDelayMs` (`number | null`) : délai primaire sous-milliseconde.
  - `echoDecayTimeMs` (`number | null`) : temps de décroissance estimé à `-60 dB` (`T60_echo`).
  - `echoAttenuationDb` (`number | null`) : atténuation par rebond en dB.
  - `echoTaps` (`EchoTap[]`) : délais et atténuations cumulées des rebonds successifs (`1τ, 2τ, 3τ, 4τ`).
- **Autres artefacts détectés** : réverbération (`RT60`, `C50`), son métallique / résonances modales (`Hz`, `Q`), ronflement secteur (`50/60 Hz` par filtre de Goertzel), souffle de fond et écrêtage numérique.
- **Post-traitement chirurgical faible latence** : peigne inverse anti-écho, dé-réverbération adaptative, notch Q dé-métallisation, filtre secteur + noise gate, dé-écrêtage + limiteur True Peak (`-1.0 dBTP`).
- **Exportation rapide sans perte vidéo** : encodage WAV 24-bit / 48 kHz + remuxage FFmpeg `-c:v copy` pour ProRes et H.265.

## 2. Arborescence cible à créer dans le harnais

```text
<DEEPSEEK_HARNESS_ROOT>/
└── plugins/
    └── acoustiqlab-audio-forensics/
        ├── deepseek-harness.plugin.json   # Manifeste déclaratif (Section 3)
        ├── audio-forensics-plugin.ts      # Point d'entrée natif des hooks (Section 4)
        └── dsp/
            ├── types.ts                   # Copier depuis src/dsp/types.ts
            ├── mediaProbe.ts              # Copier depuis src/dsp/mediaProbe.ts
            ├── analyzer.ts                # Copier depuis src/dsp/analyzer.ts
            └── processor.ts               # Copier depuis src/dsp/processor.ts
```

## 3. Étape 1 — Créer le manifeste `deepseek-harness.plugin.json`

Écrire exactement ce contenu dans `plugins/acoustiqlab-audio-forensics/deepseek-harness.plugin.json` :

```json
{
  "schemaVersion": "deepseek-harness/plugin-v1",
  "pluginId": "acoustiqlab.audio-forensics-surgical",
  "name": "AcoustiqLab Audio Forensics & Surgical DSP",
  "version": "1.2.0",
  "runtime": "node-22",
  "entrypoint": "./audio-forensics-plugin.ts",
  "compatibility": {
    "deepseekHarness": ">=1.0.0",
    "videoContainers": ["mov", "mp4", "mkv", "webm"],
    "videoCodecs": ["prores_422_hq", "prores_4444", "h265_hevc", "h264_avc"],
    "audioFormats": ["wav_24bit", "flac", "aiff", "pcm_raw"]
  },
  "performance": {
    "targetLatencyMs": 15,
    "zeroCopyVideoRemux": true,
    "streamingChunkFrames": 1024
  },
  "hooks": {
    "onMediaIngest": "ingestAndProbeMedia",
    "onAnalyzeAudio": "runForensicAudioAudit",
    "onSurgicalPostProcess": "applySurgicalDspChain",
    "onExportDelivery": "exportFastRemuxArtifact"
  },
  "tools": [
    {
      "name": "audio_forensics.analyze_and_prescribe",
      "description": "Analyse un flux audio brut ou vidéo (ProRes, H.265), détecte écho (présence, délai ms, temps de décroissance ms, rebonds), réverbération, son métallique, souffle et écrêtage, et génère une prescription chirurgicale.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "sourceUri": { "type": "string" },
          "standard": { "type": "string", "enum": ["EBU_R128", "ATSC_A85", "CINEMA_24BIT"] },
          "detectMetallic": { "type": "boolean", "default": true },
          "detectEchoDecay": { "type": "boolean", "default": true }
        },
        "required": ["sourceUri"]
      }
    },
    {
      "name": "audio_forensics.apply_surgical_chain",
      "description": "Applique la chaîne chirurgicale DSP (anti-écho, dé-réverbération, dé-métallisation, filtre secteur, limiteur True Peak) avec latence minimale.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "autoCalibrate": { "type": "boolean", "default": true },
          "targetCeilingDbtp": { "type": "number", "default": -1.0 }
        }
      }
    },
    {
      "name": "audio_forensics.prepare_fast_export",
      "description": "Prépare un export WAV 24-bit ou un remuxage vidéo sans perte (-c:v copy) pour ProRes 422 HQ, ProRes 4444 ou H.265 HEVC.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "profile": {
            "type": "string",
            "enum": ["prores_422_hq", "prores_4444", "h265_hevc_main10", "wav_24_48"]
          }
        },
        "required": ["profile"]
      }
    }
  ]
}
```

## 4. Étape 2 — Implémenter le point d'entrée `audio-forensics-plugin.ts`

```ts
import { probeMediaHeader, buildFastRemuxCommand } from './dsp/mediaProbe';
import { analyzeAudioBuffer } from './dsp/analyzer';
import { processAudioBuffer, encodeWav24Bit } from './dsp/processor';
import type { ExportProfileId, MediaContainerInfo, SurgicalChainConfig } from './dsp/types';

export default {
  id: 'acoustiqlab.audio-forensics-surgical',
  schemaVersion: 'deepseek-harness/plugin-v1',

  async ingestAndProbeMedia(fileName: string, headerBytes: Uint8Array) {
    return probeMediaHeader(fileName, headerBytes);
  },

  async runForensicAudioAudit(samples: Float32Array, media: MediaContainerInfo) {
    const report = analyzeAudioBuffer(samples, media);
    return {
      reportId: report.id,
      complianceStatus: report.complianceStatus,
      analysisLatencyMs: report.analysisLatencyMs,
      echoAnalysis: {
        present: report.metrics.echoDetected,
        delayMs: report.metrics.echoDelayMs,
        decayTimeMs: report.metrics.echoDecayTimeMs,
        attenuationDb: report.metrics.echoAttenuationDb,
        taps: report.metrics.echoTaps,
      },
      artifacts: report.artifacts,
      recommendedChain: report.recommendedChain,
    };
  },

  async applySurgicalDspChain(
    samples: Float32Array,
    sampleRate: number,
    chain: SurgicalChainConfig,
  ) {
    return processAudioBuffer(samples, sampleRate, chain);
  },

  async exportFastRemuxArtifact(
    samples: Float32Array,
    media: MediaContainerInfo,
    profile: ExportProfileId,
  ) {
    return {
      wav24BitBytes: encodeWav24Bit(samples, media.sampleRate),
      ffmpegRemuxCommand: buildFastRemuxCommand(media, profile),
    };
  },
};
```

## 5. Étape 3 — Déclarer le plugin dans `harness.config.json`

```json
{
  "plugins": [
    {
      "id": "acoustiqlab.audio-forensics-surgical",
      "manifest": "./plugins/acoustiqlab-audio-forensics/deepseek-harness.plugin.json",
      "enabled": true,
      "timeoutMs": 5000
    }
  ]
}
```

## 6. Flux d'exécution recommandé pour un agent IA

1. **Ingestion vidéo (ProRes / H.265)** :
   - Appeler `ingestAndProbeMedia(fileName, first256KbBytes)` pour identifier le conteneur (`apch`, `ap4h`, `hvc1`).
   - Si le média est une vidéo, extraire la piste audio en PCM 24-bit 48 kHz sans toucher à la vidéo :
     ```bash
     ffmpeg -y -i "source.mov" -vn -c:a pcm_s24le -ar 48000 "extracted_audio.wav"
     ```
2. **Analyse forensique** :
   - Décoder `extracted_audio.wav` en `Float32Array` mono et appeler `audio_forensics.analyze_and_prescribe`.
   - Lire `echoAnalysis` (`present`, `delayMs`, `decayTimeMs`, `attenuationDb`, `taps`) et `artifacts[]`.
3. **Correction chirurgicale** :
   - Passer `recommendedChain` dans `audio_forensics.apply_surgical_chain`.
   - Vérifier dans `beforeAfterDelta` que `truePeakDbtp <= -1.0` et que l'écho / les résonances ont diminué.
4. **Exportation rapide (zéro ré-encodage vidéo)** :
   - Écrire `wav24BitBytes` sur disque (`*_chirurgical_24bit.wav`).
   - Exécuter `ffmpegRemuxCommand` retourné par `audio_forensics.prepare_fast_export` :
     - **ProRes 422 HQ / 4444** : `ffmpeg -y -i "source.mov" -i "clean.wav" -map 0:v:0 -map 1:a:0 -c:v copy -c:a pcm_s24le -ar 48000 -movflags +faststart "output_prores_clean.mov"`
     - **H.265 / HEVC** : `ffmpeg -y -i "source.mp4" -i "clean.wav" -map 0:v:0 -map 1:a:0 -c:v copy -tag:v hvc1 -c:a aac -b:a 320k -ar 48000 -movflags +faststart "output_h265_clean.mp4"`

## 7. Assertions de validation post-intégration

Un agent IA peut considérer l'intégration terminée et valide dès que ces 4 assertions passent :

- [ ] `npx --yes tsx --test src/dsp/dsp.test.ts src/plugin/deepseekHarness.test.ts` termine avec `0` échec.
- [ ] `deepseek-harness.plugin.json` valide le schéma `deepseek-harness/plugin-v1` et expose 3 outils.
- [ ] Un signal contenant un écho à `92 ms` retourne `echoAnalysis.present === true`, `|delayMs - 92| <= 3`, et `decayTimeMs > 200`.
- [ ] La commande générée pour `prores_422_hq` et `h265_hevc_main10` contient `-c:v copy`.
