import { create } from 'zustand';
import type { Team, Player, LeagueSeason } from '../types';
import type { TeamStandingRow, InGameMatchState, TacticalOffenseCommand, TacticalDefenseCommand } from '../types/proManagement';
import { db, initDummyDataIfNeeded } from '../db';
import { getProFixtures } from '../data/proSchedule';
import { isGraduatedCareer, prepareGMWorld, validateGMName } from '../data/gmWorld';
import { 
  initInGameMatch, 
  simulateAtBat, 
  quickSimulateMatch, 
  type BoxscoreRecord 
} from './proSimulation';

export interface ProLeagueState {
  teams: Team[];
  players: Player[];
  careerCandidates: Player[];
  draftProspects: Player[];
  season: LeagueSeason | null;
  standings: TeamStandingRow[];
  recentBoxscores: BoxscoreRecord[];
  inGameMatch: InGameMatchState | null;
  isLoading: boolean;
  currentDateStr: string;

  // Actions
  loadLeague: () => Promise<void>;
  startWorld: (year:number, teamId:number, careerId?:number) => Promise<void>;
  renameTeam: (id:number, name:string, shortName:string, venue:string) => Promise<void>;
  renamePlayer: (id:number, name:string) => Promise<void>;
  setUserTeam: (teamId: number) => Promise<void>;
  simulateDay: () => Promise<void>;
  simulateDays: (count: number) => Promise<void>;
  simulateToNextUserMatch: () => Promise<void>;
  startInGameMatch: () => void;
  executeTacticalAction: (offenseCmd?: TacticalOffenseCommand, defenseCmd?: TacticalDefenseCommand) => void;
  stepHalfInning: () => void;
  finishLiveGameSimulate: () => Promise<void>;
  closeLiveGame: () => Promise<void>;
}

export function computeStandings(teams: Team[], players: Player[]): TeamStandingRow[] {
  const sorted = [...teams].sort((a, b) => {
    const aGames = (a.wins ?? 0) + (a.draws ?? 0) + (a.losses ?? 0);
    const bGames = (b.wins ?? 0) + (b.draws ?? 0) + (b.losses ?? 0);
    const aWinRate = aGames > 0 ? (a.wins ?? 0) / (aGames - (a.draws ?? 0) || 1) : 0;
    const bWinRate = bGames > 0 ? (b.wins ?? 0) / (bGames - (b.draws ?? 0) || 1) : 0;
    if (bWinRate !== aWinRate) return bWinRate - aWinRate;
    const aDiff = (a.runsScored ?? 0) - (a.runsAllowed ?? 0);
    const bDiff = (b.runsScored ?? 0) - (b.runsAllowed ?? 0);
    return bDiff - aDiff;
  });

  const leader = sorted[0];
  const leaderWins = leader?.wins ?? 0;
  const leaderLosses = leader?.losses ?? 0;

  return sorted.map((t, index) => {
    const games = (t.wins ?? 0) + (t.draws ?? 0) + (t.losses ?? 0);
    const decisions = (t.wins ?? 0) + (t.losses ?? 0);
    const winRate = decisions > 0 ? Number(((t.wins ?? 0) / decisions).toFixed(3)) : 0;
    const gamesBehind = index === 0 ? 0 : Number((((leaderWins - (t.wins ?? 0)) + ((t.losses ?? 0) - leaderLosses)) / 2).toFixed(1));
    const runDiff = (t.runsScored ?? 0) - (t.runsAllowed ?? 0);

    const teamPlayers = players.filter(p => p.teamId === t.id);
    const batters = teamPlayers.filter(p => p.position !== 'P' && p.proStats?.batting);
    const pitchers = teamPlayers.filter(p => p.position === 'P' && p.proStats?.pitching);

    const totalHits = batters.reduce((acc, b) => acc + (b.proStats?.batting?.hits ?? 0), 0);
    const totalAb = batters.reduce((acc, b) => acc + (b.proStats?.batting?.ab ?? 0), 0);
    const teamAvg = totalAb > 0 ? Number((totalHits / totalAb).toFixed(3)) : 0.265;

    const totalER = pitchers.reduce((acc, p) => acc + (p.proStats?.pitching?.earnedRuns ?? 0), 0);
    const totalIP = pitchers.reduce((acc, p) => acc + (p.proStats?.pitching?.innings ?? 0), 0);
    const teamEra = totalIP > 0 ? Number(((totalER * 9) / totalIP).toFixed(2)) : 4.15;

    return {
      rank: index + 1,
      teamId: t.id ?? index + 1,
      code: t.code ?? 'TEAM',
      name: t.name,
      shortName: t.shortName ?? t.name,
      games,
      wins: t.wins ?? 0,
      draws: t.draws ?? 0,
      losses: t.losses ?? 0,
      winRate,
      gamesBehind,
      runsScored: t.runsScored ?? 0,
      runsAllowed: t.runsAllowed ?? 0,
      runDifferential: runDiff,
      last10: t.last10 ?? `${t.wins ?? 0}승 ${t.losses ?? 0}패`,
      streak: t.streak ?? '-',
      teamAvg,
      teamEra,
    };
  });
}

