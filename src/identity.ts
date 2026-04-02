import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface Identity {
  version: string;
  name: string;
  partner: string;
  first_person: string;
  created_at: string;
  updated_at: string;
  engrave_count_since_last_update: number;
}

export function getAimDir(name: string): string {
  return path.join(os.homedir(), '.aim', name);
}

export async function readIdentity(name: string): Promise<Identity> {
  const dir = getAimDir(name);
  const data = await fs.readFile(path.join(dir, 'identity.json'), 'utf-8');
  return JSON.parse(data) as Identity;
}

export async function readSelfText(name: string): Promise<string> {
  const dir = getAimDir(name);
  try {
    return await fs.readFile(path.join(dir, 'self.md'), 'utf-8');
  } catch {
    return '';
  }
}

export async function writeSelfText(name: string, text: string): Promise<void> {
  const dir = getAimDir(name);
  await fs.writeFile(path.join(dir, 'self.md'), text, 'utf-8');
}

export async function backupSelfText(name: string): Promise<void> {
  const dir = getAimDir(name);
  const selfPath = path.join(dir, 'self.md');
  try {
    const current = await fs.readFile(selfPath, 'utf-8');
    const selfHistoryDir = path.join(dir, 'self_history');
    await fs.mkdir(selfHistoryDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(path.join(selfHistoryDir, `${timestamp}.md`), current, 'utf-8');
  } catch {
    // no existing self.md, skip backup
  }
}

export async function writeSelfTextWithBackup(name: string, text: string): Promise<void> {
  await backupSelfText(name);
  await writeSelfText(name, text);
}

export async function writeIdentityRaw(name: string, identity: Identity): Promise<void> {
  const dir = getAimDir(name);
  identity.updated_at = new Date().toISOString();
  await fs.writeFile(
    path.join(dir, 'identity.json'),
    JSON.stringify(identity, null, 2),
    'utf-8'
  );
}

export async function backupIdentity(name: string, identity: Identity): Promise<void> {
  const dir = getAimDir(name);
  const historyDir = path.join(dir, 'identity_history');
  await fs.mkdir(historyDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.writeFile(
    path.join(historyDir, `${timestamp}.json`),
    JSON.stringify(identity, null, 2),
    'utf-8'
  );
}

export async function writeIdentityWithBackup(name: string, identity: Identity): Promise<void> {
  const current = await readIdentity(name);
  await backupIdentity(name, current);
  await backupSelfText(name);
  await writeIdentityRaw(name, identity);
}

export async function rollbackIdentity(name: string): Promise<string> {
  const dir = getAimDir(name);
  const historyDir = path.join(dir, 'identity_history');

  let files: string[];
  try {
    files = await fs.readdir(historyDir);
  } catch {
    throw new Error('履歴が見つかりません');
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
  if (jsonFiles.length === 0) {
    throw new Error('履歴が見つかりません');
  }

  const latest = jsonFiles[jsonFiles.length - 1];
  const data = await fs.readFile(path.join(historyDir, latest), 'utf-8');
  const identity = JSON.parse(data) as Identity;

  await writeIdentityRaw(name, identity);
  await fs.unlink(path.join(historyDir, latest));

  return latest;
}
