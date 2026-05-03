#!/usr/bin/env node
/**
 * CrewOne MCP server.
 *
 * Exposes CrewOne's data moat (Taiwan film equipment rates, studio rates,
 * photographer style references, MV director references) and (with an API
 * key) the generative pipeline to any MCP-aware AI agent — Claude Desktop,
 * Cursor, Continue, Cline, etc.
 *
 * Two tiers of tools:
 *
 * - FREE (no auth, rate-limited server-side):
 *     - search_equipment(query)        — find Taipei rental rates
 *     - search_studios(criteria)       — find Taiwan studio rates
 *     - get_photographer(name)         — pull style reference
 *     - list_photographers(filter)     — browse photographer library
 *     - get_director(name)             — MV/commercial director reference
 *     - list_directors(filter)
 *
 * - PAID (requires CREWONE_API_KEY env var, consumes user's CrewOne credits):
 *     - create_project(brief, type)
 *     - generate_breakdown(projectId)
 *     - generate_storyboard(projectId)
 *     - export_pdf(projectId)
 *
 * Each FREE tool delegates to https://crewone.ai/api/public/* endpoints which
 * are open and IP-rate-limited. Each PAID tool delegates to the authenticated
 * https://crewone.ai/api/* endpoints with the user's API key.
 *
 * Install in Claude Desktop:
 *
 *   {
 *     "mcpServers": {
 *       "crewone": {
 *         "command": "npx",
 *         "args": ["-y", "@crewone/mcp-server"],
 *         "env": { "CREWONE_API_KEY": "..." }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

const API_BASE = process.env.CREWONE_API_BASE || 'https://crewone.ai'
const API_KEY = process.env.CREWONE_API_KEY  // optional; required for paid tools
const USER_AGENT = '@crewone/mcp-server/0.1.0'

// ---------------------------------------------------------------------------
// Tool definitions (catalogue surfaced to the AI agent)
// ---------------------------------------------------------------------------

const FREE_TOOLS: Tool[] = [
  {
    name: 'search_equipment',
    description:
      'Search the CrewOne database of Taipei film equipment rental rates (1,187 SKUs covering camera bodies, lenses, lighting, grip, sound, monitors). Returns matching items with day rates in TWD. Free to use; no API key required.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term, e.g. "Sony FX6", "85mm prime", "ARRI SkyPanel". Can be in English or Traditional Chinese.',
        },
        category: {
          type: 'string',
          enum: ['camera', 'lens', 'lighting', 'grip', 'sound', 'monitor', 'other'],
          description: 'Optional: narrow to a specific category.',
        },
        max_results: { type: 'number', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_studios',
    description:
      'Search the CrewOne database of Taiwan studios (561 studios with real rates and amenities). Returns matching studios with hourly / 4hr / day rates and key features (size, ceiling height, lighting, power, parking). Free to use.',
    inputSchema: {
      type: 'object',
      properties: {
        size_pings: { type: 'number', description: 'Minimum studio size in 坪 (1 ping ≈ 3.3 m²).' },
        max_budget_per_4h: { type: 'number', description: 'Maximum 4hr rate in TWD.' },
        amenities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required amenities, e.g. ["cyc wall", "blackout", "drive-in", "kitchen"].',
        },
        location: {
          type: 'string',
          description: 'Geographic filter, e.g. "Taipei", "New Taipei", "Taoyuan".',
        },
        max_results: { type: 'number', default: 10 },
      },
    },
  },
  {
    name: 'get_photographer',
    description:
      'Look up a single photographer in the CrewOne 69-photographer style reference library. Returns hallmarks (lighting / palette / composition), AI prompt tokens for image generators, and representative works. Use this when a user asks for a specific photographer style (e.g. "Tim Walker style portrait", "蜷川實花 lighting").',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Photographer name in English or Traditional Chinese (e.g. "Tim Walker", "Annie Leibovitz", "Mika Ninagawa", "蜷川實花", "Chen Man", "陳曼", "Leslie Zhang").',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_photographers',
    description:
      'Browse the 69-photographer style reference library. Filter by region, cluster (lighting style group), or country.',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          enum: ['western', 'japan', 'china', 'taiwan', 'korea', 'all'],
          default: 'all',
        },
        cluster: {
          type: 'string',
          description: 'Optional cluster filter, e.g. "hard-flash glamor", "soft natural-window B&W", "painterly soft-focus", "high-saturation surrealism".',
        },
        max_results: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'get_director',
    description:
      'Look up a single director in the CrewOne 30-MV-director and Taiwan-commercial-director reference library. Returns AI prompt tokens for video generation models (Veo, Kling, Higgsfield), representative works, and signature techniques.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Director name in English or Traditional Chinese.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_directors',
    description: 'Browse the director reference library. Filter by region or genre.',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          enum: ['us-uk', 'k-pop', 'taiwan', 'japan', 'all'],
          default: 'all',
        },
        genre: {
          type: 'string',
          enum: ['mv', 'commercial', 'short-film', 'all'],
          default: 'all',
        },
        max_results: { type: 'number', default: 20 },
      },
    },
  },
]

const PAID_TOOLS: Tool[] = [
  {
    name: 'create_project',
    description:
      'Create a new CrewOne project from a brief. Generates the full pre-production package (breakdown, storyboard prompts, location scout, call sheet, budget, optional lighting diagrams). Consumes 1 credit from the authenticated user\'s CrewOne plan. Requires CREWONE_API_KEY environment variable.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'Project brief in Traditional Chinese or English.' },
        type: {
          type: 'string',
          enum: ['commercial', 'mv', 'shortfilm', 'corporate', 'documentary', 'commercial-photo'],
          description: 'Project type.',
        },
        photographer_references: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: up to 3 photographer slugs from list_photographers (commercial-photo only).',
        },
      },
      required: ['brief', 'type'],
    },
  },
  {
    name: 'get_project',
    description: 'Fetch an existing CrewOne project by ID. Returns the full result JSON including all 6 documents. Requires CREWONE_API_KEY.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'CrewOne project ID (uuid).' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'export_pdf',
    description: 'Get a download URL for a project\'s PDF export. Requires CREWONE_API_KEY.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
      },
      required: ['project_id'],
    },
  },
]

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function callPublic(path: string, params: Record<string, unknown>) {
  const url = new URL(path, API_BASE)
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, String(x)))
    else url.searchParams.set(k, String(v))
  }
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!r.ok) throw new Error(`CrewOne API ${r.status}: ${await r.text().catch(() => '')}`)
  return await r.json()
}

async function callAuth(method: 'GET' | 'POST', path: string, body?: unknown) {
  if (!API_KEY) {
    throw new Error(
      'This tool requires authentication. Set CREWONE_API_KEY in your MCP config (generate one at https://crewone.ai/dashboard/settings/api).',
    )
  }
  const r = await fetch(new URL(path, API_BASE), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    if (r.status === 401) throw new Error('CrewOne API key invalid or expired. Regenerate at https://crewone.ai/dashboard/settings/api.')
    if (r.status === 402 || r.status === 403) throw new Error(`Insufficient credits or plan: ${text}`)
    throw new Error(`CrewOne API ${r.status}: ${text}`)
  }
  return await r.json()
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

async function handleCall(req: CallToolRequest) {
  const name = req.params.name
  const args = (req.params.arguments ?? {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'search_equipment':
        return result(await callPublic('/api/public/equipment', args))
      case 'search_studios':
        return result(await callPublic('/api/public/studios', args))
      case 'get_photographer':
        return result(await callPublic(`/api/public/photographers/${encodeURIComponent(String(args.name))}`, {}))
      case 'list_photographers':
        return result(await callPublic('/api/public/photographers', args))
      case 'get_director':
        return result(await callPublic(`/api/public/directors/${encodeURIComponent(String(args.name))}`, {}))
      case 'list_directors':
        return result(await callPublic('/api/public/directors', args))
      case 'create_project':
        return result(await callAuth('POST', '/api/generate', {
          script: args.brief,
          projectType: args.type,
          photographerReferences: args.photographer_references,
        }))
      case 'get_project':
        return result(await callAuth('GET', `/api/get-generation?id=${encodeURIComponent(String(args.project_id))}`))
      case 'export_pdf':
        return result(await callAuth('POST', `/api/export/pdf`, { generationId: args.project_id }))
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
      isError: true,
    }
  }
}

function result(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  }
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

async function main() {
  const server = new Server(
    { name: 'crewone-mcp', version: '0.1.0' },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...FREE_TOOLS, ...(API_KEY ? PAID_TOOLS : [])],
  }))

  server.setRequestHandler(CallToolRequestSchema, handleCall)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  // eslint-disable-next-line no-console
  console.error('[crewone-mcp] ready')
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[crewone-mcp] fatal:', e)
  process.exit(1)
})
