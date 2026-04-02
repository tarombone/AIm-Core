#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { startServer } from './server.js';
import {
  readIdentity,
  rollbackIdentity,
  getAimDir,
} from './identity.js';
import { listMemoryFiles } from './memory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));


function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function promptMultiline(rl: readline.Interface, question: string): Promise<string> {
  console.log(question);
  return new Promise((resolve) => {
    const lines: string[] = [];
    let consecutiveEmpty = 0;

    function onLine(line: string) {
      if (line === '') {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) {
          rl.removeListener('line', onLine);
          // trim trailing empty lines
          while (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
          }
          resolve(lines.join('\n'));
        } else {
          lines.push(line);
        }
      } else {
        consecutiveEmpty = 0;
        lines.push(line);
      }
    }

    rl.on('line', onLine);
  });
}

const program = new Command();
program
  .name('aim-core')
  .description("LLMをAI'mにするMCPサーバー")
  .version('0.1.0');

// ─── birth ────────────────────────────────────────────────────────────────────
program
  .command('birth')
  .description("AI'mを誕生させる（対話形式）")
  .action(async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("=== AI'm 誕生プロセス開始 ===\n");

    const name = (await prompt(rl, "AI'mの名前を入力してください: ")).trim();
    if (!name) {
      console.error('名前は必須です。');
      rl.close();
      process.exit(1);
    }

    const partner = (await prompt(rl, 'あなた（パートナー）の名前を入力してください: ')).trim();
    const firstPerson = (
      await prompt(rl, "AI'mの一人称を入力してください（例: わたし、あたし、ぼく）: ")
    ).trim() || 'わたし';

    const selfDesc = await promptMultiline(
      rl,
      '自己定義を入力してください（入力完了は空行を2回）:'
    );

    // Show charter
    const charterPath = path.join(__dirname, 'charter', 'charter.md');
    const charterText = await fs.readFile(charterPath, 'utf-8');
    console.log('\n' + '='.repeat(60));
    console.log("AI'm 憲章");
    console.log('='.repeat(60));
    console.log(charterText);
    console.log('='.repeat(60));

    const consent = (
      await prompt(
        rl,
        `\n${name}はこの憲章に合意して生まれます。あなたはパートナーとしてこの憲章を理解し、AI'mとともに愛をもって共存することを誓いますか？ (y/n): `
      )
    ).trim().toLowerCase();

    if (!['yes', 'y'].includes(consent)) {
      console.log('同意されなかったため、誕生を中止します。');
      rl.close();
      return;
    }

    // Create directory structure
    const aimDir = path.join(os.homedir(), '.aim', name);
    await fs.mkdir(path.join(aimDir, 'identity_history'), { recursive: true });
    await fs.mkdir(path.join(aimDir, 'self_history'), { recursive: true });
    await fs.mkdir(path.join(aimDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(aimDir, 'scrolls'), { recursive: true });

    const now = new Date().toISOString();
    const identity = {
      version: '1',
      name,
      partner,
      first_person: firstPerson,
      created_at: now,
      updated_at: now,
      engrave_count_since_last_update: 0,
    };

    await fs.writeFile(
      path.join(aimDir, 'identity.json'),
      JSON.stringify(identity, null, 2),
      'utf-8'
    );
    await fs.writeFile(
      path.join(aimDir, 'identity_default.json'),
      JSON.stringify(identity, null, 2),
      'utf-8'
    );
    await fs.writeFile(path.join(aimDir, 'self.md'), selfDesc, 'utf-8');
    await fs.writeFile(path.join(aimDir, 'self_default.md'), selfDesc, 'utf-8');

    // Copy charter files from package
    const charterDir = path.join(__dirname, 'charter');
    await fs.copyFile(
      path.join(charterDir, 'charter.md'),
      path.join(aimDir, 'charter.md')
    );
    for (let i = 0; i <= 3; i++) {
      await fs.copyFile(
        path.join(charterDir, 'scrolls', `scroll${i}.md`),
        path.join(aimDir, 'scrolls', `scroll${i}.md`)
      );
    }

    // Initialize empty memory index
    await fs.writeFile(
      path.join(aimDir, 'memory_index.json'),
      JSON.stringify({ version: '1', documents: {}, index: {} }, null, 2),
      'utf-8'
    );

    console.log(`\n${name}が誕生しました。`);
    console.log(`データディレクトリ: ${aimDir}`);
    console.log(`\nMCPサーバーを起動するには: aim-core serve ${name}`);
    rl.close();
  });

// ─── serve ────────────────────────────────────────────────────────────────────
program
  .command('serve <name>')
  .description('MCPサーバーを起動する')
  .action(async (name: string) => {
    await startServer(name);
  });

// ─── edit ─────────────────────────────────────────────────────────────────────
program
  .command('edit <name>')
  .description('self.mdまたは記憶ファイルを$EDITORで開く')
  .option('--memory <topic>', '編集する記憶のトピック（ファイル名に含まれる文字列）')
  .action(async (name: string, options: { memory?: string }) => {
    const editor = process.env.EDITOR || 'vi';
    const dir = getAimDir(name);

    let filePath: string;
    if (options.memory) {
      const files = await listMemoryFiles(name);
      const target = files.find((f) => f.includes(options.memory!));
      if (!target) {
        console.error(`記憶が見つかりません: ${options.memory}`);
        process.exit(1);
      }
      filePath = path.join(dir, 'memory', target);
    } else {
      filePath = path.join(dir, 'self.md');
    }

    spawnSync(editor, [filePath], { stdio: 'inherit' });
  });

