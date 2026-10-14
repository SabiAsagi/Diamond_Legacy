import type { Player } from './index';

export interface ProBattingStats {
  games: number;
  pa: number;        // 타석
  ab: number;        // 타수
  hits: number;      // 안타
  doubles: number;   // 2루타
  triples: number;   // 3루타
  hr: number;        // 홈런
  rbi: number;       // 타점
  runs: number;      // 득점
  bb: number;        // 볼넷
  so: number;        // 삼진
  sb: number;        // 도루
  avg: number;       // 타율
  obp: number;       // 출루율
  slg: number;       // 장타율
  ops: number;       // OPS
}

export interface ProPitchingStats {
  games: number;
  starts: number;    // 선발
  wins: number;      // 승
  losses: number;    // 패
  saves: number;     // 세이브
  holds: number;     // 홀드
  innings: number;   // 투구 이닝
  hitsAllowed: number;
  hrAllowed: number;
  bbAllowed: number;
  so: number;        // 탈삼진
  runsAllowed: number;
  earnedRuns: number;// 자책점
  era: number;       // 평균자책점
  whip: number;      // WHIP
}

export interface ProPlayerStats {
  batting?: ProBattingStats;
  pitching?: ProPitchingStats;
}

export type TacticalOffenseCommand = 
  | 'swing'          // 강공 타격
  | 'bunt'           // 희생번트
  | 'steal'          // 도루 시도
  | 'hit_and_run'    // 치고 달리기
  | 'pinch_hit'      // 대타 기용
  | 'pinch_run';     // 대주자 기용

export type TacticalDefenseCommand =
  | 'pitch_strike'   // 정면 승부 (존 공략)
  | 'pitch_waste'    // 유인구 (삼진/땅볼 유도)
  | 'intentional_walk' // 고의사구
  | 'infield_in'     // 전진 수비
  | 'shift'          // 수비 시프트
  | 'pitching_change'; // 투수 교체

export interface InGamePlayLog {
  id: string;
  inningText: string;
  text: string;
  scoreChange?: boolean;
}

export interface InGameMatchState {
  matchId: string;
  dateStr: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
  awayTeamCode: string;
  
  inning: number;           // 1 ~ 12
  isTop: boolean;           // true: 초 (away 공격), false: 말 (home 공격)
  outs: number;             // 0 ~ 2
  balls: number;            // 0 ~ 3
  strikes: number;          // 0 ~ 2
  bases: [boolean, boolean, boolean]; // [1루, 2루, 3루]
  runners: [string | null, string | null, string | null]; // 주자 이름
  
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  inningScoresHome: (number | null)[];
  inningScoresAway: (number | null)[];
  
  currentBatter: Player;
  currentPitcher: Player;
  currentBatterIndex: { away: number; home: number };
  
  playLogs: InGamePlayLog[];
  isGameOver: boolean;
  winnerTeamCode?: string;
}

export interface TeamStandingRow {
  rank: number;
  teamId: number;
  code: string;
  name: string;
  shortName: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  gamesBehind: number;
  runsScored: number;
  runsAllowed: number;
  runDifferential: number;
  last10: string;
  streak: string;
  teamAvg: number;
  teamEra: number;
}
