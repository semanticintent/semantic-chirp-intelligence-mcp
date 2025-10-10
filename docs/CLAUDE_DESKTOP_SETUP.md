# Claude Desktop MCP Server Setup

## Making Your Yahoo Fantasy MCP Server Discoverable

This guide shows you how to connect your Yahoo Fantasy MCP server to Claude Desktop.

### Step 1: Locate Claude Desktop Config

The Claude Desktop configuration file location depends on your OS:

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```
Typically: `C:\Users\YourUsername\AppData\Roaming\Claude\claude_desktop_config.json`

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### Step 2: Add MCP Server Configuration

Open the `claude_desktop_config.json` file and add your MCP server configuration.

If the file is **empty or doesn't exist**, create it with this content:

```json
{
  "mcpServers": {
    "yahoo-fantasy-mcp": {
      "command": "node",
      "args": [
        "C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"
      ],
      "env": {
        "LEAGUE_ID": "your_league_id_here",
        "TEAM_ID": "your_team_id_here"
      }
    }
  }
}
```

If the file **already has other MCP servers**, add your server to the `mcpServers` object:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "existing-command",
      "args": ["..."]
    },
    "yahoo-fantasy-mcp": {
      "command": "node",
      "args": [
        "C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"
      ],
      "env": {
        "LEAGUE_ID": "your_league_id_here",
        "TEAM_ID": "your_team_id_here"
      }
    }
  }
}
```

### Step 3: Update Environment Variables

Replace the placeholders in the configuration:

```json
"env": {
  "LEAGUE_ID": "nhl.l.123456",      // Your Yahoo Fantasy league ID
  "TEAM_ID": "nhl.l.123456.t.1"     // Your team ID
}
```

**How to find your League ID and Team ID:**

1. Go to your Yahoo Fantasy Hockey league
2. Look at the URL: `https://hockey.fantasysports.yahoo.com/hockey/12345/6`
3. Your League ID is `nhl.l.12345`
4. Your Team ID is `nhl.l.12345.t.6` (where 6 is your team number)

Alternatively, use the `.env` file method (see Step 4).

### Step 4: Alternative - Use .env File

Instead of putting credentials in the config, you can use the `.env` file in the project root:

**Create `.env` file at:** `C:\workspace\dev-tools\yahoo-fantasy-mcp\.env`

```env
LEAGUE_ID=nhl.l.123456
TEAM_ID=nhl.l.123456.t.1
YAHOO_CLIENT_ID=your_yahoo_client_id
YAHOO_CLIENT_SECRET=your_yahoo_client_secret
```

Then your Claude Desktop config becomes simpler:

```json
{
  "mcpServers": {
    "yahoo-fantasy-mcp": {
      "command": "node",
      "args": [
        "C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"
      ]
    }
  }
}
```

### Step 5: Restart Claude Desktop

After modifying the configuration:

1. **Completely quit** Claude Desktop (not just close the window)
   - Windows: Right-click taskbar icon → Exit
   - macOS: Cmd+Q
   - Linux: Close all windows and quit from system tray

2. **Restart** Claude Desktop

3. **Verify** the server is connected:
   - Open a new conversation
   - Type a message like "What MCP servers are available?"
   - You should see `yahoo-fantasy-mcp` in the list

### Step 6: Test the Connection

Try using one of the available tools:

```
Can you show me my roster transaction recommendations?
```

or

```
Use the governance_dashboard tool to show me the system health.
```

### Available Tools

Once connected, Claude Desktop will have access to these tools:

1. **get_roster_transaction_recommendations** (ICE)
   - Championship-level roster optimization
   - Priority-based recommendations (CRITICAL → HIGH → MEDIUM → LOW)

2. **get_streaming_recommendations**
   - Waiver wire targets based on upcoming schedules
   - Optimal timing for pickups

3. **get_games_in_hand**
   - Schedule advantage analysis
   - Games remaining differential

4. **optimize_lineup**
   - Daily lineup optimization
   - Maximize active roster efficiency

5. **governance_dashboard**
   - View semantic governance health
   - Analysis performance metrics

### Troubleshooting

#### Server Not Appearing

**Check 1: Verify the file path**
```json
"args": [
  "C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"  // Must be absolute path
]
```

**Check 2: Test the server manually**
```bash
cd C:\workspace\dev-tools\yahoo-fantasy-mcp
node build/index.js
```

Should output:
```
🏒❄️ Semantic Chirp Intelligence MCP v3.0 - ICE is ON! (Official API)
```

**Check 3: Check Claude Desktop logs**

Windows:
```
%APPDATA%\Claude\logs\
```

macOS:
```
~/Library/Logs/Claude/
```

