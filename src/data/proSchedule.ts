import schedule from './kbo2026.json';
import type { GameDate, TimeSlot } from '../types/calendar';

/** Fictional team codes used throughout the game (라이선스 회피용 가상 코드) */
export const PRO_TEAMS = [
  'TWINS',
  'BEARS',
  'HEROES',
  'LANDERS',
  'WIZ',
  'EAGLES',
  'TIGERS',
  'LIONS',
  'GIANTS',
  'DINOS',
] as const;
export type ProTeam = (typeof PRO_TEAMS)[number];

export interface ProFixture {
  date: string;
  away: string;
  home: string;
  venue: string;
  time: string;
  cancelled: boolean;
}

/** Map real KBO codes (from kbo2026.json) → fictional codes */
const KBO_TO_FICTION: Record<string, ProTeam> = {
  LG: 'TWINS',
  DOOSAN: 'BEARS',
  KIWOOM: 'HEROES',
  SSG: 'LANDERS',
  KT: 'WIZ',
  HANWHA: 'EAGLES',
  KIA: 'TIGERS',
  SAMSUNG: 'LIONS',
  LOTTE: 'GIANTS',
  NC: 'DINOS',
};

const homeVenue: Record<ProTeam, string> = {
  TWINS: 'JAMSIL',
  BEARS: 'JAMSIL',
  HEROES: 'GOCHEOKSKY',
  LANDERS: 'MUNHAK',
  WIZ: 'SUWON',
  EAGLES: 'DAEJEON',
  TIGERS: 'GWANGJU',
  LIONS: 'DAEGU',
  GIANTS: 'SAJIK',
  DINOS: 'CHANGWON',
};

const locations: Record<string, string> = {
  jamsil: 'JAMSIL',
  gocheok: 'GOCHEOKSKY',
  munhak: 'MUNHAK',
  suwon: 'SUWON',
  daejeonpark: 'DAEJEON',
  champions: 'GWANGJU',
  daegupark: 'DAEGU',
  sajik: 'SAJIK',
  changwon: 'CHANGWON',
};

const names: Record<string, string> = {
  TWINS: '서울 듀오스',
  BEARS: '서울 그리즐리스',
  HEROES: '서울 가디언즈',
  LANDERS: '인천 보이저스',
  WIZ: '수원 메이지스',
  EAGLES: '대전 호크스',
  TIGERS: '광주 재규어스',
  LIONS: '대구 레오스',
  GIANTS: '부산 샤크즈',
  DINOS: '창원 랩터스',
};

const cache = new Map<number, ProFixture[]>();
const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** kbo2026.json의 실제 코드를 가상 코드로 변환 */
function translateFixture(f: { date: string; away: string; home: string; venue: string; time: string; cancelled: boolean }): ProFixture {
  return {
    date: f.date,
    away: KBO_TO_FICTION[f.away] ?? f.away,
    home: KBO_TO_FICTION[f.home] ?? f.home,
    venue: f.venue,
    time: f.time,
    cancelled: f.cancelled,
  };
}

/** Future game years have no published real schedule: explicitly labelled simulation.
 * 16 meetings per opponent, 144 games and 72 home games per club; Mondays off.
 * Invert each round in alternating cycles, including the two clubs sharing Jamsil.
 */
export function simulatedProSeason(year: number): ProFixture[] {
  const cached = cache.get(year);
  if (cached) return cached;
  const order: ProTeam[] = [...PRO_TEAMS];
  const rounds: [ProTeam, ProTeam][][] = [];
  for (let round = 0; round < 9; round++) {
    const pairs: [ProTeam, ProTeam][] = [];
    for (let i = 0; i < 5; i++) pairs.push([order[i], order[9 - i]]);
    const tw = pairs.find((pair) => pair.includes('TWINS'))!;
    const be = pairs.find((pair) => pair.includes('BEARS'))!;
    if (tw !== be && tw.indexOf('TWINS') === be.indexOf('BEARS')) be.reverse();
    rounds.push(pairs);
    order.splice(1, 0, order.pop()!);
  }
  const day = new Date(Date.UTC(year, 2, 25));
  while (day.getUTCDay() !== 6) day.setUTCDate(day.getUTCDate() + 1);
  const games: ProFixture[] = [];
  for (let cycle = 0; cycle < 16; cycle++)
    for (const pairs of rounds) {
      while (
        day.getUTCDay() === 1 ||
        (day.getUTCMonth() === 6 && day.getUTCDate() >= 10 && day.getUTCDate() <= 13)
      )
        day.setUTCDate(day.getUTCDate() + 1);
      for (const pair of pairs) {
        const [home, away] = cycle % 2 ? [pair[1], pair[0]] : pair;
        games.push({
          date: dateKey(year, day.getUTCMonth() + 1, day.getUTCDate()),
          home,
          away,
          venue: homeVenue[home],
          time: day.getUTCDay() === 0 ? '14:00' : day.getUTCDay() === 6 ? '17:00' : '18:30',
          cancelled: false,
        });
      }
      day.setUTCDate(day.getUTCDate() + 1);
    }
  cache.set(year, games);
  return games;
}

export function getProFixtures(year: number): ProFixture[] {
  if (year === schedule.year) {
    return schedule.games.map(translateFixture);
  }
  return simulatedProSeason(year);
}

export function getBallparkVisit(locationId: string, date: GameDate, slot: TimeSlot) {
  const venue = locations[locationId];
  if (!venue) return null;
  const key = dateKey(date.year, date.month, date.day);
  const games = getProFixtures(date.year);
  const today = games.filter((g) => g.venue === venue && g.date === key);
  const fixture = today.find((g) => !g.cancelled);
  const next = games.find((g) => g.venue === venue && g.date > key && !g.cancelled);
  const simulated = date.year !== schedule.year;
  const source = simulated
    ? '가상 시즌 · 팀당 144경기 / 홈 72경기'
    : `공식 일정 · ${schedule.asOf} 확인`;
  const nextText = next
    ? `다음 홈경기 ${next.date.slice(5).replace('-', '/')} · ${names[next.away]} vs ${names[next.home]}`
    : '이번 시즌 남은 홈경기가 없습니다.';
  const matchSlot = fixture && Number(fixture.time.split(':')[0]) >= 18 ? 'night' : 'afternoon';
  const available = !!fixture && slot === matchSlot;
  const reason = fixture
    ? `${fixture.time} ${names[fixture.away]} vs ${names[fixture.home]}${available ? ' · 관람 가능' : ` · ${matchSlot === 'night' ? '야간' : '오후'}에 관람 가능`}`
    : today.length
      ? '우천 등으로 오늘 경기가 취소되었습니다.'
      : '오늘은 이 구장에 홈경기가 없습니다.';
  return { available, reason, nextText, source, simulated, fixture };
}
