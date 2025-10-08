// Type definitions for yahoo-fantasy package
declare module 'yahoo-fantasy' {
  export default class YahooFantasy {
    constructor(
      clientId: string,
      clientSecret: string,
      tokenCallbackOrRedirectUri?: ((err: any, token: any) => void) | string,
      redirectUri?: string
    );

    token: any;
    setUserToken(token: string): void;
    setRefreshToken(refreshToken: string): void;
    auth(resOrCode: any): Promise<any>;
    authCallback(req: any, callback: (err: any) => void): void;
    authUrl(): string;
    refresh(refreshToken: string): Promise<any>;

    team: {
      roster(teamKey: string, changes?: any[]): Promise<any>;
      matchups(teamKey: string): Promise<any>;
      stats(teamKey: string, week?: string | number): Promise<any>;
      add_drop(teamKey: string, transaction: any): Promise<any>;
    };

    league: {
      standings(leagueKey: string): Promise<any>;
      players(leagueKey: string, filters?: any): Promise<any>;
      scoreboard(leagueKey: string, week?: string | number): Promise<any>;
    };

    player: {
      stats(playerKey: string): Promise<any>;
    };

    transactions: {
      add(teamKey: string, transaction: any): Promise<any>;
    };
  }
}
