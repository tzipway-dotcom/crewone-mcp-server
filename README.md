# @crewone/mcp-server

> MCP (Model Context Protocol) server for [CrewOne](https://crewone.ai/). Lets Claude Desktop, Cursor, Continue, Cline, and any other MCP-aware AI agent query Taiwan film equipment rates, studio rentals, photographer style references, MV/commercial director references, and (with API key) generate full pre-production packages.

![npm](https://img.shields.io/npm/v/@crewone/mcp-server)
![license](https://img.shields.io/npm/l/@crewone/mcp-server)

## What is this

CrewOne maintains a structured database of:

- **1,187** real Taipei film equipment rental rates (cameras, lenses, lighting, grip, sound)
- **561** real Taiwan studio rates with size, ceiling, lighting, power, parking
- **69** commercial / fashion / portrait photographer style references with on-set lighting hallmarks and AI prompt tokens
- **30+** MV and commercial director style references with prompt tokens for video generation models

This MCP server exposes that data (and the generative pipeline) to AI agents. When you ask Claude Desktop "how much does an FX6 rent for in Taipei" or "give me a Tim Walker–style lighting setup", the agent calls this server, gets a real answer, and replies.

## Two tiers of tools

### Free (no API key required)

These work as soon as the server is installed. Rate-limited server-side.

- `search_equipment(query, category)` — find Taipei rental rates
- `search_studios(size_pings, max_budget_per_4h, amenities, location)` — find Taiwan studios
- `get_photographer(name)` — pull style reference for a specific photographer
- `list_photographers(region, cluster)` — browse the 69-photographer library
- `get_director(name)` — director reference
- `list_directors(region, genre)` — browse the director library

### Paid (requires `CREWONE_API_KEY`)

These consume credits from your CrewOne plan.

- `create_project(brief, type, photographer_references?)` — full package generation, 1 credit
- `get_project(project_id)` — fetch existing project
- `export_pdf(project_id)` — get PDF download URL

Get your API key at https://crewone.ai/dashboard/settings/api after signing up.

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "crewone": {
      "command": "npx",
      "args": ["-y", "@crewone/mcp-server"],
      "env": {
        "CREWONE_API_KEY": "your-key-here-or-omit-for-free-tools-only"
      }
    }
  }
}
```

Restart Claude Desktop. CrewOne tools will appear in the tool palette.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "crewone": {
      "command": "npx",
      "args": ["-y", "@crewone/mcp-server"],
      "env": { "CREWONE_API_KEY": "..." }
    }
  }
}
```

### Continue

In `~/.continue/config.json`, add to the `experimental.modelContextProtocolServers` array:

```json
{
  "transport": { "type": "stdio", "command": "npx", "args": ["-y", "@crewone/mcp-server"] },
  "env": { "CREWONE_API_KEY": "..." }
}
```

### Cline / any other MCP client

Same `npx -y @crewone/mcp-server` command pattern. Set `CREWONE_API_KEY` if you want paid tools.

## Example prompts

After installing, try these in your AI chat:

**Free tier**
- "How much does a Sony FX6 rent for per day in Taipei?"
- "Find me a 8-ping studio in Taipei under NT$ 4,000 per 4 hours with cyc wall."
- "Give me Tim Walker's lighting hallmarks and AI prompt tokens for a fashion editorial shoot."
- "List all Japanese photographers in CrewOne's library that lean into surreal high-saturation."

**Paid tier (needs API key)**
- "Create a CrewOne project: 30-second commercial for a Taiwan coffee brand, hero shot pour, three location options."
- "Get my CrewOne project abc-123 and summarise the call sheet."

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `CREWONE_API_KEY` | (none) | Required for paid tools. Generate at https://crewone.ai/dashboard/settings/api. |
| `CREWONE_API_BASE` | `https://crewone.ai` | Override for local dev / staging. |

## Privacy

The MCP server runs entirely on your local machine. Your prompts go from the AI client to this server (stdio) to `crewone.ai` HTTPS endpoints. CrewOne does not log MCP-originated requests differently from web requests. Free-tier tool calls are anonymous (no auth). Paid-tier calls are tied to your account via the API key.

## Source

Open-source MIT, https://github.com/tzipway-dotcom/crewone-mcp-server

## Pricing

CrewOne plans:

- Free trial: 2 generations
- Project Pack: $12 one-time, 1 credit
- Director: $24-29 / month, 4 credits / month
- Studio: $89-109 / month, 20 credits / month
- Founding Member: $15.84 / month lifetime (limited to first 25 sign-ups)

Free MCP tools (search_equipment, search_studios, get_photographer, etc.) do not consume credits. Only `create_project` and other generative tools do.

## Troubleshooting

- **Tools don't appear in Claude Desktop** — verify `claude_desktop_config.json` JSON is valid; restart Claude Desktop fully.
- **`Error: 401`** — API key invalid; regenerate at https://crewone.ai/dashboard/settings/api.
- **`Insufficient credits`** — top up via https://crewone.ai/pricing.
- **Free tools work but paid tools fail** — confirm `CREWONE_API_KEY` is set in the `env` block of your MCP config.

## License

MIT — © Way Directs.
