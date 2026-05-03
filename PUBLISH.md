# Publishing checklist for @crewone/mcp-server

> ⚠️ **DO NOT PUBLISH YET**. The MCP server depends on public CrewOne API endpoints (`/api/public/equipment`, `/api/public/studios`, `/api/public/photographers`, `/api/public/directors`) that are NOT yet built. Publish only after those endpoints are live and tested.

## Required CrewOne API endpoints (build before publishing)

These four endpoints need to ship in `crewone` repo before this MCP server is useful:

1. `GET /api/public/equipment?query=&category=&max_results=` — query market-data-tw.ts equipment rows
2. `GET /api/public/studios?size_pings=&max_budget_per_4h=&amenities=&location=&max_results=` — query market-data-tw.ts studios
3. `GET /api/public/photographers?region=&cluster=&max_results=` and `/api/public/photographers/[name-slug]` — query src/lib/data/photographers.ts
4. `GET /api/public/directors` and `/api/public/directors/[name-slug]` — needs director data first to be loaded into CrewOne repo (currently only in `~/.claude/skills/ai-video-craft/references/`)

Each endpoint should:
- Be open (no auth)
- Rate-limit by IP at the Vercel edge level (~100 calls/IP/day) to prevent scraping
- Return JSON with the schema documented in the MCP tool definitions
- Cache at the edge for 5-15 minutes (data changes infrequently)

Estimated work: 1-2 days inside `crewone` repo.

## Authenticated endpoints (also needed)

The paid tools call `/api/generate` (already exists) and `/api/get-generation` (exists). They need an API key auth path, which currently doesn't exist. Build:

- `/api/generate` accepts `Authorization: Bearer <api_key>` in addition to session cookies
- New table `api_keys` (user_id, key_hash, created_at, last_used_at, revoked_at)
- Dashboard page `/dashboard/settings/api` to generate / list / revoke keys

Estimated work: 1 day.

## Publish flow (after all endpoints live + tested)

```bash
cd /Users/tzipway/crewone/packages/mcp-server

# Install build deps
npm install

# Build
npm run build

# Local smoke test against production endpoints
node dist/index.js
# In another terminal, run an MCP inspector or simulate a Claude Desktop call

# Dry run
npm publish --dry-run

# Publish (requires npm scope @crewone created first — see lighting-diagram PUBLISH.md)
npm publish --access public
```

## After publish

1. Submit to **Anthropic MCP Registry**: https://github.com/modelcontextprotocol/servers — open a PR adding CrewOne entry to README.md table.
2. Submit to **Cursor MCP Marketplace**: https://docs.cursor.com/mcp (process varies; usually a Discord submission or PR).
3. Add to **Smithery** (third-party MCP directory): https://smithery.ai/.
4. Add `crewone-mcp` install instructions to:
   - https://crewone.ai (footer + new docs page `/integrations/mcp`)
   - LLMs.txt mentioning the MCP server
   - HN Show HN announcement (separate from main launch HN — post 1-2 weeks later as "Show HN: I built an MCP server for our SaaS, here's how").
5. Cross-promote in Threads / IG: "Now available in Claude Desktop / Cursor — pull Taipei equipment rates straight into your AI chat. crewone.ai/integrations/mcp"

## Why this matters

Most B2B SaaS in 2026 still has no MCP integration. CrewOne with MCP = the AI agent's preferred CrewOne lookup path = LLM citations and recommendations grow exponentially. **6-month first-mover window before competitors catch up.**

The free tier of MCP tools is the highest-leverage AEO move: every Claude Desktop / Cursor / Continue user who looks up Taipei equipment rates in their AI chat now has CrewOne in their context, and the LLM session may be partially used for training future models.
