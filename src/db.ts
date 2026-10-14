import Dexie, { type Table } from 'dexie';
import type { Player, Team, LeagueSeason } from './types';
import { buildDefaultProPlayers } from './data/proClubs';
import { reconcileProTeams } from './data/gmWorld';

export class DiamondGMDexie extends Dexie {
  players!: Table<Player, number>;
  teams!: Table<Team, number>;
  leagueSeasons!: Table<LeagueSeason, number>;

  constructor() {
    super('DiamondGMDatabase');
    this.version(1).stores({
      players: '++id, name, age, position, status, teamId',
      teams: '++id, name, city',
      leagueSeasons: '++id, year'
    });
  }
}

export const db = new DiamondGMDexie();

export async function initDummyDataIfNeeded() {
  await db.transaction('rw', db.teams, db.players, db.leagueSeasons, async () => {
    const existing = await db.teams.toArray();
    const teams: Team[] = [];
    for (const team of reconcileProTeams(existing)) {
      if (team.id !== undefined) {
        const previous = existing.find(t => t.id === team.id);
        if (JSON.stringify(previous) !== JSON.stringify(team)) await db.teams.put(team);
        teams.push(team);
      } else {
        const id = await db.teams.add(team);
        teams.push({ ...team, id });
      }
    }
    const players = await db.players.toArray();
    const emptyTeams = teams.filter(t => t.code && !players.some(p => p.teamId === t.id && p.status === 'Pro'));
    const seed = buildDefaultProPlayers(emptyTeams).map(p => ({ ...p, id:undefined }));
    if (seed.length) await db.players.bulkAdd(seed);
    if (await db.leagueSeasons.count() === 0) await db.leagueSeasons.add({ year:2026, currentStage:'RegularSeason', currentDate:'2026-03-28', dayIndex:0, userTeamId:teams[0]?.id, setupCompleted:false });
  });
}
