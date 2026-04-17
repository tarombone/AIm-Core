import fs from 'fs/promises';
import path from 'path';
import { getAimDir } from './identity.js';
import { updateIndex } from './search.js';

const CURRENT_INDEX_VERSION = '3';

export type MemoryOrigin = 'engraved' | 'reconstructed';

export interface MemoryEntry {
  topic: string;
  content: string;
  keywords: string[];
  origin: MemoryOrigin;
  depth: number;
  parents?: string[];
  created_at: string;
}

export interface IndexedDocument {
  created_at: string;
  topic: string;
  keywords: string[];
  depth: number;
  origin: MemoryOrigin;
}

export interface MemoryIndex {
  version: string;
  documents: {
    [filename: string]: IndexedDocument;
  };
  // keyword → filenames (posting list)
  index: {
    [keyword: string]: string[];
  };
}

export async function saveMemory(
  name: string,
  entry: MemoryEntry
): Promise<string> {
  const dir = getAimDir(name);
  const memoryDir = path.join(dir, 'memory');
  await fs.mkdir(memoryDir, { recursive: true });

  const ts = new Date(entry.created_at)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', 'T')
    .slice(0, 15);
  const sanitized = entry.topic.replace(/[/\\:*?"<>|]/g, '_').slice(0, 50);
  const filename = `${ts}-${sanitized}.json`;

  await fs.writeFile(
    path.join(memoryDir, filename),
    JSON.stringify(entry, null, 2),
    'utf-8'
  );

  return filename;
}

export async function readMemoryIndex(name: string): Promise<MemoryIndex> {
  const dir = getAimDir(name);
  let index: MemoryIndex;
  try {
    const data = await fs.readFile(path.join(dir, 'memory_index.json'), 'utf-8');
    index = JSON.parse(data) as MemoryIndex;
  } catch {
    return { version: CURRENT_INDEX_VERSION, documents: {}, index: {} };
  }

  if (index.version !== CURRENT_INDEX_VERSION) {
    index = await rebuildIndex(name);
    await writeMemoryIndex(name, index);
  }

  return index;
}

async function rebuildIndex(name: string): Promise<MemoryIndex> {
  const index: MemoryIndex = { version: CURRENT_INDEX_VERSION, documents: {}, index: {} };
  const files = await listMemoryFiles(name);
  for (const filename of files) {
    try {
      const entry = await readMemoryFile(name, filename);
      updateIndex(index, filename, entry);
    } catch {
      // skip corrupted files
    }
  }
  return index;
}

export async function writeMemoryIndex(name: string, index: MemoryIndex): Promise<void> {
  const dir = getAimDir(name);
  await fs.writeFile(
    path.join(dir, 'memory_index.json'),
    JSON.stringify(index, null, 2),
    'utf-8'
  );
}

export async function getLatestMemory(name: string): Promise<MemoryEntry | null> {
  const dir = getAimDir(name);
  const memoryDir = path.join(dir, 'memory');
  try {
    const files = (await fs.readdir(memoryDir)).filter((f) => f.endsWith('.json')).sort();
    if (files.length === 0) return null;
    return await readMemoryFile(name, files[files.length - 1]);
  } catch {
    return null;
  }
}

// Read a memory file with defaults filled in for older formats.
export async function readMemoryFile(name: string, filename: string): Promise<MemoryEntry> {
  const dir = getAimDir(name);
  const data = await fs.readFile(path.join(dir, 'memory', filename), 'utf-8');
  const raw = JSON.parse(data) as Partial<MemoryEntry> & { [k: string]: unknown };

  const topic = typeof raw.topic === 'string' ? raw.topic : '';
  const content = typeof raw.content === 'string' ? raw.content : '';
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter((k): k is string => typeof k === 'string')
    : topic ? [topic] : [];
  const origin: MemoryOrigin = raw.origin === 'reconstructed' ? 'reconstructed' : 'engraved';
  const depth = typeof raw.depth === 'number' ? raw.depth : 0;
  const parents = Array.isArray(raw.parents)
    ? raw.parents.filter((p): p is string => typeof p === 'string')
    : undefined;
  const created_at = typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString();

  return { topic, content, keywords, origin, depth, parents, created_at };
}

export async function listMemoryFiles(name: string): Promise<string[]> {
  const dir = getAimDir(name);
  const memoryDir = path.join(dir, 'memory');
  try {
    const files = await fs.readdir(memoryDir);
    return files.filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

// Increment depth of each given memory. If an index is passed, its in-memory cache is
// kept in sync (but the caller is responsible for writing it back).
export async function incrementDepth(
  name: string,
  filenames: string[],
  index?: MemoryIndex
): Promise<void> {
  const dir = getAimDir(name);
  for (const filename of filenames) {
    try {
      const entry = await readMemoryFile(name, filename);
      entry.depth += 1;
      await fs.writeFile(
        path.join(dir, 'memory', filename),
        JSON.stringify(entry, null, 2),
        'utf-8'
      );
      if (index && index.documents[filename]) {
        index.documents[filename].depth = entry.depth;
      }
    } catch {
      // skip missing files
    }
  }
}
