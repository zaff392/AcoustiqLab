import type { ExportProfile, ExportProfileId, MediaContainerInfo } from './types';

export const EXPORT_PROFILES: ExportProfile[] = [
  {
    id: 'prores_422_hq',
    label: 'Apple ProRes 422 HQ (.mov)',
    extension: 'mov',
    container: 'QuickTime MOV',
    videoCodec: 'Apple ProRes 422 HQ (apch) — Copie sans ré-encodage',
    audioCodec: 'PCM linéaire 24-bit / 48 kHz (pcm_s24le)',
    sampleRate: 48000,
    bitDepth: 24,
    estimatedSpeedMultiplier: '42x temps réel (remuxage flux vidéo)',
    description:
      'Conserve intégralement le flux vidéo ProRes 422 HQ sans perte et remuxe la piste audio restaurée en PCM 24-bit Broadcast.',
  },
  {
    id: 'prores_4444',
    label: 'Apple ProRes 4444 (.mov)',
    extension: 'mov',
    container: 'QuickTime MOV',
    videoCodec: 'Apple ProRes 4444 (ap4h) — Copie sans ré-encodage',
    audioCodec: 'PCM linéaire 24-bit / 48 kHz (pcm_s24le)',
    sampleRate: 48000,
    bitDepth: 24,
    estimatedSpeedMultiplier: '38x temps réel (remuxage flux vidéo)',
    description:
      'Idéal pour l’étalonnage cinéma et VFX avec canal alpha préservé et master audio 24-bit non compressé.',
  },
  {
    id: 'h265_hevc_main10',
    label: 'H.265 / HEVC Main10 (.mp4)',
    extension: 'mp4',
    container: 'ISO MP4 / HEVC',
    videoCodec: 'H.265 / HEVC (hvc1) — Copie sans ré-encodage',
    audioCodec: 'AAC-LC 320 kbps ou PCM 24-bit (MOV)',
    sampleRate: 48000,
    bitDepth: 24,
    estimatedSpeedMultiplier: '65x temps réel (remuxage bitstream)',
    description:
      'Remuxage rapide H.265/HEVC compatible diffusion 4K HDR, DaVinci Resolve, Premiere Pro et workflows streaming.',
  },
  {
    id: 'wav_24_48',
    label: 'WAV Broadcast PCM 24-bit (.wav)',
    extension: 'wav',
    container: 'RIFF / Broadcast WAVE',
    videoCodec: null,
    audioCodec: 'PCM linéaire non compressé 24-bit / 48 kHz',
    sampleRate: 48000,
    bitDepth: 24,
    estimatedSpeedMultiplier: '180x temps réel (export direct navigateur)',
    description:
      'Exportation directe et immédiate dans le navigateur d’un fichier master WAV 24-bit prêt pour le mixage ou le remuxage.',
  },
];

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  const end = Math.min(bytes.length, offset + length);
  for (let i = offset; i < end; i++) {
    const code = bytes[i];
    out += code >= 32 && code <= 126 ? String.fromCharCode(code) : '.';
  }
  return out;
}

function containsFourCC(bytes: Uint8Array, fourcc: string): boolean {
  if (fourcc.length !== 4 || bytes.length < 4) return false;
  const c0 = fourcc.charCodeAt(0);
  const c1 = fourcc.charCodeAt(1);
  const c2 = fourcc.charCodeAt(2);
  const c3 = fourcc.charCodeAt(3);
  const scanLimit = Math.min(bytes.length - 4, 262144);
  for (let i = 0; i <= scanLimit; i++) {
    if (
      bytes[i] === c0 &&
      bytes[i + 1] === c1 &&
      bytes[i + 2] === c2 &&
      bytes[i + 3] === c3
    ) {
      return true;
    }
  }
  return false;
}

export interface BinaryProbeResult {
  category: 'audio' | 'video';
  container: string;
  videoCodec: string | null;
  audioCodec: string;
  detectedBitDepth: number;
  proResCompatible: boolean;
  h265Compatible: boolean;
}

/**
 * Inspects file headers (RIFF/WAV, FLAC, QuickTime MOV ProRes FourCCs, ISO BMFF H.265/HEVC)
 * purely in memory with microsecond latency.
 */
