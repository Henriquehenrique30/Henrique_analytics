
export interface FootballEvent {
  type: string;
  x: number;
  y: number;
  timestamp: string;
  success: boolean;
  subtype?: string;
}

export interface PlayerStats {
  passes: number;
  passesAccurate: number;
  passAccuracy: number;
  shots: number;
  shotsOnTarget: number;
  duels: number;
  duelsWon: number;
  interceptions: number;
  tackles: number;
  goals: number;
  assists: number;
  keyPasses: number;
  chances: number;
  chancesCreated: number;
  errors: number;
  dribbles: number;
  dribblesWon: number;
  rating: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  photoUrl: string | null;
  position: string;
}

export interface AnalysisState {
  player: PlayerInfo;
  events: FootballEvent[];
  stats: PlayerStats;
  aiInsights: string;
}

export interface ParseResult {
  events: FootballEvent[];
  stats: PlayerStats;
  detectedPlayerName?: string;
}

export interface RegisteredGame {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  competition: string;
}

export interface MatchPerformance {
  id: string;
  playerId: string;
  gameId: string;
  analysis: AnalysisState;
}
