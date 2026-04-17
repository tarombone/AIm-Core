import type { MemoryEntry, MemoryIndex } from './memory.js';

export interface SearchResult {
  filename: string;
  topic: string;
  keywords: string[];
  depth: number;
  origin: string;
  score: number;
}

const DEPTH_DECAY_BASE = 0.7;
const RECENCY_HALF_LIFE_DAYS = 180;

export function updateIndex(
  index: MemoryIndex,
  filename: string,
  entry: MemoryEntry
): void {
  index.documents[filename] = {
    created_at: entry.created_at,
    topic: entry.topic,
    keywords: entry.keywords,
    depth: entry.depth,
    origin: entry.origin,
  };

  for (const keyword of entry.keywords) {
    if (!keyword) continue;
    if (!index.index[keyword]) {
      index.index[keyword] = [];
    }
    if (!index.index[keyword].includes(filename)) {
      index.index[keyword].push(filename);
    }
  }
}

export function removeFromIndex(index: MemoryIndex, filename: string): void {
  delete index.documents[filename];
  for (const keyword of Object.keys(index.index)) {
    index.index[keyword] = index.index[keyword].filter((f) => f !== filename);
    if (index.index[keyword].length === 0) {
      delete index.index[keyword];
    }
  }
}

// Find postings for a query keyword. Scans every index key and merges the
// postings from those that contain the query keyword as a substring (exact
// match is the special case of containing itself). This lets a short query
// (e.g. "npm") surface memories both tagged exactly with "npm" AND those
// whose keyword is a longer phrase containing "npm" (e.g. old migrated
// memories that carry the topic string as their sole keyword).
function findQueryPosting(index: MemoryIndex, keyword: string): string[] {
  const merged = new Set<string>();
  for (const k of Object.keys(index.index)) {
    if (k.includes(keyword)) {
      const posting = index.index[k];
      if (!posting) continue;
      for (const f of posting) merged.add(f);
    }
  }
  return [...merged];
}

function depthDecay(depth: number): number {
  return Math.pow(DEPTH_DECAY_BASE, depth);
}

function recencyDecay(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

// Given a query keyword set, find related keywords via Jaccard overlap of posting lists.
// Returns a map keyword->weight (1.0 for direct match, <1.0 for expanded terms).
export function expandKeywords(
  index: MemoryIndex,
  queryKeywords: string[],
  expansionLimit = 5,
  expandedWeight = 0.4
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const k of queryKeywords) {
    if (k) weights.set(k, 1.0);
  }

  const querySet = new Set(queryKeywords);
  const candidates = new Map<string, number>();

  for (const qk of queryKeywords) {
    const posting = findQueryPosting(index, qk);
    if (posting.length === 0) continue;
    const postingSet = new Set(posting);

    for (const otherKey of Object.keys(index.index)) {
      if (querySet.has(otherKey)) continue;
      const other = index.index[otherKey];
      if (!other || other.length === 0) continue;

      let overlap = 0;
      for (const f of other) {
        if (postingSet.has(f)) overlap++;
      }
      if (overlap === 0) continue;

      const union = postingSet.size + other.length - overlap;
      const jaccard = overlap / union;
      const current = candidates.get(otherKey) ?? 0;
      if (jaccard > current) candidates.set(otherKey, jaccard);
    }
  }

  const sorted = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, expansionLimit);
  for (const [k, w] of sorted) {
    weights.set(k, w * expandedWeight);
  }

  return weights;
}

export function search(
  index: MemoryIndex,
  queryKeywords: string[],
  topK = 3,
  options: {
    expand?: boolean;
    minIndirectContributors?: number;
  } = {}
): SearchResult[] {
  if (queryKeywords.length === 0) return [];

  const { expand = true, minIndirectContributors = 2 } = options;

  const weights = expand
    ? expandKeywords(index, queryKeywords)
    : new Map(queryKeywords.filter((k) => k).map((k) => [k, 1.0]));

  const querySet = new Set(queryKeywords.filter((k) => k));
  const scores = new Map<string, number>();
  const contributors = new Map<string, Set<string>>();

  for (const [keyword, weight] of weights) {
    // Query keywords get substring-aware lookup; expanded keywords are always
    // index keys themselves, so exact lookup is sufficient (and cheaper).
    const posting = querySet.has(keyword)
      ? findQueryPosting(index, keyword)
      : index.index[keyword] ?? [];
    if (posting.length === 0) continue;
    for (const filename of posting) {
      const doc = index.documents[filename];
      if (!doc) continue;
      const decay = depthDecay(doc.depth) * recencyDecay(doc.created_at);
      scores.set(filename, (scores.get(filename) ?? 0) + weight * decay);
      if (!contributors.has(filename)) contributors.set(filename, new Set());
      contributors.get(filename)!.add(keyword);
    }
  }

  // Filter: direct match always surfaces; indirect-only needs ≥ minIndirectContributors
  // distinct contributing keywords.
  const results: SearchResult[] = [];
  for (const [filename, score] of scores) {
    const doc = index.documents[filename];
    const contribs = contributors.get(filename) ?? new Set<string>();
    const hasDirect = [...contribs].some((k) => querySet.has(k));
    if (!hasDirect && contribs.size < minIndirectContributors) continue;
    results.push({
      filename,
      topic: doc.topic,
      keywords: doc.keywords,
      depth: doc.depth,
      origin: doc.origin,
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}