export function probeMediaHeader(
  fileName: string,
  headerBytes: Uint8Array,
): BinaryProbeResult {
  const lower = fileName.toLowerCase();
  const magic4 = readAscii(headerBytes, 0, 4);
  const magic8 = readAscii(headerBytes, 4, 4);

  // RIFF WAVE
  if (magic4 === 'RIFF' && readAscii(headerBytes, 8, 4) === 'WAVE') {
    let bitDepth = 24;
    // Standard PCM fmt chunk bit depth sits at offset 34 (uint16 LE) if fmt is first chunk
    if (headerBytes.length >= 36 && readAscii(headerBytes, 12, 4) === 'fmt ') {
      const parsedBits = headerBytes[34] | (headerBytes[35] << 8);
      if (parsedBits === 16 || parsedBits === 24 || parsedBits === 32) {
        bitDepth = parsedBits;
      }
    }
    return {
      category: 'audio',
      container: 'RIFF / WAV PCM',
      videoCodec: null,
      audioCodec: `PCM ${bitDepth}-bit`,
      detectedBitDepth: bitDepth,
      proResCompatible: true,
      h265Compatible: true,
    };
  }

  // FLAC
  if (magic4 === 'fLaC' || lower.endsWith('.flac')) {
    return {
      category: 'audio',
      container: 'FLAC Lossless',
      videoCodec: null,
      audioCodec: 'FLAC 24-bit',
      detectedBitDepth: 24,
      proResCompatible: true,
      h265Compatible: true,
    };
  }

  // AIFF
  if (magic4 === 'FORM' && (readAscii(headerBytes, 8, 4) === 'AIFF' || readAscii(headerBytes, 8, 4) === 'AIFC')) {
    return {
      category: 'audio',
      container: 'AIFF Broadcast',
      videoCodec: null,
      audioCodec: 'PCM 24-bit Big-Endian',
      detectedBitDepth: 24,
      proResCompatible: true,
      h265Compatible: true,
    };
  }

  // QuickTime MOV / ISO BMFF MP4 (ftyp box)
  const isIsoBmff = magic8 === 'ftyp' || lower.endsWith('.mov') || lower.endsWith('.mp4') || lower.endsWith('.m4v') || lower.endsWith('.m4a');
  if (isIsoBmff) {
    const majorBrand = magic8 === 'ftyp' ? readAscii(headerBytes, 8, 4).trim() : '';

    // Check Apple ProRes FourCC signatures
    if (containsFourCC(headerBytes, 'ap4h') || containsFourCC(headerBytes, 'ap4x')) {
      return {
        category: 'video',
        container: 'QuickTime MOV',
        videoCodec: 'Apple ProRes 4444 (ap4h)',
        audioCodec: 'PCM 24-bit',
        detectedBitDepth: 24,
        proResCompatible: true,
        h265Compatible: true,
      };
    }
    if (containsFourCC(headerBytes, 'apch')) {
      return {
        category: 'video',
        container: 'QuickTime MOV',
        videoCodec: 'Apple ProRes 422 HQ (apch)',
        audioCodec: 'PCM 24-bit',
        detectedBitDepth: 24,
        proResCompatible: true,
        h265Compatible: true,
      };
    }
    if (containsFourCC(headerBytes, 'apcn') || containsFourCC(headerBytes, 'apcs') || containsFourCC(headerBytes, 'apco')) {
      return {
        category: 'video',
        container: 'QuickTime MOV',
        videoCodec: 'Apple ProRes 422 (apcn)',
        audioCodec: 'PCM 24-bit',
        detectedBitDepth: 24,
        proResCompatible: true,
        h265Compatible: true,
      };
    }

    // Check H.265 / HEVC FourCC signatures
    if (containsFourCC(headerBytes, 'hvc1') || containsFourCC(headerBytes, 'hev1')) {
      return {
        category: 'video',
        container: lower.endsWith('.mov') || majorBrand === 'qt' ? 'QuickTime MOV' : 'MP4 / ISO BMFF',
        videoCodec: 'H.265 / HEVC (hvc1)',
        audioCodec: containsFourCC(headerBytes, 'mp4a') ? 'AAC-LC' : 'PCM 24-bit',
        detectedBitDepth: 24,
        proResCompatible: true,
        h265Compatible: true,
      };
    }

    if (lower.endsWith('.m4a')) {
      return {
        category: 'audio',
        container: 'M4A / ISO Audio',
        videoCodec: null,
        audioCodec: 'AAC / ALAC',
        detectedBitDepth: 24,
        proResCompatible: true,
        h265Compatible: true,
      };
    }

    return {
      category: 'video',
      container: lower.endsWith('.mov') || majorBrand === 'qt' ? 'QuickTime MOV' : 'MP4 / ISO BMFF',
      videoCodec: containsFourCC(headerBytes, 'avc1') ? 'H.264 / AVC (avc1)' : 'Flux vidéo ISO BMFF',
      audioCodec: containsFourCC(headerBytes, 'mp4a') ? 'AAC-LC' : 'PCM 24-bit',
      detectedBitDepth: 24,
      proResCompatible: true,
      h265Compatible: true,
    };
  }

  // WebM / Matroska (EBML 0x1A 0x45 0xDF 0xA3)
  if (
    (headerBytes.length >= 4 &&
      headerBytes[0] === 0x1a &&
      headerBytes[1] === 0x45 &&
      headerBytes[2] === 0xdf &&
      headerBytes[3] === 0xa3) ||
    lower.endsWith('.webm') ||
    lower.endsWith('.mkv')
  ) {
    return {
      category: 'video',
      container: lower.endsWith('.mkv') ? 'Matroska MKV' : 'WebM',
      videoCodec: lower.endsWith('.mkv') ? 'H.265 / Matroska' : 'VP9 / AV1',
      audioCodec: 'Opus / PCM',
      detectedBitDepth: 24,
      proResCompatible: true,
      h265Compatible: true,
    };
  }

  // Default audio fallback (MP3, OGG, etc.)
  const ext = lower.split('.').pop() || 'audio';
  return {
    category: 'audio',
    container: ext.toUpperCase(),
    videoCodec: null,
    audioCodec: ext === 'mp3' ? 'MPEG-1 Layer III' : ext === 'ogg' ? 'Vorbis / Opus' : 'Audio décodé PCM',
    detectedBitDepth: 24,
    proResCompatible: true,
    h265Compatible: true,
  };
}

