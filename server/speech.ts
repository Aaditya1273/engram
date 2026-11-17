/**
 * Speech to text for browsers without a recogniser (the Quest browser has none). The headset records a
 * short clip and posts it here. Groq Whisper first (fast, built for this), Gemini as the fallback;
 * whichever key is set. Returns null when neither is configured or both fail: the headset then offers
 * pinchable choices, as it always did.
 */

export const MAX_AUDIO_BYTES = 1_500_000; // ~90 s of Opus; answers are a few seconds

const groqKey = () => process.env.GROQ_API_KEY || process.env.GORQ_API_KEY;
export const sttEnabled = () => !!(groqKey() || process.env.GEMINI_API_KEY);

/** 'ja-JP' → 'ja': both APIs take an ISO-639-1 hint, which matters for short single-word answers. */
const iso = (lang: string) => lang.split('-')[0].toLowerCase();

async function groq(audio: ArrayBuffer, mime: string, lang: string): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', new Blob([audio], { type: mime }), mime.includes('mp4') ? 'clip.mp4' : 'clip.webm');
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', iso(lang));
  fd.append('response_format', 'json');
  fd.append('temperature', '0');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${groqKey()}` },
    body: fd,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  return ((await res.json()) as { text?: string }).text?.trim() ?? '';
}

async function gemini(audio: ArrayBuffer, mime: string, lang: string): Promise<string | null> {
  const model = 'gemini-2.5-flash';
  const data = Buffer.from(audio).toString('base64');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: `Transcribe this short clip exactly as spoken (language hint: ${lang}). Reply with the words only, no quotes or commentary. If nothing is said, reply with nothing.` },
          { inline_data: { mime_type: mime.split(';')[0], data } },
        ],
      }],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
}

/** Whisper writes "Neko." for a one-word answer; recall matching wants the bare word too. */
const clean = (s: string) => s.replace(/^["'“”「」\s]+|["'“”「」.。!！?？,、\s]+$/g, '');

export async function transcribe(audio: ArrayBuffer, mime: string, lang: string): Promise<string[] | null> {
  for (const [enabled, run] of [[!!groqKey(), groq], [!!process.env.GEMINI_API_KEY, gemini]] as const) {
    if (!enabled) continue;
    try {
      const text = await run(audio, mime, lang);
      if (text === null) continue;
      return text ? [...new Set([text, clean(text)])] : [];
    } catch (err) {
      console.error('[stt]', (err as Error).message);
    }
  }
  return null;
}
