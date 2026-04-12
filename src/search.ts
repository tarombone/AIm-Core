import { loadDefaultJapaneseParser } from 'budoux';
import type { MemoryIndex } from './memory.js';

const parser = loadDefaultJapaneseParser();

// Common Japanese particles and single-char function words to exclude
const STOP_WORDS = new Set([
  // Particles
  'は', 'が', 'を', 'に', 'で', 'と', 'の', 'も', 'へ', 'か', 'な', 'ね', 'よ', 'わ', 'さ',
  'から', 'まで', 'より', 'や', 'て',
  // Auxiliary verbs / conjunctions
  'し', 'い', 'う', 'た', 'だ', 'ない', 'ある', 'いる', 'する', 'なる', 'できる',
  'です', 'ます', 'した', 'いた', 'でも', 'まし', 'でし', 'って', 'ため',
  // Pronouns / demonstratives
  'こと', 'もの', 'これ', 'それ', 'あれ', 'ここ', 'そこ', 'あそこ', 'どこ',
  'この', 'その', 'あの', 'どの', 'という',
]);

// Trailing Japanese particles to strip from segments
const TRAILING_PATTERN = /(から|まで|より|って|ても|では|には|ない|ます|です|した|いた|られ|させ|せる|てい)$/;
const TRAILING_CHAR = /[はがをにでとものへかなよねわさたいう。、！？!?,.…]$/;

function stripTrailingParticles(s: string): string {
  let r = s.replace(TRAILING_PATTERN, '');
  r = r.replace(TRAILING_CHAR, '');
  r = r.replace(TRAILING_CHAR, ''); // run twice for cases like "行った。"
  return r.trim();
}

export function tokenize(text: string): string[] {
  const normalized = text.replace(/([a-zA-Z0-9_])([^\sa-zA-Z0-9_.,!?])/g, '$1 $2')
    .replace(/([^\sa-zA-Z0-9_.,!?])([a-zA-Z0-9_])/g, '$1 $2');
  const parts = normalized.split(/[\s。、！？!?,…・\n\r\t「」『』【】（）()]/);
  const seen = new Set<string>();
  const tokens: string[] = [];

  function add(t: string) {
    if (t.length >= 1 && !STOP_WORDS.has(t) && !seen.has(t)) {
      seen.add(t);
      tokens.push(t);
    }
  }

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const segments = parser.parse(trimmed);
    for (const seg of segments) {
      const t = seg.trim();
      if (!t) continue;
      const stripped = stripTrailingParticles(t);
      add(stripped || t);
    }
  }

  return tokens;
}

export function computeTF(tokens: string[]): { counts: Map<string, number>; length: number } {
  const counts = new Map<string, number>();
  for (const t of tokens) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return { counts, length: tokens.length };
}

export function updateIndex(
  index: MemoryIndex,
  filename: string,
  topic: string,
  content: string,
  createdAt: string
): void {
  const tokens = tokenize(topic + ' ' + content);
  const { counts, length } = computeTF(tokens);

  index.documents[filename] = { created_at: createdAt, topic, length };

  for (const [term, count] of counts) {
    if (!index.index[term]) {
      index.index[term] = {};
    }
    index.index[term][filename] = count;
  }
}

function recencyDecay(createdAt: string, halfLifeDays = 180): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export interface SearchResult {
  filename: string;
  topic: string;
  score: number;
}

export function search(
  index: MemoryIndex,
  query: string,
  topK = 5
): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const docs = index.documents;
  const docNames = Object.keys(docs);
  const totalDocs = docNames.length;
  if (totalDocs === 0) return [];

  const avgDl = docNames.reduce((sum, d) => sum + (docs[d].length || 1), 0) / totalDocs;
  const k1 = 1.2;
  const b = 0.75;

  const scores = new Map<string, number>();

  for (const term of queryTokens) {
    const posting = index.index[term];
    if (!posting) continue;

    const df = Object.keys(posting).length;
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

    for (const [filename, rawCount] of Object.entries(posting)) {
      const doc = docs[filename];
      const dl = doc?.length || 1;
      const tf = (rawCount * (k1 + 1)) / (rawCount + k1 * (1 - b + b * dl / avgDl));
      const decay = doc ? recencyDecay(doc.created_at) : 1;
      const score = idf * tf * decay;
      scores.set(filename, (scores.get(filename) ?? 0) + score);
    }
  }

  const results: SearchResult[] = [];
  for (const [filename, score] of scores) {
    const doc = docs[filename];
    results.push({ filename, topic: doc?.topic ?? '', score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}