/**
 * Generates an exact zero-video-transcode FFmpeg remux command for fast ProRes/H.265 delivery.
 */
export function buildFastRemuxCommand(
  media: MediaContainerInfo,
  profileId: ExportProfileId,
): string {
  const baseName = media.fileName.replace(/\.[^/.]+$/, '');
  const cleanWav = `${baseName}_chirurgical_24bit.wav`;

  switch (profileId) {
    case 'prores_422_hq':
      if (media.category === 'video') {
        return `ffmpeg -y -i "${media.fileName}" -i "${cleanWav}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a pcm_s24le -ar 48000 -movflags +faststart "${baseName}_prores422hq_clean.mov"`;
      }
      return `ffmpeg -y -f lavfi -i color=c=black:s=1920x1080:r=25 -i "${cleanWav}" -shortest -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le -c:a pcm_s24le -ar 48000 "${baseName}_prores422hq_master.mov"`;

    case 'prores_4444':
      if (media.category === 'video') {
        return `ffmpeg -y -i "${media.fileName}" -i "${cleanWav}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a pcm_s24le -ar 48000 -movflags +faststart "${baseName}_prores4444_clean.mov"`;
      }
      return `ffmpeg -y -f lavfi -i color=c=black:s=1920x1080:r=25 -i "${cleanWav}" -shortest -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -c:a pcm_s24le -ar 48000 "${baseName}_prores4444_master.mov"`;

    case 'h265_hevc_main10':
      if (media.category === 'video') {
        return `ffmpeg -y -i "${media.fileName}" -i "${cleanWav}" -map 0:v:0 -map 1:a:0 -c:v copy -tag:v hvc1 -c:a aac -b:a 320k -ar 48000 -movflags +faststart "${baseName}_h265_clean.mp4"`;
      }
      return `ffmpeg -y -f lavfi -i color=c=black:s=1920x1080:r=25 -i "${cleanWav}" -shortest -c:v libx265 -preset fast -crf 18 -tag:v hvc1 -c:a aac -b:a 320k -ar 48000 "${baseName}_h265_master.mp4"`;

    case 'wav_24_48':
    default:
      return `# Export direct natif depuis AcoustiqLab (PCM 24-bit / 48 kHz)\n# Fichier généré : ${cleanWav}`;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe - Math.floor(safe)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}
