# Yahoo Fantasy Hockey MCP Server

A Model Context Protocol (MCP) server that provides AI-powered management of your Yahoo Fantasy Hockey team through Claude Desktop.

## Features

✅ **OAuth 2.0 Authentication** - Secure token management with automatic refresh
✅ **10 Fantasy Hockey Tools** - Complete read access to your league and roster
✅ **Direct Yahoo API Integration** - Reliable HTTPS requests without buggy wrappers
✅ **Smart Parsing** - Handles Yahoo's dynamic JSON structure robustly
✅ **TypeScript** - Full type safety and modern ES modules

## Prerequisites

- Node.js 18+
- Yahoo Account with a Fantasy Hockey team
- Claude Desktop application

## Setup

### 1. Get Yahoo API Credentials

1. Go to https://developer.yahoo.com/apps/create/
2. Create a new app with these settings:
   - **Application Name**: `Yahoo Fantasy Hockey MCP` (or any name)
   - **Description**: `MCP server for managing Yahoo Fantasy Hockey`
   - **Homepage URL**: `https://localhost:3000`
   - **Redirect URI**: `https://localhost:3000/callback`
   - **OAuth Client Type**: `Confidential Client`
   - **API Permissions**: Check `Fantasy Sports`
3. Copy your **Client ID** and **Client Secret**

### 2. Find Your League and Team IDs

Visit your team page: `https://hockey.fantasysports.yahoo.com/hockey/{LEAGUE_ID}/{TEAM_ID}`

Example: `https://hockey.fantasysports.yahoo.com/hockey/51154/8`
- League ID: `51154`
- Team ID: `8`

### 3. Install and Configure

```bash
# Clone or download this repository
cd yahoo-fantasy-mcp

# Install dependencies
npm install

# Create .env file from template
cp .env.example .env

# Edit .env with your credentials
# YAHOO_CLIENT_ID=your_client_id
# YAHOO_CLIENT_SECRET=your_client_secret
# YAHOO_LEAGUE_ID=your_league_id
# YAHOO_TEAM_ID=your_team_id
```

### 4. Build the Server

```bash
npm run build
```

### 5. Authenticate with Yahoo

```bash
node authenticate.js
```

1. A URL will appear in your terminal
2. Open it in your browser
3. Your browser will show a security warning (self-signed certificate) - this is normal
4. Click **"Advanced"** → **"Proceed to localhost (unsafe)"** to continue
5. Sign in to Yahoo and authorize the app
6. You'll see "✅ Authentication Successful!" - the token is saved to `.yahoo-oauth.json`

### 6. Add to Claude Desktop

Edit your Claude Desktop config file:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server configuration:

```json
{
  "mcpServers": {
    "yahoo-fantasy-hockey": {
      "command": "node",
      "args": ["C:/workspace/dev-tools/yahoo-fantasy-mcp/dist/index.js"],
      "env": {
        "YAHOO_CLIENT_ID": "your_client_id",
        "YAHOO_CLIENT_SECRET": "your_client_secret",
        "YAHOO_LEAGUE_ID": "your_league_id",
        "YAHOO_TEAM_ID": "your_team_id",
        "DOTENV_CONFIG_QUIET": "true"
      }
    }
  }
}
```

**Note**: Update the path to match your installation location. Use forward slashes `/` even on Windows.

### 7. Restart Claude Desktop

Restart Claude Desktop to load the MCP server. You should see the Yahoo Fantasy Hockey tools available.

## Available Tools

### Read-Only Tools

| Tool | Description |
|------|-------------|
| `get_team_roster` | View your current roster with all players, positions, and injury status |
| `get_league_standings` | Get current league standings with wins, losses, and points |
| `get_current_matchup` | See your current week's opponent and matchup status |
| `search_players` | Search available free agents by position (C, LW, RW, D, G) |
| `get_player_stats` | Get detailed statistics for any player by ID |
| `get_weekly_stats` | View your team's current week statistics vs opponent |
| `compare_matchup` | Category-by-category breakdown of your current matchup |
| `optimize_lineup` | AI-powered recommendations for optimal lineup (injured players, healthy bench, etc.) |
| `get_trending_players` | See most added or most owned players in your league |
| `debug_api_call` | Inspect raw Yahoo API responses for troubleshooting |

### Tool Examples

**Get Your Roster:**
```
"Show me my current roster"
```

**Search Free Agents:**
```
"Search for available goalies"
"Find top 10 available centers"
```

**Get Player Stats:**
```
"Get stats for player ID 6381"
```

**Weekly Matchup:**
```
"How am I doing in my current matchup?"
"Show me category breakdown vs my opponent"
```

**Lineup Optimization:**
```
"Should I make any lineup changes?"
"Are there any injured players in my active lineup?"
```

**Trending Players:**
```
"Who are the hottest waiver pickups?"
"Show me most owned players"
```

## Usage Examples with Claude

Once configured, you can have natural conversations with Claude about your fantasy team:

- *"Check my roster and tell me if anyone is injured"*
- *"Who are the top available centers I should consider?"*
- *"Am I winning my matchup this week?"*
- *"Should I start any of my bench players tonight?"*
- *"Which categories am I winning and losing?"*
- *"Show me trending goalies in my league"*

## Troubleshooting

### "No authentication token found"
Run `node authenticate.js` to create a new token.

### "Token expired" errors
The server automatically refreshes tokens, but if issues persist, re-run `node authenticate.js`.

### "not valid JSON" error in Claude Desktop
Make sure you have `"DOTENV_CONFIG_QUIET": "true"` in your Claude Desktop config env vars.

### Can't see the tools in Claude
1. Check that the path in `claude_desktop_config.json` is correct
2. Make sure you built the project (`npm run build`)
3. Restart Claude Desktop completely
4. Check Claude Desktop logs for errors

### Self-signed certificate warnings
This is normal for local development. The authenticate script generates a temporary SSL certificate for the OAuth callback. Click through the browser warning to proceed.

## Development

```bash
# Build TypeScript
npm run build

# Run in development (with rebuild on changes)
npm run dev

# Type check
npx tsc --noEmit
```

## Project Structure

```
yahoo-fantasy-mcp/
├── src/
│   ├── index.ts          # Main MCP server implementation
│   ├── types.ts          # TypeScript type definitions
│   └── yahoo-fantasy.d.ts # Yahoo API type declarations
├── authenticate.js        # OAuth helper script
├── package.json
├── tsconfig.json
├── .env.example          # Environment template
├── .gitignore
└── README.md
```

## Token Management

- Tokens are stored in `.yahoo-oauth.json` (git-ignored)
- Access tokens expire after 1 hour
- The server automatically refreshes tokens using the refresh token
- Refresh tokens are long-lived but may require re-authentication periodically

## Security Notes

- Never commit `.env` or `.yahoo-oauth.json` to version control
- The `.gitignore` file protects these files by default
- Keep your Client Secret confidential
- The server runs locally - no data is sent to third parties

## API Rate Limits

Yahoo Fantasy API has rate limits. The server includes:
- Token caching to minimize auth requests
- Efficient API calls with proper error handling
- Debug logging to stderr (won't interfere with MCP protocol)

## Contributing

Contributions welcome! This server currently provides read-only access. Future enhancements could include:
- Transaction tools (add/drop players, trades)
- Lineup setting functionality
- Multi-team/multi-league support
- Caching layer for performance
- More advanced analytics

## License

MIT

## Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/anthropics/mcp) by Anthropic
- [Yahoo Fantasy Sports API](https://developer.yahoo.com/fantasysports/)
- TypeScript, Node.js

---

**🏒 Happy fantasy hockey managing with AI assistance!**
