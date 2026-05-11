/**
 * Fuzzy matching for Autocomplete inputs.
 *
 * Mirrors the Python behaviour:
 *   - rapidfuzz.fuzz.partial_ratio  → partialRatio()
 *   - resolve_and_select            → resolveFuzzy()
 *
 * Plus MUI-specific `createFuzzyFilter` factory that returns a
 * `filterOptions` function ready to drop into <Autocomplete>.
 */

// ---------- normalisers (strip Thai prefixes) ----------

const PERSON_PREFIXES = [
  "นางสาว",
  "น.ส.",
  "น.ส",
  "นส.",
  "นส",
  "นาง",
  "นาย",
  "ดร.",
  "ศ.",
  "ผศ.",
  "รศ.",
  "คุณ",
];

const COMPANY_NOISE = [
  "บริษัท",
  "หลักทรัพย์",
  "จำกัด",
  "(มหาชน)",
  "บมจ.",
  "บมจ",
  "บจก.",
  "บจก",
  "บจ.",
  "บจ",
  "บล.",
  "บล",
];

function stripPrefixes(text: string, prefixes: string[]): string {
  let s = text.trim();
  for (const p of prefixes) {
    if (s.startsWith(p)) {
      s = s.slice(p.length).trim();
    }
  }
  return s.trim();
}

function stripNoise(text: string, noises: string[]): string {
  let s = text.trim();
  for (const n of noises) {
    s = s.replaceAll(n, " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

export function normalizePersonInput(raw: string): string {
  return stripPrefixes(raw.trim(), PERSON_PREFIXES);
}

export function normalizeCompanyInput(raw: string): string {
  return stripNoise(raw.trim(), COMPANY_NOISE);
}

// ---------- Levenshtein distance ----------

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Use single-row DP for memory efficiency
  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);

  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,    // insert
        prev[j] + 1,        // delete
        prev[j - 1] + cost, // substitute
      );
    }
    [prev, curr] = [curr, prev]; // swap rows
  }

  return prev[lb];
}

// ---------- simple ratio ----------

function simpleRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 100;
  if (a.length === 0 || b.length === 0) return 0;
  const dist = levenshtein(a, b);
  return ((a.length + b.length - dist) / (a.length + b.length)) * 100;
}

// ---------- partial_ratio (mirrors rapidfuzz.fuzz.partial_ratio) ----------

/**
 * Slides the shorter string over the longer one, returning the best
 * `simpleRatio` across all windows — mirrors `rapidfuzz.fuzz.partial_ratio`.
 */
export function partialRatio(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();

  if (a === b) return 100;
  if (a.length === 0 || b.length === 0) return 0;

  // shorter slides over longer
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;

  if (shorter.length === longer.length) return simpleRatio(a, b);

  let best = 0;
  const windowLen = shorter.length;

  for (let i = 0; i <= longer.length - windowLen; i++) {
    const window = longer.substring(i, i + windowLen);
    const score = simpleRatio(shorter, window);
    if (score > best) best = score;
    if (best === 100) break; // can't do better
  }

  return best;
}

// ---------- resolve (mirrors resolve_and_select) ----------

export type FuzzyResult = {
  value: string;
  score: number;
};

/**
 * Score `query` against every item in `masterList` using `partialRatio`.
 * Returns top `topN` results sorted descending by score.
 *
 * Auto-resolve rules (mirrors Python `resolve_and_select`):
 *   - If top score >= `autoThreshold` (default 80) AND the gap between
 *     #1 and #2 >= `gapThreshold` (default 5), return only the top match.
 *   - Otherwise return all top-N suggestions.
 */
export function resolveFuzzy(
  query: string,
  masterList: string[],
  opts: {
    normalize?: (s: string) => string;
    topN?: number;
    autoThreshold?: number;
    gapThreshold?: number;
  } = {},
): FuzzyResult[] {
  const {
    normalize = (s: string) => s,
    topN = 10,
    autoThreshold = 80,
    gapThreshold = 5,
  } = opts;

  const nQuery = normalize(query);
  if (!nQuery) return [];

  // Score every item
  const scored: FuzzyResult[] = masterList.map((item) => ({
    value: item,
    score: partialRatio(nQuery, normalize(item)),
  }));

  // Sort descending
  scored.sort((a, b) => b.score - a.score);

  // Auto-resolve: if clear winner, return just that
  if (scored.length >= 1) {
    const top = scored[0];
    const second = scored.length >= 2 ? scored[1].score : 0;
    if (top.score >= autoThreshold && top.score - second >= gapThreshold) {
      return [top];
    }
  }

  // Return top N with score > 0
  return scored.filter((r) => r.score > 0).slice(0, topN);
}

// ---------- MUI Autocomplete filterOptions factory ----------

export type FilterKind = "person" | "company" | "lead" | "co";

/**
 * Returns a `filterOptions` function compatible with MUI <Autocomplete>.
 *
 * When the user types, it uses `partialRatio` to score every option against
 * the input string and returns the top matches (sorted by score desc).
 *
 * The `kind` controls which normaliser is applied:
 *   - "person" -> strips Thai name prefixes
 *   - "company" / "lead" / "co" -> strips company noise words
 */
export function createFuzzyFilter(kind: FilterKind, maxResults = 15) {
  const normalize =
    kind === "person" ? normalizePersonInput : normalizeCompanyInput;

  return (
    options: string[],
    state: { inputValue: string },
  ): string[] => {
    const input = state.inputValue.trim();
    if (!input) return options.slice(0, maxResults);

    const nInput = normalize(input);
    if (!nInput) return options.slice(0, maxResults);

    // Score all options
    const scored = options.map((opt) => ({
      opt,
      score: partialRatio(nInput, normalize(opt)),
    }));

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // Return top items that score above a minimum threshold
    return scored
      .filter((r) => r.score >= 30)
      .slice(0, maxResults)
      .map((r) => r.opt);
  };
}
