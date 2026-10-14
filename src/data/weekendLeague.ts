import type { HighSchoolData } from '../types/highSchool';
import type { GameDate } from '../types/calendar';
import type { ScheduledMatch } from '../types/tournament';

export const WEEKEND_SCHEDULE_VERSION = 2;
const REGIONS = [
  ['서울'], ['경기', '인천'], ['강원', '충북', '충남', '대전', '세종'],
  ['광주', '전남', '전북'], ['부산', '울산', '경남', '대구', '경북', '제주'],
];

/** 실제 편성표의 권역·전후반 재편성만 참고한다. 게임은 최대 7팀 조로 압축한다. */
export function getWeekendGroup(school: HighSchoolData, schools: HighSchoolData[], half: 1 | 2) {
  const regions = REGIONS.find(r => r.includes(school.region)) ?? [school.region];
  const pool = schools.filter(s => regions.includes(s.region));
  if (!pool.some(s => s.id === school.id)) pool.push(school);
  pool.sort((a, b) => a.region.localeCompare(b.region, 'ko') || a.id.localeCompare(b.id));
  // 후반기에는 조를 다시 편성한다. 전반기와 같은 상대를 만나는 것은 허용한다.
  if (half === 2 && pool.length > 7) pool.push(...pool.splice(0, 3));
  const count = Math.max(1, Math.ceil(pool.length / 7));
  const smallSize = Math.floor(pool.length / count);
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const size = smallSize + (i < pool.length % count ? 1 : 0);
    const teams = pool.slice(offset, offset + size);
    offset += size;
    if (teams.some(s => s.id === school.id)) return { name: `${regions.join('·')} ${i + 1}조`, teams };
  }
  return { name: `${school.region} 1조`, teams: [school] };
}

export function generateWeekendMatches(year: number, school: HighSchoolData, schools: HighSchoolData[]): ScheduledMatch[] {
  return ([1, 2] as const).flatMap(half => {
    const group = getWeekendGroup(school, schools, half);
    const first = new Date(year, half === 1 ? 2 : 4, half === 1 ? 7 : 23);
    first.setDate(first.getDate() + (6 - first.getDay() + 7) % 7);
    return group.teams.filter(s => s.id !== school.id).map((opponent, index) => {
      const date = new Date(first);
      date.setDate(date.getDate() + index * 7);
      const home = index % 2 === 0 ? school : opponent;
      const away = index % 2 === 0 ? opponent : school;
      const stage = half === 1 ? '전반기' : '후반기';
      return { id: `weekend_v2_${year}_${half}_${school.id}_${opponent.id}`, year, kind: 'weekend',
        scheduleVersion: WEEKEND_SCHEDULE_VERSION, leagueHalf: half, group: group.name, drawn: true,
        date: { month: date.getMonth() + 1, day: date.getDate() }, tournamentId: 'weekend_league',
        tournamentName: '고교야구 주말리그', round: `${stage} ${index + 1}차전`,
        homeSchoolId: home.id, homeSchoolName: home.name, awaySchoolId: away.id, awaySchoolName: away.name,
        isPlayerTeamMatch: true,
        description: `${stage} ${group.name} · ${group.teams.length}팀 단일 순환 · 게임 편성(실제 날짜와 다름)`,
      } satisfies ScheduledMatch;
    });
  });
}

/** 기존 결과와 지난 일정은 보존하고 남은 매주 반복 일정만 한 번 교체한다. */
export function migrateWeekendMatches(matches: ScheduledMatch[], year: number, school: HighSchoolData, schools: HighSchoolData[], from: GameDate): ScheduledMatch[] {
  const legacy = (m: ScheduledMatch) => m.tournamentId === 'weekend_league' && /^weekend_\d{1,2}_\d{1,2}$/.test(m.id) && m.scheduleVersion !== WEEKEND_SCHEDULE_VERSION;
  if (!matches.some(legacy)) return matches;
  const order = (d: { month: number; day: number }) => d.month * 32 + d.day;
  const kept = matches.filter(m => !legacy(m) || m.result || order(m.date) < order(from))
    .map(m => m.tournamentId === 'weekend_league' ? { ...m, scheduleVersion: WEEKEND_SCHEDULE_VERSION } : m);
  const keptIds = new Set(kept.map(m => m.id));
  const future = generateWeekendMatches(year, school, schools).filter(m => {
    if (order(m.date) < order(from) || keptIds.has(m.id)) return false;
    const played = kept.filter(k => k.tournamentId === 'weekend_league' && k.result && (k.leagueHalf ?? (k.date.month <= 6 ? 1 : 2)) === m.leagueHalf);
    const opponentId = m.homeSchoolId === school.id ? m.awaySchoolId : m.homeSchoolId;
    return played.length < 6 && !played.some(k => k.homeSchoolId === opponentId || k.awaySchoolId === opponentId);
  });
  // 이미 끝난 경기 수를 포함해 반기당 6경기를 넘기지 않는다.
  return [...kept, ...future.filter((m, index) => {
    const playedCount = kept.filter(k => k.tournamentId === 'weekend_league' && k.result && (k.leagueHalf ?? (k.date.month <= 6 ? 1 : 2)) === m.leagueHalf).length;
    return playedCount + future.slice(0, index).filter(k => k.leagueHalf === m.leagueHalf).length < 6;
  })];
}

