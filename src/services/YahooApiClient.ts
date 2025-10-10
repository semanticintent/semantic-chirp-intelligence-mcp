/**
 * 🏒 Yahoo Fantasy API Client Service
 *
 * Handles all Yahoo Fantasy Sports API interactions including:
 * - OAuth token management (load, save, refresh)
 * - Authenticated API requests
 * - Token expiration handling
 * - Error handling and retries
 */

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import type { YahooToken } from '../domain/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class YahooApiClient {
  private cachedToken: YahooToken | null = null;
  private readonly tokenFile: string;
  private readonly apiBase: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    clientId: string,
    clientSecret: string,
    apiBase: string = "https://fantasysports.yahooapis.com/fantasy/v2"
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.apiBase = apiBase;
    this.tokenFile = path.join(__dirname, "..", "..", ".yahoo-oauth.json");
  }

  /**
   * Load OAuth token from file system
   */
  public loadToken(): YahooToken | null {
    try {
      console.error(`[DEBUG] Looking for token at: ${this.tokenFile}`);
      if (fs.existsSync(this.tokenFile)) {
        const tokenData = fs.readFileSync(this.tokenFile, "utf8");
        const token = JSON.parse(tokenData) as YahooToken;
        console.error(`[DEBUG] Token loaded successfully`);
        this.cachedToken = token;
        return token;
      } else {
        console.error(`[DEBUG] Token file not found`);
      }
    } catch (error) {
      console.error("[ERROR] Error loading token:", error);
    }
    return null;
  }

  /**
   * Save OAuth token to file system
   */
  public saveToken(token: YahooToken): void {
    token.expires_at = Date.now() + (token.expires_in * 1000);
    fs.writeFileSync(this.tokenFile, JSON.stringify(token, null, 2));
    this.cachedToken = token;
    console.error("[DEBUG] Token saved successfully");
  }

  /**
   * Refresh expired OAuth token
   */
  public async refreshAccessToken(): Promise<string> {
    const token = this.cachedToken || this.loadToken();

    if (!token) {
      throw new Error("No refresh token available. Please re-authenticate.");
    }

    console.error("[DEBUG] Refreshing access token...");

    const tokenData = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: "oob",
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    });

    const options = {
      hostname: "api.login.yahoo.com",
      port: 443,
      path: "/oauth2/get_token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": tokenData.toString().length,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const newToken = JSON.parse(data) as YahooToken;
            this.saveToken(newToken);
            console.error("[DEBUG] Token refreshed successfully");
            resolve(newToken.access_token);
          } catch (error) {
            reject(new Error(`Failed to parse token response: ${error}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.write(tokenData.toString());
      req.end();
    });
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  public async getValidAccessToken(): Promise<string> {
    const token = this.cachedToken || this.loadToken();

    if (!token) {
      throw new Error("No authentication token found! Run: node authenticate.js");
    }

    // Check if token is expired (with 5 minute buffer)
    if (token.expires_at && token.expires_at < Date.now() + 300000) {
      console.error("[DEBUG] Token expired or expiring soon, refreshing...");
      return await this.refreshAccessToken();
    }

    return token.access_token;
  }

  /**
   * Make authenticated request to Yahoo Fantasy API
   *
   * @param endpoint - API endpoint path (e.g., "/team/nhl.l.12345.t.1/roster")
   * @param format - Response format (default: "json")
   * @returns Parsed API response
   */
  public async request(endpoint: string, format: string = "json"): Promise<any> {
    const accessToken = await this.getValidAccessToken();

    const url = `${this.apiBase}${endpoint}${endpoint.includes('?') ? '&' : '?'}format=${format}`;

    console.error(`[DEBUG] API Request: ${endpoint}`);

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 401) {
            // Token expired, try to refresh and retry
            this.refreshAccessToken()
              .then(() => this.request(endpoint, format))
              .then(resolve)
              .catch(reject);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`API returned status ${res.statusCode}: ${data}`));
            return;
          }

          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * Helper: Strip nhl.l. prefix from league ID if present
   */
  private stripLeaguePrefix(leagueId: string): string {
    return leagueId.replace(/^nhl\.l\./, '');
  }

  /**
   * Helper: Strip team number from full team ID (nhl.l.12345.t.6 -> 6)
   */
  private extractTeamNumber(teamId: string): string {
    const match = teamId.match(/\.t\.(\d+)$/);
    return match ? match[1] : teamId.replace(/^.*\.t\./, '');
  }

  /**
   * Convenience method: Get team roster
   */
  public async getTeamRoster(leagueId: string, teamId: string): Promise<any> {
    const cleanLeagueId = this.stripLeaguePrefix(leagueId);
    const cleanTeamId = this.extractTeamNumber(teamId);
    return this.request(`/team/nhl.l.${cleanLeagueId}.t.${cleanTeamId}/roster`);
  }

  /**
   * Convenience method: Get league standings
   */
  public async getLeagueStandings(leagueId: string): Promise<any> {
    const cleanLeagueId = this.stripLeaguePrefix(leagueId);
    return this.request(`/league/nhl.l.${cleanLeagueId}/standings`);
  }

  /**
   * Convenience method: Get team matchup
   */
  public async getTeamMatchup(leagueId: string, teamId: string, week?: number): Promise<any> {
    const cleanLeagueId = this.stripLeaguePrefix(leagueId);
    const cleanTeamId = this.extractTeamNumber(teamId);
    const weekParam = week ? `;week=${week}` : '';
    return this.request(`/team/nhl.l.${cleanLeagueId}.t.${cleanTeamId}/matchups${weekParam}`);
  }

  /**
   * Convenience method: Get league scoreboard
   */
  public async getLeagueScoreboard(leagueId: string, week?: number): Promise<any> {
    const cleanLeagueId = this.stripLeaguePrefix(leagueId);
    const weekParam = week ? `;week=${week}` : '';
    return this.request(`/league/nhl.l.${cleanLeagueId}/scoreboard${weekParam}`);
  }

  /**
   * Convenience method: Get team stats
   */
  public async getTeamStats(leagueId: string, teamId: string): Promise<any> {
    const cleanLeagueId = this.stripLeaguePrefix(leagueId);
    const cleanTeamId = this.extractTeamNumber(teamId);
    return this.request(`/team/nhl.l.${cleanLeagueId}.t.${cleanTeamId}/stats`);
  }

  /**
   * Convenience method: Get league settings
   */
  public async getLeagueSettings(leagueId: string): Promise<any> {
    return this.request(`/league/nhl.l.${leagueId}/settings`);
  }

  /**
   * Convenience method: Get players (for search, trending, etc.)
   */
  public async getPlayers(leagueId: string, queryParams: string = ''): Promise<any> {
    return this.request(`/league/nhl.l.${leagueId}/players${queryParams}`);
  }
}
