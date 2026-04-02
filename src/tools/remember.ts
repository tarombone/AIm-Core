import { readMemoryIndex, readMemoryFile } from '../memory.js';
import { search } from '../search.js';

export async function handleRemember(name: string, query: string): Promise<string> {
  const index = await readMemoryIndex(name);
  const results = search(index, query, 5);

  if (results.length === 0) {
    return '該当する記憶が見つからなかった。';
  }

  const parts: string[] = [];
  for (const result of results) {
    try {
      const entry = await readMemoryFile(name, result.filename);
      parts.push(`【${entry.topic}】\n${entry.content}`);
    } catch {
      parts.push(`【${result.topic}】（読み込みエラー）`);
    }
  }

  return parts.join('\n\n---\n\n');
}
