import type { Player, Team, LeagueSeason } from '../types';
import { buildDefaultProTeams } from './proClubs';
import { getProFixtures } from './proSchedule';

const legacyCodes: Record<string,string> = { 'Seoul Tigers':'TIGERS', 'Busan Gulls':'GIANTS', 'Incheon Wyverns':'LANDERS' };
const originalNames: Record<string,string> = { TWINS:'서울 트윈스', BEARS:'서울 베어스', HEROES:'서울 히어로즈', LANDERS:'인천 랜더스', WIZ:'수원 위즈', EAGLES:'대전 이글스', TIGERS:'광주 타이거즈', LIONS:'대구 라이온즈', GIANTS:'부산 자이언츠', DINOS:'창원 다이노스' };
const previousNames: Record<string,string> = { TWINS:'서울 트윈즈', BEARS:'서울 베어즈', HEROES:'서울 히어로스', LANDERS:'인천 랜더즈', WIZ:'수원 위저즈', EAGLES:'대전 이글즈', TIGERS:'광주 타이거스', LIONS:'대구 라이온스', GIANTS:'부산 자이언스', DINOS:'창원 다이노즈' };

/** Existing IDs, finances, standings and customized names survive initialization. */
export function reconcileProTeams(existing: Team[]): Team[] {
  const defaults = buildDefaultProTeams();
  const kept = existing.map(team => {
    const code = team.code ?? legacyCodes[team.name];
    const base = defaults.find(t => t.code === code);
    if (!base) return { ...team };
    const rename = !team.customName && (team.name === originalNames[code!] || team.name === previousNames[code!] || !!legacyCodes[team.name]);
    return { ...base, ...team, code, name: rename ? base.name : team.name, shortName: rename ? base.shortName : team.shortName ?? base.shortName };
  });
  return [...kept, ...defaults.filter(t => !kept.some(k => k.code === t.code)).map(t => ({ ...t, id: undefined }))];
}

export function validateGMName(value:string, label:string, max=40): string {
  const name=value.trim().normalize('NFC');
  if (!name || Array.from(name).length>max || Array.from(name).some(ch=>ch.charCodeAt(0)<32 || ch.charCodeAt(0)===127)) throw new Error(`${label}은 빈칸 없이 ${max}자 이내로 입력해주세요.`);
  return name;
}

export function isGraduatedCareer(p: Player): boolean {
  return p.status === 'HighSchool' && !!p.id && (!!p.careerEndedAt || !!p.gradeReports?.some(r => r.grade === 3));
}
export function careerWorldYear(p: Player): number {
  return p.gameDate?.year ?? 2026;
}
export function prepareGMWorld(season: LeagueSeason, year: number, teamId: number, career?: Player) {
  if (season.setupCompleted) throw new Error('이미 시작한 GM 세계는 시작 설정을 변경할 수 없습니다.');
  if (!Number.isInteger(year) || year < 2026 || year > 2060) throw new Error('시작 연도는 2026~2060년으로 선택해주세요.');
  if (career && !isGraduatedCareer(career)) throw new Error('졸업을 마친 육성 선수만 연결할 수 있습니다.');
  if (career && year !== careerWorldYear(career)) throw new Error('선수를 연결할 때는 육성 세계의 연도를 사용해야 합니다.');
  const date = getProFixtures(year).filter(f => !f.cancelled).map(f => f.date).sort()[0];
  if (!date) throw new Error('선택한 연도의 리그 일정을 찾지 못했습니다.');
  const updated: LeagueSeason = { ...season, year, currentDate:date, currentStage:'RegularSeason', userTeamId:teamId, dayIndex:0, setupCompleted:true, sourceCareerId:career?.id };
  const prospect: Player | undefined = career ? { ...structuredClone(career), id:undefined, status:'DraftProspect', teamId:undefined, rosterTier:undefined, proStats:undefined, salary:undefined, contractYears:undefined, draftSourceCareerId:career.id, draftClassYear:year } : undefined;
  return { season:updated, prospect };
}
