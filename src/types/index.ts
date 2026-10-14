export * from './highSchool';
export * from './calendar';
export * from './academicCalendar';
export * from './tournament';
export * from './dailySchedule';
export * from './activity';
export * from './equipment';
export * from './outdoorMap';
export * from './relationship';
export * from './proManagement';

import type { GameDate, TimeSlot } from './calendar';
import type { EquipmentSlot } from './equipment';

export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'TwoWay';

export const POSITION_LABELS: Record<Position, string> = {
  P: '투수',
  C: '포수',
  '1B': '1루수',
  '2B': '2루수',
  '3B': '3루수',
  SS: '유격수',
  LF: '좌익수',
  CF: '중견수',
  RF: '우익수',
  TwoWay: '투타겸업',
};

export type PlayerStatus = 'HighSchool' | 'Pro' | 'Minor' | 'Military' | 'Retired' | 'DraftProspect';
export type Gender = 'male' | 'female';

export type Handedness = 'R/R' | 'R/L' | 'L/R' | 'L/L'; // 우투우타, 우투좌타, 좌투우타, 좌투좌타
export type PitchingForm = 'Overhand' | 'ThreeQuarter' | 'Sidearm' | 'Underhand' | 'None';
export type PitcherRole = 'Starter' | 'Reliever' | 'Closer' | 'None';
export type BattingForm = 'Open' | 'Straight' | 'LegKick' | 'ToeTap' | 'None';

export interface Player {
  careerJourney?: import('../data/careerJourney').CareerJourney;
  readNewsIds?: string[]; // 선수별 새 소식 읽음 기록 · 재접속 후에도 유지
  careerEndedAt?: GameDate; // 졸업 확정 시 저장하여 재접속 후에도 종료 유지
  monthlyGoal?: import('../data/monthlyGoals').MonthlyGoal;
  monthlyGoalReports?: import('../data/monthlyGoals').MonthlyGoalReport[];
  gradeStartSnapshot?: import('../data/gradeReport').GradeSnapshot;
  gradeReports?: import('../data/gradeReport').GradeReport[];
  pendingGradeReportId?: string;
  dailyActionLogs?: { date: string; logs: Partial<Record<TimeSlot, string>> };
  teamCompetition?: import('../data/teamCompetition').TeamCompetition;
  earnedAchievementIds?: string[];
  earnedTrophyIds?: string[];
  gapPower?: number; avoidK?: number; movement?: number; holdRunners?: number;
  stealing?: number; baserunning?: number; fieldingRange?: number; fieldingError?: number; arm?: number; velocity?: number;
  pitches?: import('../data/playerDevelopment').PitchRating[];
  appearance?: import('../data/playerDevelopment').Appearance;
  cast?: import('../data/cast').Cast; // 회차별 학생 인물. 없으면 기존 기본 인물
  siblings?: 'none' | 'older' | 'younger' | 'both';
  savedMatches?: import('./tournament').ScheduledMatch[];
  savedSeasonYear?: number;
  eventHistory?: import('./randomEvent').CutsceneTriggerHistory;
  pendingEventId?: string;
  matchRecords?: { matchId: string; year: number; log: string; kind?: import('./tournament').MatchKind; performance?: import('../data/teamCompetition').MatchPerformance }[];

  id?: number; // Auto-incremented
  name: string;
  gender: Gender;
  age: number;
  position: Position;
  status: PlayerStatus;
  teamId?: number; // null if not in a team (e.g. High school or retired)
  
  // Basic attributes
  uniformNumber: number | string;
  highSchool: string;
  handedness: Handedness;
  
  // Pitcher Attributes
  pitchingForm: PitchingForm;
  pitcherRole: PitcherRole;
  
  // Batter Attributes
  battingForm: BattingForm;
  
  // Overall & Potential
  overall: number; // Base starts at 20
  potential: number; // Growth potential
  
  // Batting Ratings (0-100 scale)
  contact: number;
  power: number;
  eye: number; // Plate discipline
  speed: number;
  defense: number;
  