Look for errors related to MCP server initialization.

#### Authentication Issues

If you see Yahoo API authentication errors:

1. Ensure `.env` file exists with valid credentials:
```env
YAHOO_CLIENT_ID=your_actual_client_id
YAHOO_CLIENT_SECRET=your_actual_client_secret
```

2. Get Yahoo OAuth credentials:
   - Go to https://developer.yahoo.com/apps/
   - Create a new app or use existing
   - Copy Client ID and Client Secret

3. Run authentication flow:
```bash
cd C:\workspace\dev-tools\yahoo-fantasy-mcp
node authenticate.js
```

This will open a browser for Yahoo login and save tokens.

#### Build Issues

If the server fails to start:

```bash
# Rebuild the project
cd C:\workspace\dev-tools\yahoo-fantasy-mcp
npm run build

# Check for errors
npm test
```

#### Node.js Version

Ensure you're using Node.js 18+ (ESM module support):

```bash
node --version
# Should be v18.0.0 or higher
```

### Configuration Examples

#### Minimal Configuration (Production)

```json
{
  "mcpServers": {
    "yahoo-fantasy-mcp": {
      "command": "node",
      "args": ["C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"]
    }
  }
}
```

Uses `.env` file for all configuration.

#### Development Configuration (with env vars)

```json
{
  "mcpServers": {
    "yahoo-fantasy-mcp": {
      "command": "node",
      "args": ["C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"],
      "env": {
        "NODE_ENV": "development",
        "LEAGUE_ID": "nhl.l.123456",
        "TEAM_ID": "nhl.l.123456.t.1"
      }
    }
  }
}
```

Shows governance audit logs in development mode.

#### Multiple Teams Configuration

```json
{
  "mcpServers": {
    "fantasy-team-1": {
      "command": "node",
      "args": ["C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"],
      "env": {
        "LEAGUE_ID": "nhl.l.123456",
        "TEAM_ID": "nhl.l.123456.t.1"
      }
    },
    "fantasy-team-2": {
      "command": "node",
      "args": ["C:/workspace/dev-tools/yahoo-fantasy-mcp/build/index.js"],
      "env": {
        "LEAGUE_ID": "nhl.l.789012",
        "TEAM_ID": "nhl.l.789012.t.5"
      }
    }
  }
}
```

Manage multiple teams with separate server instances.

### Security Best Practices

1. **Never commit credentials to git**
   - `.env` file is in `.gitignore`
   - Don't put secrets in `claude_desktop_config.json` if you share it

2. **Use environment variables**
   - Preferred: `.env` file method
   - Alternative: System environment variables

3. **Protect your tokens**
   - `.yahoo-oauth.json` contains refresh tokens
   - Keep it secure, don't share

4. **Regularly refresh**
   - Yahoo tokens expire
   - Re-run `node authenticate.js` if you get auth errors

### Testing Your Setup

After configuration, test each component:

#### 1. Test Server Startup
```bash
node build/index.js
# Should show: 🏒❄️ Semantic Chirp Intelligence MCP v3.0 - ICE is ON!
```

#### 2. Test MCP Protocol
In Claude Desktop, ask:
```
What tools do you have access to?
```

Should list all 5 tools.

#### 3. Test ICE Analysis
```
Show me my roster transaction recommendations using ICE
```

Should return recommendations with priorities.

#### 4. Test Governance Dashboard
```
Use the governance_dashboard tool with report_type set to "full"
```

Should return governance health metrics.

### Next Steps

Once your server is discoverable:

1. **Explore the tools** - Try each analysis tool
2. **Check the docs** - Read `docs/ARCHITECTURE.md` for design details
3. **Customize chirps** - Adjust `chirp_intensity` and `personality_mode`
4. **Monitor performance** - Use `governance_dashboard` tool
5. **Contribute** - Add new analysis tools using the Template Pattern

### Reference

- **Architecture**: `docs/ARCHITECTURE.md`
- **Usage Guide**: `docs/TEMPLATE_PATTERN_USAGE.md`
- **Implementation Plan**: `TEMPLATE_PATTERN_IMPLEMENTATION_PLAN.md`
- **MCP SDK Docs**: https://github.com/anthropics/mcp

---

**Need Help?**

If the server isn't appearing in Claude Desktop:

1. Check the config file path
2. Verify JSON syntax (use a JSON validator)
3. Restart Claude Desktop completely
4. Check Claude Desktop logs
5. Test the server manually with `node build/index.js`

**Still having issues?** Open an issue with:
- OS and Node.js version
- Claude Desktop config (redact credentials)
- Server startup output
- Claude Desktop log excerpts
