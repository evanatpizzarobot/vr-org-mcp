# vr-org-mcp

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server for **[VR.org](https://vr.org)**, a dedicated VR / AR / XR news publication and aggregator.

It gives any MCP-compatible agent (Claude Desktop, Claude Code, Cursor, Continue, and others) one-call access to live VR, AR, and XR news, VR.org's original editorial (including full article text), the VR/AR/XR events calendar, curated headset deals, buyer-guide answers, and top-game and top-app lists.

Eleven tools, five resources, and three prompts. Zero keys. Zero writes. Zero payments.

## Install

Run it directly with `npx` (no global install needed):

```bash
npx vr-org-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vr-org": {
      "command": "npx",
      "args": ["-y", "vr-org-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add vr-org -- npx -y vr-org-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "vr-org": {
      "command": "npx",
      "args": ["-y", "vr-org-mcp"]
    }
  }
}
```

### Hosted remote endpoint (no install)

VR.org also runs the same tools as a remote server over MCP's streamable-HTTP transport, so web clients (ChatGPT connectors, Claude.ai connectors) can use it with no local install:

```
https://vr.org/mcp
```

## Tools

| Tool | What it returns |
|------|-----------------|
| `search_vr_news` | Latest VR / AR / XR headlines from the live feed, with optional category filter and keyword match |
| `get_vr_trending` | Topics currently trending across the feed |
| `list_vr_originals` | Summaries of VR.org's own editorial articles, newest first |
| `get_vr_article` | Full content of one original by slug: metadata, canonical URL, and the article body HTML |
| `get_vr_events` | Upcoming VR / AR / XR industry events (conferences, expos, launches), soonest first |
| `get_vr_deals` | Curated product picks with prices, badges, and retailer links |
| `compare_vr_headsets` | Side-by-side of two headsets (partial names accepted) |
| `get_top_vr_games` | Current ranked top VR games list |
| `get_top_vr_apps` | Current ranked top VR apps and utilities list |
| `list_vr_sources` | The news sources VR.org aggregates, with counts |
| `vr_explain` | Canonical short answer plus pillar-page link for a common question |

## Resources

Browsable MCP resources an app can attach as context:

| Resource | Contents |
|----------|----------|
| `vrorg://news/latest` | Latest aggregated VR / AR / XR headlines |
| `vrorg://originals/latest` | Index of VR.org's newest original articles |
| `vrorg://events/upcoming` | Upcoming VR / AR / XR industry events |
| `vrorg://guides` | VR.org's canonical pillar-guide answers in one doc |
| `vrorg://article/{slug}` | Full HTML body of any original article (resource template) |

## Prompts

| Prompt | What it does |
|--------|--------------|
| `recommend_a_headset` | Recommends a headset from VR.org's picks given a budget and use case |
| `this_week_in_vr` | Drafts a weekly VR / AR / XR roundup from the feed and originals |
| `explain_vr_topic` | Explains a VR topic grounded in VR.org's canonical answer |

## How it works

Every tool composes VR.org's public JSON API (`https://vr.org/api/*`) into a single agent-friendly response. The server is a thin proxy: it holds no secrets, writes nothing, and cannot move money.

## Threat model

VR.org's editorial is controlled, but the live feed also carries third-party RSS headlines. To keep a malicious or compromised upstream headline from manipulating the calling model, every tool output is:

1. **Sanitized.** Control characters and zero-width / direction-override characters are stripped from every string.
2. **Capped.** Serialized responses are limited to 50 KB so a large payload cannot flood the agent's context window.

Inputs are validated before any outbound request, and errors are returned as structured, non-echoing objects rather than raw stack traces.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `VR_ORG_BASE_URL` | `https://vr.org` | Override the base URL (only useful for staging) |
| `VR_ORG_UA_SUFFIX` | _(none)_ | Optional suffix appended to the outbound User-Agent |

## Development

```bash
npm install
npm run dev        # run from source over stdio
npm run build      # compile to dist/
npm test           # run the offline test suite
npm run typecheck  # type-check without emitting
```

## License

MIT. A VR.org project.
