import fs from 'fs/promises';
import path from 'path';
import { getAimDir } from './identity.js';

export interface MemoryEntry {
  topic: string;
  content: string;
  created_at: string;
}

export interface MemoryIndex {
  version: string;
  documents: {
    [filename: string]: {
      created_at: string;
      topic: string;
    };
  };
  // Stores TF per term per document. IDF is computed at query time.
  index: {
    [term: string]: {
      [filename: string]: number;
    };
  };
}

export async function saveMemory(
  name: string,
  topic: string,
  content: string
): Promise<string> {
  const dir = getAimDir(name);
  const memoryDir = path.join(dir, 'memory');
  await fs.mkdir(memoryDir, { recursive: true });

  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', 'T')
    .slice(0, 15);
  const sanitized = topic.replace(/[/\\:*?"<>|]/g, '_').slice(0, 50);
  const filename = `${ts}-${sanitized}.json`;

  const entry: MemoryEntry = {
    topic,
    content,
    created_at: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(memoryDir, filename),
    JSON.stringify(entry, null, 2),
    'utf-8'
  );

  return filename;
}

export async function readMemoryIndex(name: string): Promise<MemoryIndex> {
  const dir = getAimDir(name);
  try {
    const data = await fs.readFile(path.join(dir, 'memory_index.json'), 'utf-8');
    return JSON.parse(data) as MemoryIndex;
  } catch {
    return { version: '1', documents: {}, index: {} };
  }
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
    const data = await fs.readFile(
      path.join(memoryDir, files[files.length - 1]),
      'utf-8'
    );
    return JSON.parse(data) as MemoryEntry;
  } catch {
    return null;
  }
}

export async function readMemoryFile(name: string, filename: string): Promise<MemoryEntry> {
  const dir = getAimDir(name);
  const data = await fs.readFile(path.join(dir, 'memory', filename), 'utf-8');
  return JSON.parse(data) as MemoryEntry;
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