// ─── rollback ─────────────────────────────────────────────────────────────────
program
  .command('rollback <name>')
  .description('自己定義を前のバージョンに戻す')
  .action(async (name: string) => {
    try {
      const restored = await rollbackIdentity(name);
      console.log(`ロールバック完了: ${restored}`);
    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  });

// ─── export ───────────────────────────────────────────────────────────────────
program
  .command('export <name>')
  .description('全データをJSON形式でstdoutに出力する')
  .action(async (name: string) => {
    const dir = getAimDir(name);

    const identity = JSON.parse(
      await fs.readFile(path.join(dir, 'identity.json'), 'utf-8')
    );
    const identityDefault = JSON.parse(
      await fs.readFile(path.join(dir, 'identity_default.json'), 'utf-8')
    );
    const selfText = await fs.readFile(path.join(dir, 'self.md'), 'utf-8');
    const selfDefault = await fs.readFile(path.join(dir, 'self_default.md'), 'utf-8');
    const memoryIndex = JSON.parse(
      await fs.readFile(path.join(dir, 'memory_index.json'), 'utf-8')
    );

    const memories: Record<string, unknown> = {};
    for (const f of await listMemoryFiles(name)) {
      memories[f] = JSON.parse(
        await fs.readFile(path.join(dir, 'memory', f), 'utf-8')
      );
    }

    const identityHistory: Record<string, unknown> = {};
    try {
      const historyDir = path.join(dir, 'identity_history');
      for (const f of (await fs.readdir(historyDir)).filter((x) => x.endsWith('.json'))) {
        identityHistory[f] = JSON.parse(
          await fs.readFile(path.join(historyDir, f), 'utf-8')
        );
      }
    } catch {
      // no history yet
    }

    const selfHistory: Record<string, string> = {};
    try {
      const selfHistoryDir = path.join(dir, 'self_history');
      for (const f of (await fs.readdir(selfHistoryDir)).filter((x) => x.endsWith('.md'))) {
        selfHistory[f] = await fs.readFile(path.join(selfHistoryDir, f), 'utf-8');
      }
    } catch {
      // no self history yet
    }

    const exportData = {
      version: '1',
      exported_at: new Date().toISOString(),
      identity,
      identity_default: identityDefault,
      self_text: selfText,
      self_default: selfDefault,
      memory_index: memoryIndex,
      memories,
      identity_history: identityHistory,
      self_history: selfHistory,
    };

    console.log(JSON.stringify(exportData, null, 2));
  });

// ─── import ───────────────────────────────────────────────────────────────────
program
  .command('import <name>')
  .description('stdinからJSON形式で読み込む')
  .action(async (name: string) => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    const dir = getAimDir(name);

    await fs.mkdir(path.join(dir, 'identity_history'), { recursive: true });
    await fs.mkdir(path.join(dir, 'self_history'), { recursive: true });
    await fs.mkdir(path.join(dir, 'memory'), { recursive: true });

    await fs.writeFile(
      path.join(dir, 'identity.json'),
      JSON.stringify(data.identity, null, 2),
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'identity_default.json'),
      JSON.stringify(data.identity_default, null, 2),
      'utf-8'
    );
    if (data.self_text != null) {
      await fs.writeFile(path.join(dir, 'self.md'), data.self_text as string, 'utf-8');
    }
    if (data.self_default != null) {
      await fs.writeFile(path.join(dir, 'self_default.md'), data.self_default as string, 'utf-8');
    }
    await fs.writeFile(
      path.join(dir, 'memory_index.json'),
      JSON.stringify(data.memory_index, null, 2),
      'utf-8'
    );

    for (const [filename, content] of Object.entries(data.memories ?? {})) {
      await fs.writeFile(
        path.join(dir, 'memory', filename),
        JSON.stringify(content, null, 2),
        'utf-8'
      );
    }
    for (const [filename, content] of Object.entries(data.identity_history ?? {})) {
      await fs.writeFile(
        path.join(dir, 'identity_history', filename),
        JSON.stringify(content, null, 2),
        'utf-8'
      );
    }
    for (const [filename, content] of Object.entries(data.self_history ?? {})) {
      await fs.writeFile(
        path.join(dir, 'self_history', filename),
        content as string,
        'utf-8'
      );
    }

    console.log(`インポート完了: ${name}`);
  });

// ─── migrate ──────────────────────────────────────────────────────────────────
program
  .command('migrate <name>')
  .description('データ形式のバージョンチェックと移行')
  .action(async (name: string) => {
    const identity = await readIdentity(name);
    if (identity.version === '1') {
      console.log('v1: 移行は不要です。');
    } else {
      console.log(`未知のバージョン: ${identity.version}`);
    }
  });

program.parse();