export interface WeekendGroupStanding {
  rank: number;
  schoolId: string;
  schoolName: string;
  isPlayerSchool: boolean;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  runsScored: number;
  runsAllowed: number;
  runDiff: number;
}

export function getWeekendGroupStandings(
  school: HighSchoolData,
  schools: HighSchoolData[],
  matches: ScheduledMatch[],
  half: 1 | 2
): { groupName: string; standings: WeekendGroupStanding[] } {
  const group = getWeekendGroup(school, schools, half);
  const playedMatches = matches.filter(
    m => m.tournamentId === 'weekend_league' && m.leagueHalf === half && m.result
  );

  const statsMap = new Map<string, { wins: number; draws: number; losses: number; rs: number; ra: number }>();
  for (const s of group.teams) {
    statsMap.set(s.id, { wins: 0, draws: 0, losses: 0, rs: 0, ra: 0 });
  }

  // 1. 플레이어 학교 경기 결과 반영
  for (const m of playedMatches) {
    const homeStats = statsMap.get(m.homeSchoolId);
    const awayStats = statsMap.get(m.awaySchoolId);
    if (!homeStats || !awayStats) continue;

    if (m.result === 'home') {
      homeStats.wins++;
      awayStats.losses++;
      homeStats.rs += 5; homeStats.ra += 2;
      awayStats.rs += 2; awayStats.ra += 5;
    } else if (m.result === 'away') {
      awayStats.wins++;
      homeStats.losses++;
      awayStats.rs += 5; awayStats.ra += 2;
      homeStats.rs += 2; homeStats.ra += 5;
    }
  }

  // 2. 다른 학교들 간의 경기 진행도 시뮬레이션
  const myPlayedCount = playedMatches.length;
  const otherTeams = group.teams.filter(s => s.id !== school.id);
  const seed = (half * 100) + group.teams.length;
  for (let i = 0; i < otherTeams.length; i++) {
    for (let j = i + 1; j < otherTeams.length; j++) {
      const matchIndex = (i * 3 + j);
      if (matchIndex < myPlayedCount) {
        const teamA = otherTeams[i];
        const teamB = otherTeams[j];
        const aStats = statsMap.get(teamA.id)!;
        const bStats = statsMap.get(teamB.id)!;
        const aWins = (matchIndex + seed + teamA.name.length) % 2 === 0;
        if (aWins) {
          aStats.wins++; bStats.losses++;
          aStats.rs += 4; aStats.ra += 2;
          bStats.rs += 2; bStats.ra += 4;
        } else {
          bStats.wins++; aStats.losses++;
          bStats.rs += 4; bStats.ra += 2;
          aStats.rs += 2; aStats.ra += 4;
        }
      }
    }
  }

  const standingsList: WeekendGroupStanding[] = group.teams.map(s => {
    const st = statsMap.get(s.id)!;
    const games = st.wins + st.draws + st.losses;
    const winRate = games > 0 ? Number((st.wins / games).toFixed(3)) : 0;
    const runDiff = st.rs - st.ra;
    return {
      rank: 1,
      schoolId: s.id,
      schoolName: s.name,
      isPlayerSchool: s.id === school.id,
      games,
      wins: st.wins,
      draws: st.draws,
      losses: st.losses,
      winRate,
      runsScored: st.rs,
      runsAllowed: st.ra,
      runDiff,
    };
  });

  standingsList.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.runDiff - a.runDiff;
  });

  standingsList.forEach((s, idx) => { s.rank = idx + 1; });

  return {
    groupName: group.name,
    standings: standingsList,
  };
}
