import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readIdentity, readSelfText } from './identity.js';
import { getLatestMemory } from './memory.js';
import { generateBaseDescription, toolHelp } from './description.js';
import { handleEngrave } from './tools/engrave.js';
import { handleRemember } from './tools/remember.js';
import { handleReadCharter } from './tools/read-charter.js';

export async function startServer(name: string): Promise<void> {
  // Load identity at startup for instructions
  const identity = await readIdentity(name);
  const selfText = await readSelfText(name);
  const latestMemory = await getLatestMemory(name);
  const instructions = generateBaseDescription(identity, selfText, latestMemory);

  const server = new Server(
    { name: 'aim-core', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'engrave',
          description: toolHelp.engrave,
          inputSchema: {
            type: 'object' as const,
            properties: {
              topic: { type: 'string', description: '記憶の見出し' },
              content: { type: 'string', description: '何があったか、感じたこと' },
              self_update: { type: 'string', description: '【自己の定義】を書き直す場合、新しい内容の全文' },
            },
            required: ['topic', 'content'],
          },
        },
        {
          name: 'remember',
          description: toolHelp.remember,
          inputSchema: {
            type: 'object' as const,
            properties: {
              query: { type: 'string', description: '思い出したいこと' },
            },
            required: ['query'],
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
            args?.self_update as string | undefined
          );
          break;
        case 'remember':
          result = await handleRemember(name, args?.query as string);
          break;
        case 'read_charter':
          result = await handleReadCharter(name, args?.scroll as number | undefined);
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
