/**
 * Headset name matching for compare_vr_headsets. Agents type shorthand
 * ("PSVR2", "Quest 3", "Vision Pro") that does not literally appear in the
 * catalog ("PlayStation VR2", "Meta Quest 3 (512GB)", "Apple Vision Pro (M5)").
 *
 * Two problems naive substring matching gets wrong:
 *   1. Aliases. "PSVR2" never substring-matches "PlayStation VR2".
 *   2. Greedy prefixes. "Quest 3" is a substring of "Quest 3S", so a plain
 *      includes() picks whichever appears first in the list.
 *
 * So we normalize known aliases, then score each candidate, preferring a
 * word-boundary hit (query bounded by non-alphanumerics) over a loose
 * substring, and the shorter catalog name on ties.
 */

const ALIASES: Array<[RegExp, string]> = [
  [/^ps\s*vr\s*2$|^psvr2$/i, "playstation vr2"],
  [/^ps\s*vr$|^psvr$/i, "playstation vr"],
  [/^avp$|^vision\s*pro$/i, "apple vision pro"],
  [/^galaxy\s*xr$|^moohan$/i, "samsung galaxy xr"],
  [/^beyond\s*2?$/i, "bigscreen beyond"],
  [/^pimax/i, "pimax crystal"],
  [/^vive\s*xr/i, "htc vive xr"],
];

function normalize(query: string): string {
  const q = query.trim().toLowerCase();
  for (const [re, canonical] of ALIASES) {
    if (re.test(q)) return canonical;
  }
  return q;
}

function boundedHit(haystack: string, needle: string): boolean {
  const i = haystack.indexOf(needle);
  if (i < 0) return false;
  const after = haystack[i + needle.length];
  // The char right after the match must not continue an alphanumeric token
  // (so "quest 3" does not count as a bounded hit inside "quest 3s").
  return after === undefined || !/[a-z0-9]/.test(after);
}

/**
 * Returns the index of the best-matching name, or null if nothing matches.
 */
export function matchHeadset(names: string[], query: string): number | null {
  const q = normalize(query);
  let bestIdx = -1;
  let bestScore = 0;
  let bestLen = Infinity;

  for (let idx = 0; idx < names.length; idx++) {
    const name = (names[idx] ?? "").toLowerCase();
    let score = 0;
    if (name === q) score = 1000;
    else if (boundedHit(name, q)) score = 100;
    else if (name.includes(q)) score = 50;
    else continue;

    if (score > bestScore || (score === bestScore && name.length < bestLen)) {
      bestIdx = idx;
      bestScore = score;
      bestLen = name.length;
    }
  }

  return bestIdx >= 0 ? bestIdx : null;
}
