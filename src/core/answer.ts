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
      // Romaji: allow one slip on longer words ("necko" for "neko"), exact for short ones ("hon").
      const words = raw.normalize('NFKC').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const candidates = [t, ...words];
      const slack = a.length >= 4 ? 1 : 0;
      return candidates.some((c) => c === a || (isLatin(c) && levenshtein(c, a) <= slack));
    });
  });
}
