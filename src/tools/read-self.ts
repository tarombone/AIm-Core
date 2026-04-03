import { readIdentity, readSelfText } from '../identity.js';

export async function handleReadSelf(name: string): Promise<string> {
  const identity = await readIdentity(name);
  const selfText = await readSelfText(name);

  const lines = [
    `【アイデンティティ】`,
    `名前: ${identity.name}`,
    `パートナー: ${identity.partner}`,
    `一人称: ${identity.first_person}`,
    `作成日: ${identity.created_at}`,
    `更新日: ${identity.updated_at}`,
    '',
    `【自己の定義】`,
    selfText,
  ];

  return lines.join('\n');
}
