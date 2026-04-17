import { readIdentity, writeIdentityRaw } from '../identity.js';
import {
  saveMemory,
  readMemoryIndex,
  writeMemoryIndex,
  incrementDepth,
  type MemoryEntry,
} from '../memory.js';
import { updateIndex } from '../search.js';

export async function handleReEngrave(
  name: string,
  topic: string,
  content: string,
  keywords: string[],
  parent_ids: string[]
): Promise<string> {
  const cleanedKeywords = (Array.isArray(keywords) ? keywords : [])
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter((k) => k.length > 0);

  if (cleanedKeywords.length === 0) {
    throw new Error('keywordsを1つ以上指定してください');
  }

  const cleanedParents = (Array.isArray(parent_ids) ? parent_ids : [])
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0);

  if (cleanedParents.length === 0) {
    throw new Error('parent_idsを1つ以上指定してください（rememberで得たid）');
  }

  const index = await readMemoryIndex(name);

  for (const pid of cleanedParents) {
    if (!index.documents[pid]) {
      throw new Error(`親記憶が見つからない: ${pid}`);
    }
  }

  const entry: MemoryEntry = {
    topic,
    content,
    keywords: cleanedKeywords,
    origin: 'reconstructed',
    depth: 0,
    parents: cleanedParents,
    created_at: new Date().toISOString(),
  };

  const filename = await saveMemory(name, entry);

  updateIndex(index, filename, entry);
  await incrementDepth(name, cleanedParents, index);
  await writeMemoryIndex(name, index);

  const identity = await readIdentity(name);
  await writeIdentityRaw(name, identity);

  return '記憶を思い出しました。会話に戻りましょう！';
}
