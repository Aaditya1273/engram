/** Spoken-answer checking. The recogniser runs in ja-JP, so it may return kanji, kana or romaji. */

export function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    // katakana → hiragana
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const isLatin = (s: string) => /^[a-z0-9]+$/.test(s);

/** True if any recogniser alternative contains one of the accepted answers. */
export function answerMatches(transcripts: string[], answers: string[]): boolean {
  const accepted = answers.map(normalise).filter(Boolean);
  return transcripts.some((raw) => {
    const t = normalise(raw);
    if (!t) return false;
    return accepted.some((a) => {
      if (!isLatin(a)) return t.includes(a);
      // Latin script: one slip on longer answers ("necko" for "neko"), two on long ones, exact on short ones ("hon").
      // Multi-word answers may sit inside a longer sentence ("it's the vagus nerve").
      const words = raw.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const n = Math.max(1, Math.round(a.length / 5));
      const windows = words.flatMap((_, i) => [1, 2, 3, 4].map((k) => words.slice(i, i + k).join('')));
      const slack = a.length >= 9 ? 2 : a.length >= 4 ? 1 : 0;
      if (a.length >= 6 && t.includes(a)) return true;
      return [t, ...windows].some((c) => c === a || (isLatin(c) && Math.abs(c.length - a.length) <= n && levenshtein(c, a) <= slack));
    });
  });
}