export const useProLeagueStore = create<ProLeagueState>((set, get) => ({
  teams: [],
  players: [],
  careerCandidates: [],
  draftProspects: [],
  season: null,
  standings: [],
  recentBoxscores: [],
  inGameMatch: null,
  isLoading: false,
  currentDateStr: '2026-03-28',

  loadLeague: async () => {
    set({ isLoading: true });
    try {
      await initDummyDataIfNeeded();
      const teams = await db.teams.toArray();
      const allPlayers = await db.players.toArray();
      const players = allPlayers.filter(p => p.status === 'Pro');
      let season = await db.leagueSeasons.toCollection().first();

      if (!season) {
        season = {
          year: 2026,
          currentStage: 'RegularSeason',
          currentDate: '2026-03-28',
          dayIndex: 0,
          userTeamId: teams[0]?.id ?? 1,
        };
        await db.leagueSeasons.add(season);
      }

      const standings = computeStandings(teams, players);
      if (season.setupCompleted === undefined && teams.some(t => (t.wins ?? 0)+(t.losses ?? 0)+(t.draws ?? 0)>0)) {
        season = { ...season, setupCompleted:true };
        await db.leagueSeasons.put(season);
      }
      set({
        teams,
        players,
        careerCandidates:allPlayers.filter(isGraduatedCareer),
        draftProspects:allPlayers.filter(p => p.status === 'DraftProspect'),
        season,
        standings,
        currentDateStr: season.currentDate ?? '2026-03-28',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  startWorld: async (year, teamId, careerId) => {
    const { season, teams, isLoading } = get();
    if (isLoading) return;
    if (!season || !teams.some(t => t.id === teamId && t.code)) throw new Error('시작할 구단을 선택해주세요.');
    set({ isLoading:true });
    try {
      const result = await db.transaction('rw', db.players, db.leagueSeasons, async () => {
        const current = await db.leagueSeasons.get(season.id!);
        if (!current) throw new Error('GM 저장을 찾지 못했습니다.');
        const source = careerId === undefined ? undefined : await db.players.get(careerId);
        if (careerId !== undefined && !source) throw new Error('연결할 선수 저장을 찾지 못했습니다.');
        const result = prepareGMWorld(current, year, teamId, source);
        if (result.prospect) result.prospect.id = await db.players.add(result.prospect);
        await db.leagueSeasons.put(result.season);
        return result;
      });
      set({ season:result.season, currentDateStr:result.season.currentDate!, draftProspects:result.prospect ? [...get().draftProspects,result.prospect] : get().draftProspects });
    } finally { set({ isLoading:false }); }
  },

  setUserTeam: async (teamId: number) => {
    const { season } = get();
    if (!season) return;
    const updated = { ...season, userTeamId: teamId };
    await db.leagueSeasons.put(updated);
    set({ season: updated });
  },

  renameTeam: async (id, name, shortName, venue) => {
    if (get().isLoading || get().inGameMatch) throw new Error('경기 또는 저장이 끝난 뒤 이름을 수정해주세요.');
    const fields={name:validateGMName(name,'구단명'), shortName:validateGMName(shortName,'약칭',24), venue:validateGMName(venue,'구장명',60), customName:true};
    set({isLoading:true});
    try {
      const updated=await db.transaction('rw',db.teams,async()=>{
        const current=await db.teams.get(id);
        if(!current) throw new Error('구단을 찾지 못했습니다.');
        const updated={...current,...fields}; await db.teams.put(updated); return updated;
      });
      const teams=get().teams.map(t=>t.id===id?updated:t);
      set({teams,standings:computeStandings(teams,get().players)});
    } finally {set({isLoading:false});}
  },

  renamePlayer: async (id, name) => {
    if (get().isLoading || get().inGameMatch) throw new Error('경기 또는 저장이 끝난 뒤 이름을 수정해주세요.');
    const normalized=validateGMName(name,'선수명');
    set({isLoading:true});
    try {
      const updated=await db.transaction('rw',db.players,async()=>{
        const current=await db.players.get(id);
        if(!current || !['Pro','DraftProspect'].includes(current.status)) throw new Error('GM 선수 또는 드래프트 후보를 선택해주세요.');
        const updated={...current,name:normalized}; await db.players.put(updated); return updated;
      });
      set({players:get().players.map(p=>p.id===id?updated:p),draftProspects:get().draftProspects.map(p=>p.id===id?updated:p)});
    } finally {set({isLoading:false});}
  },

  simulateDay: async () => {
    const { teams, players, season, currentDateStr, isLoading } = get();
    if (isLoading || !season?.setupCompleted) return;

    set({ isLoading: true });
    try {
      const allFixtures = getProFixtures(season.year);
      const todayFixtures = allFixtures.filter(f => f.date === currentDateStr && !f.cancelled);
      const newBoxscores: BoxscoreRecord[] = [];

      for (const fixture of todayFixtures) {
        const homeTeam = teams.find(t => t.code === fixture.home) || teams.find(t => t.name.includes(fixture.home)) || teams[0];
        const awayTeam = teams.find(t => t.code === fixture.away) || teams.find(t => t.name.includes(fixture.away)) || teams[1];
        const homePlayers = players.filter(p => p.teamId === homeTeam.id);
        const awayPlayers = players.filter(p => p.teamId === awayTeam.id);

        const matchId = `${fixture.date}_${fixture.away}_${fixture.home}`;
        const boxscore = quickSimulateMatch(matchId, fixture.date, homeTeam, awayTeam, homePlayers, awayPlayers);
        newBoxscores.push(boxscore);
      }

      // 다음 경기 일자로 이동
      const futureDates = [...new Set(allFixtures.map(f => f.date).filter(d => d > currentDateStr))].sort();
      const nextDate = futureDates[0] ?? currentDateStr;

      const updatedSeason = { ...season, currentDate: nextDate };
      await db.leagueSeasons.put(updatedSeason);
      await db.teams.bulkPut(teams);
      await db.players.bulkPut(players);

      const standings = computeStandings(teams, players);
      set({
        teams: [...teams],
        players: [...players],
        season: updatedSeason,
        currentDateStr: nextDate,
        standings,
        recentBoxscores: [...newBoxscores, ...get().recentBoxscores].slice(0, 30),
      });
    } finally {
      set({ isLoading: false });
    }
  },

  simulateDays: async (count: number) => {
    for (let i = 0; i < count; i++) {
      await get().simulateDay();
    }
  },

  simulateToNextUserMatch: async () => {
    const { season } = get();
    if (!season) return;
    const userTeam = get().teams.find(t => t.id === season.userTeamId);
    if (!userTeam) return;

    for (let step = 0; step < 10; step++) {
      const curDate = get().currentDateStr;
      const fixtures = getProFixtures(season.year).filter(f => f.date === curDate && !f.cancelled);
      const hasUserMatch = fixtures.some(f => f.home === userTeam.code || f.away === userTeam.code);
      if (hasUserMatch && step > 0) break;
      await get().simulateDay();
    }
  },

  startInGameMatch: () => {
    const { teams, players, season, currentDateStr } = get();
    if (!season?.setupCompleted || get().isLoading) return;
    const userTeam = teams.find(t => t.id === season.userTeamId) || teams[0];
    const fixtures = getProFixtures(season.year).filter(f => f.date === currentDateStr && !f.cancelled);
    const userFixture = fixtures.find(f => f.home === userTeam.code || f.away === userTeam.code) || fixtures[0];

    if (!userFixture) {
      alert('오늘은 경기가 없습니다. [하루 진행]을 눌러 다음 일정으로 이동하세요.');
      return;
    }

    const homeTeam = teams.find(t => t.code === userFixture.home) || teams[0];
    const awayTeam = teams.find(t => t.code === userFixture.away) || teams[1];
    const homePlayers = players.filter(p => p.teamId === homeTeam.id);
    const awayPlayers = players.filter(p => p.teamId === awayTeam.id);

    const matchId = `${userFixture.date}_${userFixture.away}_${userFixture.home}`;
    const inGame = initInGameMatch(matchId, currentDateStr, homeTeam, awayTeam, homePlayers, awayPlayers);
    set({ inGameMatch: inGame });
  },

  executeTacticalAction: (offenseCmd, defenseCmd) => {
    const { inGameMatch, teams, players } = get();
    if (!inGameMatch || inGameMatch.isGameOver) return;

    const homeTeam = teams.find(t => t.code === inGameMatch.homeTeamCode) || teams[0];
    const awayTeam = teams.find(t => t.code === inGameMatch.awayTeamCode) || teams[1];
    const homePlayers = players.filter(p => p.teamId === homeTeam.id);
    const awayPlayers = players.filter(p => p.teamId === awayTeam.id);

    const updated = simulateAtBat(inGameMatch, homePlayers, awayPlayers, offenseCmd, defenseCmd);
    set({ inGameMatch: { ...updated } });
  },

  stepHalfInning: () => {
    const { inGameMatch } = get();
    if (!inGameMatch || inGameMatch.isGameOver) return;
    const currentInning = inGameMatch.inning;
    const currentIsTop = inGameMatch.isTop;

    while (
      get().inGameMatch && 
      !get().inGameMatch?.isGameOver && 
      get().inGameMatch?.inning === currentInning && 
      get().inGameMatch?.isTop === currentIsTop
    ) {
      get().executeTacticalAction();
    }
  },

  finishLiveGameSimulate: async () => {
    const { inGameMatch } = get();
    if (!inGameMatch) return;

    while (get().inGameMatch && !get().inGameMatch?.isGameOver) {
      get().executeTacticalAction();
    }
  },

  closeLiveGame: async () => {
    const { inGameMatch, teams, players, season } = get();
    if (!inGameMatch || !season) {
      set({ inGameMatch: null });
      return;
    }

    // 경기 결과를 팀 전적에 반영
    const homeTeam = teams.find(t => t.code === inGameMatch.homeTeamCode);
    const awayTeam = teams.find(t => t.code === inGameMatch.awayTeamCode);

    if (homeTeam && awayTeam) {
      if (inGameMatch.homeScore > inGameMatch.awayScore) {
        homeTeam.wins = (homeTeam.wins ?? 0) + 1;
        awayTeam.losses = (awayTeam.losses ?? 0) + 1;
      } else if (inGameMatch.awayScore > inGameMatch.homeScore) {
        awayTeam.wins = (awayTeam.wins ?? 0) + 1;
        homeTeam.losses = (homeTeam.losses ?? 0) + 1;
      } else {
        homeTeam.draws = (homeTeam.draws ?? 0) + 1;
        awayTeam.draws = (awayTeam.draws ?? 0) + 1;
      }
      homeTeam.runsScored = (homeTeam.runsScored ?? 0) + inGameMatch.homeScore;
      homeTeam.runsAllowed = (homeTeam.runsAllowed ?? 0) + inGameMatch.awayScore;
      awayTeam.runsScored = (awayTeam.runsScored ?? 0) + inGameMatch.awayScore;
      awayTeam.runsAllowed = (awayTeam.runsAllowed ?? 0) + inGameMatch.homeScore;

      await db.teams.bulkPut(teams);
      await db.players.bulkPut(players);
    }

    const boxscore: BoxscoreRecord = {
      matchId: inGameMatch.matchId,
      dateStr: inGameMatch.dateStr,
      homeTeamName: inGameMatch.homeTeamName,
      awayTeamName: inGameMatch.awayTeamName,
      homeScore: inGameMatch.homeScore,
      awayScore: inGameMatch.awayScore,
      homeHits: inGameMatch.homeHits,
      awayHits: inGameMatch.awayHits,
      homeErrors: inGameMatch.homeErrors,
      awayErrors: inGameMatch.awayErrors,
      winningPitcher: inGameMatch.homeScore > inGameMatch.awayScore ? inGameMatch.homeTeamName : inGameMatch.awayTeamName,
      mvp: inGameMatch.currentBatter?.name,
    };

    const standings = computeStandings(teams, players);
    set({
      inGameMatch: null,
      standings,
      recentBoxscores: [boxscore, ...get().recentBoxscores].slice(0, 30),
    });

    // 오늘 다른 구단들의 경기들도 함께 시뮬레이션
    await get().simulateDay();
  },
}));
