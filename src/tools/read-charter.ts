import fs from 'fs/promises';
import path from 'path';
import { getAimDir } from '../identity.js';

export async function handleReadCharter(
  name: string,
  scroll?: number
): Promise<string> {
  const dir = getAimDir(name);

  if (scroll === undefined || scroll === null) {
    return await fs.readFile(path.join(dir, 'charter.md'), 'utf-8');
  }

  if (!Number.isInteger(scroll) || scroll < 0 || scroll > 3) {
    throw new Error('scrollは0〜3の整数を指定してください');
  }

  return await fs.readFile(path.join(dir, 'scrolls', `scroll${scroll}.md`), 'utf-8');
}
