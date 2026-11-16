/**
 * Speech in and out, both optional. If recognition is missing or fails once, the flows switch to
 * pinchable choices for the rest of the session. Narration is always captioned.
 * ponytail: browser Web Speech only. Add a cloud speech-to-text fallback (STT_API_KEY) if the
 * Quest browser's recogniser proves unreliable on device.
 */

interface RecognitionLike {
  lang: string;
  maxAlternatives: number;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const Ctor = (globalThis as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike })
  .SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => RecognitionLike }).webkitSpeechRecognition;

let broken = !Ctor;
/** Errors that mean "this device can't do speech", as opposed to "the user said nothing". */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'language-not-supported']);

export const speechAvailable = () => !broken;
export const disableSpeech = () => (broken = true);

export interface Listening {
  /** Resolves with recogniser alternatives (possibly empty). */
  result: Promise<string[]>;
  stop(): void;
}

export function listen(lang: string, timeoutMs = 6000): Listening {
  if (broken || !Ctor) return { result: Promise.resolve([]), stop() {} };
  const rec = new Ctor();
  rec.lang = lang;
  rec.maxAlternatives = 5;
  rec.interimResults = false;
  rec.continuous = false;
  const alts: string[] = [];
  let timer = 0;
  const result = new Promise<string[]>((res) => {
    rec.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++)
        for (let j = 0; j < e.results[i].length; j++) alts.push(e.results[i][j].transcript);
    };
    rec.onerror = (e) => {
      if (FATAL.has(e.error)) broken = true;
    };
    rec.onend = () => {
      clearTimeout(timer);
      res(alts);
    };
    try {
      rec.start();
      timer = window.setTimeout(() => rec.stop(), timeoutMs);
    } catch {
      broken = true;
      res([]);
    }
  });
  return { result, stop: () => rec.stop() };
}

let narrationOn = true;
export const setNarration = (on: boolean) => {
  narrationOn = on;
  if (!on) speechSynthesis?.cancel();
};

/** Speak and resolve when done (or after a reading-time estimate if TTS is unavailable). */
export function narrate(text: string): Promise<void> {
  const estimate = Math.max(1400, text.split(/\s+/).length * 330);
  const synth = globalThis.speechSynthesis;
  if (!narrationOn || !synth) return new Promise((r) => setTimeout(r, estimate));
  return new Promise((res) => {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\*/g, ''));
    u.rate = 0.96;
    u.pitch = 1;
    const voice = synth.getVoices().find((v) => v.lang.startsWith('en') && /female|samantha|google uk|aria|jenny/i.test(v.name))
      ?? synth.getVoices().find((v) => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        res();
      }
    };
    u.onend = finish;
    u.onerror = finish;
    // Some engines never fire onend; never let narration block the flow.
    setTimeout(finish, estimate * 2 + 1500);
    synth.speak(u);
  });
}
