// TypeScript interfaces for Yahoo Fantasy API responses

export interface YahooToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  xoauth_yahoo_guid: string;
  timestamp?: number; // Added by us to track when token was issued
}

export interface Player {
  player_id: string;
  name: {
    full: string;
    first: string;
    last: string;
  };
  primary_position: string;
  editorial_team_abbr: string;
  status?: string;
  selected_position?: {
    position: string;
  };
  ownership?: {
    ownership_type: string;
  };
  percent_owned?: {
    value: string;
  };
  player_stats?: {
    stats: Stat[];
  };
}

export interface Stat {
  stat_id: number;
  name: string;
  value: string;
}

export interface Team {
  team_key: string;
  team_id: string;
  name: string;
  team_standings?: {
    rank: number;
    outcome_totals: {
      wins: number;
      losses: number;
      ties: number;
    };
    points_for: string;
  };
  team_projected_points?: {
    total: string;
  };
}

export interface Roster {
  team_key: string;
  name: string;
  roster: Player[];
}

export interface Matchup {
  week: number;
  teams: Team[];
}

export interface RosterPlayer {
  player_id: string;
  name: string;
  position: string;
  status?: string;
  selected_position: string;
  team: string;
}

export interface StandingTeam {
  team_name: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  points: string;
}

export interface AvailablePlayer {
  player_id: string;
  name: string;
  position: string;
  team: string;
  ownership: string;
  percent_owned: string;
}
