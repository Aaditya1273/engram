/**
 * Speech in and out, both optional. Recognition uses the browser's recogniser where there is one, and
 * otherwise records the answer and has the server transcribe it (the Quest browser has no recogniser).
 * If both are missing or fail, the flows switch to pinchable choices for the rest of the session.
 * Narration is always captioned.
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

/** Server transcription, installed by the app once the cloud is reachable. */
type Transcriber = (audio: Blob, lang: string) => Promise<string[]>;
let transcriber: Transcriber | null = null;
let cloudBroken = false;
export const setTranscriber = (t: Transcriber | null) => (transcriber = t);
const canRecord = () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
const cloudAvailable = () => !!transcriber && !cloudBroken && canRecord();
/** Errors that mean "this device can't do speech", as opposed to "the user said nothing". */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'language-not-supported']);

export const speechAvailable = () => !broken || cloudAvailable();
export const disableSpeech = () => {
  broken = true;
  cloudBroken = true;
};

export interface Listening {
  /** Resolves with recogniser alternatives (possibly empty). */
  result: Promise<string[]>;
  stop(): void;
}

/** long: a talk, not an answer; keep listening through pauses until the timeout or stop(). */
export function listen(lang: string, timeoutMs = 6000, opts: { long?: boolean } = {}): Listening {
  if (broken || !Ctor) return cloudAvailable() ? record(lang, timeoutMs, opts.long ? LONG_SILENCE_MS : END_SILENCE_MS) : { result: Promise.resolve([]), stop() {} };
  const rec = new Ctor();
  rec.lang = lang;
  rec.maxAlternatives = opts.long ? 1 : 5;
  rec.interimResults = false;
  rec.continuous = !!opts.long;
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

let mic: Promise<MediaStream> | null = null;
/**
 * Ask for the microphone up front, only when it will be used: the browser can't recognise speech itself and
 * the server can transcribe. Otherwise nobody is asked for a microphone that nothing would listen to.
 */
export const warmMicrophone = (serverCanTranscribe: boolean) => {
  if (!Ctor && serverCanTranscribe && canRecord()) void microphone().catch(() => {});
};
/** One microphone stream for the session: asking again for every answer would re-prompt and add latency. */
function microphone() {
  mic ??= navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  mic.catch(() => (mic = null));
  return mic;
}

/** Loudness (RMS, 0..1) above which the clip counts as speech, and the quiet after it that ends the answer. */
const VOICE_RMS = 0.035, END_SILENCE_MS = 900, LONG_SILENCE_MS = 4000, MIN_SPEECH_MS = 150;
const MIC_WAIT_MS = 8000;

/**
 * Records until the speaker stops (or the timeout), then sends the clip to the server. Silence never
 * leaves the device: if nobody spoke, nothing is uploaded and the result is empty.
 */
function record(lang: string, timeoutMs: number, endSilenceMs: number): Listening {
  let stopRec = () => {};
  const result = (async (): Promise<string[]> => {
    let stream: MediaStream;
    try {
      // An unanswered permission prompt would wait forever; give it a few seconds, then fall back to choices.
      stream = await Promise.race([microphone(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no answer')), MIC_WAIT_MS))]);
    } catch {
      cloudBroken = true; // permission denied, ignored, or no microphone: stop offering voice
      return [];
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const ac = new AudioContext();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let spokeMs = 0, lastVoice = 0, last = performance.now();
    const done = new Promise<void>((res) => (rec.onstop = () => res()));
    stopRec = () => rec.state === 'recording' && rec.stop();
    rec.start(250);
    const started = performance.now();
    const tick = window.setInterval(() => {
      const now = performance.now();
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      if (Math.sqrt(sum / buf.length) > VOICE_RMS) {
        spokeMs += now - last;
        lastVoice = now;
      }
      last = now;
      if (now - started > timeoutMs || (spokeMs > MIN_SPEECH_MS && now - lastVoice > endSilenceMs)) stopRec();
    }, 50);
    await done;
    clearInterval(tick);
    void ac.close();
    if (spokeMs <= MIN_SPEECH_MS) return [];
    try {
      return await transcriber!(new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }), lang);
    } catch {
      return [];
    }
  })();
  return { result, stop: () => stopRec() };
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
