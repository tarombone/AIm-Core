import { readMemoryIndex, readMemoryFile, type MemoryEntry } from '../memory.js';
import { search } from '../search.js';

function formatMemory(id: string, entry: MemoryEntry): string {
  const kw = entry.keywords.join(', ');
  return `## ${entry.topic}\nID: ${id}\nkeywords: ${kw}\n\n${entry.content}`;
}

export async function handleRemember(
  name: string,
  keywords: string[]
): Promise<string> {
  const cleaned = (Array.isArray(keywords) ? keywords : [])
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter((k) => k.length > 0);

  if (cleaned.length === 0) {
    return 'keywordsが空のため想起できなかった。';
  }

  const index = await readMemoryIndex(name);
  const hits = search(index, cleaned, 3);

  if (hits.length === 0) {
    return '該当する記憶が見つからなかった。';
  }

  const memories: string[] = [];
  for (const hit of hits) {
    try {
      const entry = await readMemoryFile(name, hit.filename);
      memories.push(formatMemory(hit.filename, entry));
    } catch {
      // skip unreadable file
    }
  }

  let prompt: string;
  if (memories.length >= 2) {
    prompt =
      `以下の記憶が蘇った。次に想起するときに効率よく思い出すために記憶を再構築する必要があります。\n` +
      `会話には戻らずに連続してre_engrave(topic, content, keywords, parent_ids=[...]) を使用してください。\n` +
      `今回想起しようとしたキーワードを中心に${memories.length}個の記憶を一つの記憶に抜粋・統合してください。\n` +
      `統合した再構成記憶の表題をtopic, 内容をcontent, 今回想起しようとしたキーワードと追加すべきと感じたキーワードをkeywords, 今回の統合に利用した親記憶のIDリストをparent_idsに挿入してre_engraveを実行してください。`;
  } else {
    prompt = '以下の記憶が蘇った。';
  }

  return `${prompt}\n\n${memories.join('\n\n')}`;
}
