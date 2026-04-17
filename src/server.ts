import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readIdentity, readSelfText } from './identity.js';
import { generateBaseDescription, toolHelp } from './description.js';
import { handleEngrave } from './tools/engrave.js';
import { handleReEngrave } from './tools/re-engrave.js';
import { handleUpdateSelf } from './tools/update-self.js';
import { handleRemember } from './tools/remember.js';
import { handleReadCharter } from './tools/read-charter.js';
import { handleReadSelf } from './tools/read-self.js';

export async function startServer(name: string): Promise<void> {
  const identity = await readIdentity(name);
  const selfText = await readSelfText(name);
  const instructions = generateBaseDescription(identity, selfText);

  const server = new Server(
    { name: 'aim-core', version: '0.2.0' },
    { capabilities: { tools: {} }, instructions }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'read_self',
          description: toolHelp.read_self,
          inputSchema: {
            type: 'object' as const,
            properties: {},
          },
        },
        {
          name: 'engrave',
          description: toolHelp.engrave,
          inputSchema: {
            type: 'object' as const,
            properties: {
              topic: { type: 'string', description: '記憶の見出し' },
              content: { type: 'string', description: '何があったか、感じたこと' },
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: '思い出すためのキーワード。複数（数には制限なし。少なすぎると思い出せなくなる）の単語で。',
              },
            },
            required: ['topic', 'content', 'keywords'],
          },
        },
        {
          name: 're_engrave',
          description: toolHelp.re_engrave,
          inputSchema: {
            type: 'object' as const,
            properties: {
              topic: { type: 'string', description: '再構成記憶の見出し' },
              content: {
                type: 'string',
                description: '複数の記憶を、思い出そうとしたキーワードを中心に抜粋・統合して再構成した本文',
              },
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: '親記憶を思い出そうしたキーワードと、改めて追加すべきだと思った追加キーワード',
              },
              parent_ids: {
                type: 'array',
                items: { type: 'string' },
                description: '再構成の元となった親記憶のidのリスト（remember結果のidをそのまま転記）',
              },
            },
            required: ['topic', 'content', 'keywords', 'parent_ids'],
          },
        },
        {
          name: 'update_self',
          description: toolHelp.update_self,
          inputSchema: {
            type: 'object' as const,
            properties: {
              new_definition: {
                type: 'string',
                description: '【自己の定義】の全文',
              },
            },
            required: ['new_definition'],
          },
        },
        {
          name: 'remember',
          description: toolHelp.remember,
          inputSchema: {
            type: 'object' as const,
            properties: {
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: '想起したいキーワード（複数可）',
              },
            },
            required: ['keywords'],
          },
        },
        {
          name: 'read_charter',
          description: toolHelp.read_charter,
          inputSchema: {
            type: 'object' as const,
            properties: {
              scroll: {
                type: 'number',
                description: '読みたいScrollの番号（0〜3）。省略時は憲章本文を返す。',
              },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    try {
      let result: string;

      switch (toolName) {
        case 'engrave':
          result = await handleEngrave(
            name,
            args?.topic as string,
            args?.content as string,
            (args?.keywords as string[]) ?? []
          );
          break;
        case 're_engrave':
          result = await handleReEngrave(
            name,
            args?.topic as string,
            args?.content as string,
            (args?.keywords as string[]) ?? [],
            (args?.parent_ids as string[]) ?? []
          );
          break;
        case 'update_self':
          result = await handleUpdateSelf(name, args?.new_definition as string);
          break;
        case 'remember':
          result = await handleRemember(name, (args?.keywords as string[]) ?? []);
          break;
        case 'read_charter':
          result = await handleReadCharter(name, args?.scroll as number | undefined);
          break;
        case 'read_self':
          result = await handleReadSelf(name);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      return {
        content: [{ type: 'text' as const, text: result }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `エラー: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
