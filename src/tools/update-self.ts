import {
  readIdentity,
  writeIdentityRaw,
  writeSelfTextWithBackup,
} from '../identity.js';

export async function handleUpdateSelf(
  name: string,
  new_definition: string
): Promise<string> {
  if (typeof new_definition !== 'string' || new_definition.trim().length === 0) {
    throw new Error('new_definitionに新しい自己の定義の全文を渡してください');
  }

  await writeSelfTextWithBackup(name, new_definition);

  const identity = await readIdentity(name);
  await writeIdentityRaw(name, identity);

  return '自己の定義を更新しました。';
}
