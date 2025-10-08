# Yahoo Fantasy Hockey MCP Server

An MCP server for managing your Yahoo Fantasy Hockey team with AI assistance.

## Setup

1. **Get Yahoo API Credentials:**
   - Go to https://developer.yahoo.com/apps/create/
   - Create a new app with these settings:
     - **Application Name**: `Yahoo Fantasy Hockey MCP` (or any name)
     - **Description**: `MCP server for managing Yahoo Fantasy Hockey`
     - **Homepage URL**: `https://localhost:3000`
     - **Redirect URI**: `https://localhost:3000/callback`
     - **OAuth Client Type**: `Confidential Client`
     - **API Permissions**: Check `Fantasy Sports`
   - Copy your Client ID and Client Secret

2. **Configure:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials and league/team IDs
   ```

3. **Install and Build:**
   ```bash
   npm install
   npm run build
   ```

4. **First Run (OAuth):**
   ```bash
   node authenticate.js
   ```
   - Open the URL that appears in your browser
   - Your browser will show a security warning (self-signed certificate)
   - Click "Advanced" → "Proceed to localhost (unsafe)" to continue
   - Authorize the app
   - Token will be saved automatically

5. **Add to Claude Desktop:**

   Edit your Claude config:
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "yahoo-fantasy": {
         "command": "node",
         "args": ["C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"]
       }
     }
   }
   ```

## Available Tools

- `get_team_roster` - View your current roster
- `get_league_standings` - Check league standings
- `get_current_matchup` - See your current matchup
- `search_players` - Find available free agents by position
- `get_player_stats` - Get detailed player statistics
- `set_lineup` - Update your starting lineup
- `add_drop_player` - Execute waiver moves

## Usage with Claude

Once configured, you can ask Claude:
- "Check my roster and who's playing today"
- "Show me available centers ranked by points"
- "Should I start goalie A or goalie B tonight?"
- "Help me set my optimal lineup for this week"
- "Add player X and drop player Y"
