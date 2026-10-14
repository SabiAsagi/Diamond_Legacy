import { create } from 'zustand';
import type { Team, Player, LeagueSeason } from '../types';
import type { TeamStandingRow, InGameMatchState, TacticalOffenseCommand, TacticalDefenseCommand } from '../types/proManagement';
import { db, initDummyDataIfNeeded } from '../db';
import { isGraduatedCareer, prepareGMWorld, validateGMName } from '../data/gmWorld';
import { initInGameMatch, simulateAtBat } from './gmMatch';
import type { BoxscoreRecord } from './proSimulation';
import { applyGMCommand, type GMCommand, selectGameRoster } from '../data/gmOperations';
import { initializeOrganization, ensureDraftClass } from '../data/gmOrganization';
import { advanceGMDay, gmFixtures } from '../data/gmSeason';

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
  livePlayers: Player[] | null;
  initializeGM: () => Promise<void>;
  command: (command:GMCommand) => Promise<void>;
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
  livePlayers: null,
  currentDateStr: '2026-03-28',

  loadLeague: async () => {
    if(get().isLoading || get().inGameMatch) return;
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
        recentBoxscores:[...(season.office?.results??[])].reverse().slice(0,30),
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
    if (!season || get().isLoading || get().inGameMatch) return;
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

  initializeGM: async () => {
    if(get().isLoading || get().inGameMatch || !get().season?.setupCompleted || get().season?.office?.initialized)return;
    set({isLoading:true});
    try {
      const result=await db.transaction('rw',db.teams,db.players,db.leagueSeasons,async()=>{
        const all=await db.players.toArray();
        const world={teams:structuredClone(get().teams),players:all.filter(p=>['Pro','DraftProspect'].includes(p.status)),season:structuredClone(get().season!)};
        initializeOrganization(world.teams,world.players,world.season,Math.max(0,...all.map(p=>p.id??0))+1);
        await persistWorld(world);return world;
      });
      setWorld(set,result);
    } finally {set({isLoading:false});}
  },
  command: async (command) => {
    if(get().isLoading || get().inGameMatch) throw new Error('경기 또는 저장이 끝난 뒤 진행해주세요.');
    await get().initializeGM();
    set({isLoading:true});
    try {
      const result=await db.transaction('rw',db.teams,db.players,db.leagueSeasons,async()=>{
        const all=await db.players.toArray();
        const world=applyGMCommand({teams:get().teams,players:all.filter(p=>['Pro','DraftProspect'].includes(p.status)),season:get().season!},command);
        if(command.type==='nextSeason') {
          ensureDraftClass(world.teams,world.players,world.season.year,Math.max(0,...all.map(p=>p.id??0))+1);
          // AI renews available players within budget. User contracts stay under manual control.
          for(const t of world.teams.filter(t=>t.id!==world.season.userTeamId)){
            const expired=world.players.filter(p=>p.teamId===undefined&&!p.gm?.futuresTeamId&&p.status==='Pro').sort((a,b)=>b.overall-a.overall);
            let spent=world.players.filter(p=>p.teamId===t.id&&p.status==='Pro').reduce((n,p)=>n+(p.salary??5000)*10000,0);
            for(const p of expired){if(world.players.filter(p=>p.teamId===t.id&&p.status==='Pro').length>=45)break;const salary=Math.max(3000,(p.overall-35)**2*25);if(spent+salary*10000<=t.budget){p.teamId=t.id;p.salary=Math.round(salary);p.contractYears=2;p.rosterTier='2군';spent+=salary*10000;}}
          }
        }
        await persistWorld(world);return world;
      });
      setWorld(set,result);
    }finally{set({isLoading:false});}
  },
  simulateDay: async () => {
    if(get().isLoading || get().inGameMatch || !get().season?.setupCompleted)return;
    await get().initializeGM();
    set({isLoading:true});
    try {
      const result=await db.transaction('rw',db.teams,db.players,db.leagueSeasons,async()=>{
        const world={teams:structuredClone(get().teams),players:structuredClone([...get().players,...get().draftProspects]),season:structuredClone(get().season!)};
        advanceGMDay(world.teams,world.players,world.season);
        await persistWorld(world);return world;
      });
      setWorld(set,result);
    }finally{set({isLoading:false});}
  },
  simulateDays: async (count) => {
    for(let i=0;i<Math.min(366,Math.max(0,count));i++){
      const before=get().currentDateStr;
      if(['Draft','Offseason'].includes(get().season?.currentStage??''))break;
      await get().simulateDay();if(get().currentDateStr===before)break;
    }
  },
  simulateToNextUserMatch: async () => {
    const team=get().teams.find(t=>t.id===get().season?.userTeamId);if(!team)return;
    for(let i=0;i<366;i++){
      if(['Draft','Offseason'].includes(get().season?.currentStage??''))return;
      const before=get().currentDateStr;await get().simulateDay();if(get().currentDateStr===before)return;
      if(gmFixtures(get().season!).some(f=>f.home===team.code||f.away===team.code||f.home===String(team.id)||f.away===String(team.id)))return;
    }
  },
  startInGameMatch: () => {
    const {teams,players,season,isLoading,currentDateStr,inGameMatch}=get();
    if(isLoading||inGameMatch||!season?.setupCompleted)return;
    if(!season.office?.initialized)throw new Error('먼저 운영실에서 선수단 준비를 완료해주세요.');
    const user=teams.find(t=>t.id===season.userTeamId)!;
    const f=gmFixtures(season).find(f=>f.home===user.code||f.away===user.code||f.home===String(user.id)||f.away===String(user.id));
    if(!f)throw new Error('오늘 우리 구단 경기가 없습니다.');
    const home=teams.find(t=>season.currentStage==='Playoffs'?t.id===Number(f.home):t.code===f.home)!;
    const away=teams.find(t=>season.currentStage==='Playoffs'?t.id===Number(f.away):t.code===f.away)!;
    const livePlayers=structuredClone(players);
    if(season.currentStage==='Playoffs')for(const p of livePlayers)p.proStats=structuredClone(p.gm?.postseasonStats??{});
    const hp=selectGameRoster(home,livePlayers,currentDateStr,season.dayIndex),ap=selectGameRoster(away,livePlayers,currentDateStr,season.dayIndex);
    set({livePlayers,inGameMatch:initInGameMatch(`${f.date}_${f.away}_${f.home}`,currentDateStr,home,away,hp,ap)});
  },
  executeTacticalAction: (offense,defense) => {
    const {inGameMatch,teams,livePlayers,season,currentDateStr}=get();if(!inGameMatch||inGameMatch.isGameOver||!livePlayers||!season)return;
    const home=teams.find(t=>t.code===inGameMatch.homeTeamCode)!,away=teams.find(t=>t.code===inGameMatch.awayTeamCode)!;
    const hp=selectGameRoster(home,livePlayers,currentDateStr,season.dayIndex),ap=selectGameRoster(away,livePlayers,currentDateStr,season.dayIndex);
    set({inGameMatch:simulateAtBat(inGameMatch,hp,ap,offense,defense)});
  },
  stepHalfInning: () => {
    const first=get().inGameMatch;if(!first)return;
    for(let i=0;i<300;i++){const s=get().inGameMatch;if(!s||s.isGameOver||s.inning!==first.inning||s.isTop!==first.isTop)break;get().executeTacticalAction();}
  },
  finishLiveGameSimulate: async () => {
    for(let i=0;i<1500;i++){if(!get().inGameMatch||get().inGameMatch?.isGameOver)break;get().executeTacticalAction();}
  },
  closeLiveGame: async () => {
    const {inGameMatch,livePlayers,isLoading}=get();if(isLoading||!inGameMatch||!livePlayers)return;
    if(!inGameMatch.isGameOver)throw new Error('경기를 마친 뒤 결과를 확정해주세요.');
    set({isLoading:true});
    try {
      const result=await db.transaction('rw',db.teams,db.players,db.leagueSeasons,async()=>{
        const world={teams:structuredClone(get().teams),players:structuredClone([...livePlayers,...get().draftProspects]),season:structuredClone(get().season!)};
        advanceGMDay(world.teams,world.players,world.season,inGameMatch,get().players);
        await persistWorld(world);return world;
      });
      setWorld(set,result);set({inGameMatch:null,livePlayers:null});
    }finally{set({isLoading:false});}
  },
}));

async function persistWorld(world:{teams:Team[];players:Player[];season:LeagueSeason}) {
  for(const t of world.teams)await db.teams.put(t);
  for(const p of world.players)await db.players.put(p);
  await db.leagueSeasons.put(world.season);
}
function setWorld(set:(state:Partial<ProLeagueState>)=>void,world:{teams:Team[];players:Player[];season:LeagueSeason}) {
  const players=world.players.filter(p=>p.status==='Pro');
  set({teams:world.teams,players,draftProspects:world.players.filter(p=>p.status==='DraftProspect'),season:world.season,currentDateStr:world.season.currentDate!,standings:computeStandings(world.teams,players),recentBoxscores:[...(world.season.office?.results??[])].reverse().slice(0,30)});
}
