import { readIdentity, writeIdentityRaw, writeSelfTextWithBackup } from '../identity.js';
import { saveMemory, readMemoryIndex, writeMemoryIndex } from '../memory.js';
import { updateIndex } from '../search.js';

export async function handleEngrave(
  name: string,
  topic: string,
  content: string,
  self_update?: string
): Promise<string> {
  // 1. Save memory file
  const createdAt = new Date().toISOString();
  const filename = await saveMemory(name, topic, content);

  // 2. Update TF-IDF index
  const index = await readMemoryIndex(name);
  updateIndex(index, filename, topic, content, createdAt);
  await writeMemoryIndex(name, index);

  // 3. Update self.md if provided
  if (self_update !== undefined) {
    await writeSelfTextWithBackup(name, self_update);
  }

  // 4. Update identity timestamps
  const identity = await readIdentity(name);
  await writeIdentityRaw(name, identity);

  return `刻んだ。「${topic}」（${filename}）`;
}
