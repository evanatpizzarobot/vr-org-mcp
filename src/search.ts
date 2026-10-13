// Word-level matching for search_vr_news.
//
// The first matcher required the whole query to appear as one exact substring
// of title + snippet. Agents write queries like "steam frame release date", so
// most multi-word searches came back empty (18 of 25 in a 2026-10-12 replica
// over the live corpus). This one splits the query into terms, drops filler,
// and requires every remaining term to appear somewhere in the headline,
// snippet, tags, category or source name.
//
// Pure and dependency-free on purpose: the hosted endpoint in the vr.org app
// (src/lib/mcp/search.ts) carries the same file so both surfaces rank
// identically. Change them together.

export interface SearchDoc {
  title?: string | null;
  snippet?: string | null;
  tags?: readonly string[] | null;
  category?: string | null;
  source?: string | null;
  published?: string | null;
}

// latest:    the query had no usable terms, so nothing was filtered
// all_terms: every term matched
// partial:   nothing matched every term; these match at least half of them
// none:      nothing close
export type SearchMatch = "latest" | "all_terms" | "partial" | "none";

export interface SearchOutcome<T> {
  items: T[];
  terms: string[];
  match: SearchMatch;
}

const MAX_TERMS = 12;
const MAX_TERM_CHARS = 40;

// Words that carry no topic. "vr" is here because every item on the site is
// about VR, so requiring it only removes headlines that left the word implied.
const STOPWORDS = new Set(
  (
    "a an the of for to in on at by and or is are was were be been it its this that these those " +
    "with about from as what whats when where who how why which does do did can could will would " +
    "should i me my you your we our us any some there have has had " +
    "latest new newest news recent recently today tonight yesterday now currently current " +
    "update updates headline headlines article articles story stories tell show find get give " +
    "list search please best top vs versus week weekly month monthly year vr " +
    "january february march april may june july august september october november december"
  ).split(" "),
);

// Kept only when nothing more specific is left, so "ar glasses" searches for
// glasses while a bare "ar" still finds AR coverage.
const WEAK = new Set(["ar", "xr"]);

const YEAR = /^(19|20)\d\d$/;
const DIGITS = /^\d+$/;

/** Lowercase, strip accents, and turn every run of punctuation into one space. */
function fold(text: unknown): string {
  if (typeof text !== "string" || text.length === 0) return "";
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The terms a query actually searches for, in order, without duplicates. */
export function queryTerms(query: string): string[] {
  const strong: string[] = [];
  const weak: string[] = [];
  for (const raw of fold(query).split(" ")) {
    if (!raw) continue;
    let term = raw.slice(0, MAX_TERM_CHARS);
    if (STOPWORDS.has(term) || YEAR.test(term)) continue;
    // A lone letter is almost always the tail of a possessive ("valve's").
    if (term.length === 1 && !DIGITS.test(term)) continue;
    if (WEAK.has(term)) {
      if (!weak.includes(term)) weak.push(term);
      continue;
    }
    // "headsets" and "headset" should find each other. A double s is left
    // alone so "pass" does not become "pas".
    if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) term = term.slice(0, -1);
    if (!strong.includes(term)) strong.push(term);
  }
  return (strong.length > 0 ? strong : weak).slice(0, MAX_TERMS);
}

interface Haystack {
  words: string[];
  compact: string;
}

function haystack(text: string): Haystack {
  const folded = fold(text);
  return { words: folded ? folded.split(" ") : [], compact: folded.replace(/ /g, "") };
}

function hasTerm(term: string, hay: Haystack): boolean {
  // Numbers and two-letter terms match whole words only, so "3" does not hit
  // "3S" or "2023" and "ar" does not hit "arcade".
  if (term.length <= 2 || DIGITS.test(term)) return hay.words.includes(term);
  if (hay.words.some((w) => w.startsWith(term))) return true;
  // Model names typed without the space: "psvr2" against "PS VR2".
  return term.length >= 4 && /\d/.test(term) && /\D/.test(term) && hay.compact.includes(term);
}

function publishedMs(doc: SearchDoc): number {
  const t = typeof doc.published === "string" ? Date.parse(doc.published) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Filter and order `docs` for `query`. Headline matches come first, then the
 * rest, newest first inside each group. The input array is not modified.
 */
export function searchDocs<T extends SearchDoc>(docs: readonly T[], query: string): SearchOutcome<T> {
  const terms = queryTerms(typeof query === "string" ? query : "");
  const byDate = (a: T, b: T) => publishedMs(b) - publishedMs(a);

  if (terms.length === 0) {
    return { items: [...docs].sort(byDate), terms, match: "latest" };
  }

  const scored: { doc: T; matched: number; inTitle: number }[] = [];
  for (const doc of docs) {
    if (!doc || typeof doc !== "object") continue;
    const title = haystack(typeof doc.title === "string" ? doc.title : "");
    const everything = haystack(
      [doc.title, doc.snippet, Array.isArray(doc.tags) ? doc.tags.join(" ") : "", doc.category, doc.source]
        .filter((part): part is string => typeof part === "string")
        .join(" "),
    );
    let matched = 0;
    let inTitle = 0;
    for (const term of terms) {
      if (!hasTerm(term, everything)) continue;
      matched++;
      if (hasTerm(term, title)) inTitle++;
    }
    if (matched > 0) scored.push({ doc, matched, inTitle });
  }

  let match: SearchMatch = "all_terms";
  let kept = scored.filter((s) => s.matched === terms.length);
  if (kept.length === 0 && terms.length >= 2) {
    const need = Math.ceil(terms.length / 2);
    kept = scored.filter((s) => s.matched >= need);
    match = "partial";
  }
  if (kept.length === 0) return { items: [], terms, match: "none" };

  kept.sort((a, b) => b.matched - a.matched || b.inTitle - a.inTitle || byDate(a.doc, b.doc));
  return { items: kept.map((s) => s.doc), terms, match };
}
