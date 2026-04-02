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
  // Pre-split on spaces and punctuation to help budoux
  const parts = text.split(/[\s。、！？!?,…・\n\r\t「」『』【】（）()]/);
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
      add(t);
      // Also add stripped version (remove trailing particles)
      const stripped = stripTrailingParticles(t);
      if (stripped && stripped !== t) {
        add(stripped);
      }
    }
  }

  return tokens;
}

export function computeTF(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const tf = new Map<string, number>();
  const total = tokens.length || 1;
  for (const [term, count] of counts) {
    tf.set(term, count / total);
  }
  return tf;
}

export function updateIndex(
  index: MemoryIndex,
  filename: string,
  topic: string,
  content: string,
  createdAt: string
): void {
  index.documents[filename] = { created_at: createdAt, topic };

  const tokens = tokenize(topic + ' ' + content);
  const tf = computeTF(tokens);

  for (const [term, tfScore] of tf) {
    if (!index.index[term]) {
      index.index[term] = {};
    }
    index.index[term][filename] = tfScore;
  }
}

function recencyDecay(createdAt: string, halfLifeDays = 30): number {
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

  const totalDocs = Object.keys(index.documents).length;
  if (totalDocs === 0) return [];

  const scores = new Map<string, number>();

  for (const term of queryTokens) {
    const posting = index.index[term];
    if (!posting) continue;

    const df = Object.keys(posting).length;
    const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;

    for (const [filename, tf] of Object.entries(posting)) {
      const doc = index.documents[filename];
      const decay = doc ? recencyDecay(doc.created_at) : 1;
      const score = tf * idf * decay;
      scores.set(filename, (scores.get(filename) ?? 0) + score);
    }
  }

  const results: SearchResult[] = [];
  for (const [filename, score] of scores) {
    const doc = index.documents[filename];
    results.push({ filename, topic: doc?.topic ?? '', score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}
