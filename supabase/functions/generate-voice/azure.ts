/**
 * The Azure implementation of the Synthesize seam. This file is the only
 * place in the repository that knows Azure exists. It sends SSML to Azure
 * AI Speech and returns MP3 bytes.
 *
 * Secrets (set with `supabase secrets set`):
 *   AZURE_SPEECH_KEY    — the key from the Azure Speech service page.
 *   AZURE_SPEECH_REGION — the data center picked at creation (northeurope).
 */

import { SynthesisError, type Synthesize, type VoiceLanguage } from './types.ts';

/**
 * One fixed neural voice per language. Fixed on purpose: a generated voice
 * becomes part of a learned symbol system, so the same label must sound the
 * same on every generation.
 */
const VOICES: Record<VoiceLanguage, { locale: string; name: string }> = {
  da: { locale: 'da-DK', name: 'da-DK-ChristelNeural' },
  en: { locale: 'en-US', name: 'en-US-JennyNeural' },
};

const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** The label lands inside XML; escape it so no input can alter the SSML. */
const escapeXml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const buildSsml = (label: string, language: VoiceLanguage): string => {
  const voice = VOICES[language];
  return `<speak version="1.0" xml:lang="${voice.locale}"><voice name="${voice.name}">${escapeXml(label)}</voice></speak>`;
};

export const synthesizeWithAzure: Synthesize = async (label, language) => {
  const key = Deno.env.get('AZURE_SPEECH_KEY');
  const region = Deno.env.get('AZURE_SPEECH_REGION');
  if (!key || !region) {
    throw new SynthesisError('AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set');
  }

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
    },
    body: buildSsml(label, language),
  });
  if (!res.ok) {
    // The body is Azure's error text; keep it out of the client response
    // (index.ts sends a generic message) but log it for diagnosis.
    throw new SynthesisError(`azure responded ${res.status}: ${await res.text()}`);
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
};