  // Pitcher specific ratings (0-100 scale)
  stuff: number;
  control: number;
  stamina: number;

  // Development Event Stats
  condition: number; // 0-100 (멘탈/컨디션)
  academics: number; // 0-100 (학업 성취도)
  rivalProgress?: import('../data/rival').RivalProgress;
  pendingRivalReport?: import('../data/rival').RivalReport;
  relationships: Partial<import('./bondScores').BondScores>; // 인물별 영구 저장 점수

  // Career Story & Progression
  traits?: string[]; // 획득한 고유 특성 (예: '파이어볼러', '거포 본능' 등)
  interviewCompleted?: boolean; // 감독 면담 완료 여부
  chosenPathTitle?: string; // 면담에서 선택한 목표
  grade?: number; // 고1, 고2, 고3 (1, 2, 3)
  month?: number; // 3월 ~ 다음해 2월
  week?: number; // 1주 ~ 4주 (하위 호환 유지)
  day?: number; // 1 ~ 31
  fame?: number; // 전국 인지도 / 스카우트 주목도 (0-100)
  money?: number;
  familyBackground?: 'parents' | 'grandmother' | 'olderSibling' | 'youngerSibling';
  careerGoal?: 'KBO' | 'Overseas' | 'University';
  inventory?: string[];
  equippedItems?: Partial<Record<EquipmentSlot, string>>;
  lastOutdoorVisitDate?: string;

  // 신규 일일 생활 시뮬레이션 & 캘린더 시계 필드
  gameDate?: GameDate;
  currentSlot?: TimeSlot;
  injuryStatus?: string;

  // 프로 구단 관리 & GM 모드 필드
  proStats?: import('./proManagement').ProPlayerStats;
  rosterTier?: '1군' | '2군' | '3군';
  salary?: number; // 연봉 (만원 단위)
  contractYears?: number; // 잔여 계약 기간
  draftSourceCareerId?: number;
  draftClassYear?: number;
  gm?: {
    fatigue: number;
    injuryUntil?: string;
    training: 'balanced' | 'hitting' | 'pitching' | 'fielding';
    futuresTeamId?: number;
    recallAfter?: string;
    futuresStats?: import('./proManagement').ProPlayerStats;
    postseasonStats?: import('./proManagement').ProPlayerStats;
    registration?: 'registered' | 'development';
    developmentSignedYear?:number;
    releasedInYear?:number;
    seasonHistory?: { year:number; teamId?:number; stats:import('./proManagement').ProPlayerStats }[];
  };
}

export interface Team {
  customName?: boolean;
  id?: number;
  code?: string; // 'TWINS', 'BEARS', 'HEROES', 'LANDERS', 'WIZ', 'EAGLES', 'TIGERS', 'LIONS', 'GIANTS', 'DINOS'
  name: string; // '서울 트윈스'
  shortName?: string; // '트윈스'
  city: string; // '서울'
  venue?: string; // '잠실야구장'
  budget: number; // 잔여 예산 (원)
  payroll?: number; // 총 연봉
  fanBase: number; // 0-100 (팬덤 / 인기도)
  reputation?: number; // 0-100 (구단 명성)
  primaryColor?: string;
  secondaryColor?: string;
  
  // 시즌 기록 (Standings)
  wins?: number;
  draws?: number;
  losses?: number;
  runsScored?: number;
  runsAllowed?: number;
  streak?: string;
  last10?: string;
  
  // OOTP 라인업 & 로스터 설정
  lineup?: number[];
  rotation?: number[];
  bullpen?: {
    setup?: number;
    closer?: number;
    middle?: number[];
  };
}

export interface LeagueSeason {
  office?: import('../data/gmOperations').GMOffice;
  setupCompleted?: boolean;
  sourceCareerId?: number;
  id?: number;
  year: number;
  currentDate?: string;
  currentStage: 'Offseason' | 'SpringTraining' | 'RegularSeason' | 'Playoffs' | 'Draft';
  dayIndex?: number;
  userTeamId?: number;
}

