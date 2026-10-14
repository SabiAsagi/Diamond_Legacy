import type {LeagueSeason,Player,Team} from '../types';
import {getProFixtures} from './proSchedule';
import {addGMLog,autoRoster,developPlayers,nextCalendarDate,selectGameRoster} from './gmOperations';
import {quickSimulateMatch,completeGMMatch} from '../store/gmMatch';
import type {InGameMatchState} from '../types/proManagement';

export function rankedTeams(teams:Team[]) {
  return [...teams].sort((a,b)=>((b.wins??0)/((b.wins??0)+(b.losses??0)||1))-((a.wins??0)/((a.wins??0)+(a.losses??0)||1))||((b.runsScored??0)-(b.runsAllowed??0))-((a.runsScored??0)-(a.runsAllowed??0)));
}
export function gmFixtures(season:LeagueSeason) {
  const done=new Set(season.office?.results.map(b=>b.matchId));
  if(season.currentStage==='RegularSeason')return getProFixtures(season.year).filter(f=>f.date===season.currentDate&&!f.cancelled&&!done.has(`${f.date}_${f.away}_${f.home}`));
  if(season.currentStage==='Playoffs'){
    const series=season.office!.series.at(-1)!;if(series.winner!==undefined)return [];
    const n=series.highWins+series.lowWins-(series.name==='와일드카드'?1:0);
    const home=series.name==='와일드카드'||n<2||n>=(series.name==='한국시리즈'?5:4)?series.high:series.low;
    const teams=season.office!.draftOrder; // stable ranking IDs; codes are resolved by the caller
    return [{date:season.currentDate!,home:String(home),away:String(home===series.high?series.low:series.high),venue:'',time:'18:30',cancelled:false,postseason:true,ranking:teams}];
  }
  return [];
}
function roundRobin(ids:number[]):[number,number][][] {
  const order=[...ids],rounds:[number,number][][]=[];
  for(let r=0;r<ids.length-1;r++){
    rounds.push(Array.from({length:ids.length/2},(_,i)=>[order[i],order[ids.length-1-i]] as [number,number]));order.splice(1,0,order.pop()!);
  }return rounds;
}
export function futuresSchedule(year:number,clubs:NonNullable<NonNullable<LeagueSeason['office']>['futuresTeams']>) {
  const north=clubs.filter(t=>t.division==='북부').map(t=>t.id!),south=clubs.filter(t=>t.division==='남부').map(t=>t.id!);
  const nr=roundRobin(north),sr=roundRobin(south),rounds:[number,number][][]=[];
  for(let cycle=0;cycle<17;cycle++)for(let r=0;r<5;r++)rounds.push([...nr[r],...sr[r]].map(pair=>cycle%2?[pair[1],pair[0]]:pair));
  for(let cycle=0;cycle<6;cycle++)for(let r=0;r<6;r++)rounds.push(north.map((id,i)=>cycle%2?[south[(i+r)%6],id]:[id,south[(i+r)%6]]));
  let date=`${year}-03-28`;
  return rounds.flatMap((pairs)=>{while(new Date(`${date}T12:00:00Z`).getUTCDay()===2)date=nextCalendarDate(date);const today=date;date=nextCalendarDate(date);return pairs.map(([home,away])=>({date:today,home,away}));});
}
function runFutures(teams:Team[],players:Player[],season:LeagueSeason) {
  const office=season.office!,clubs=office.futuresTeams!;
  for(const t of clubs){if(t.parentId)t.name=`${teams.find(p=>p.id===t.parentId)?.name} 2군`;}
  const schedule=futuresSchedule(season.year,clubs);
  const today=schedule.filter(f=>f.date===season.currentDate);
  if(season.currentDate!>schedule.at(-1)!.date&&!office.futuresChampionId){
    if(!office.futuresSeries?.length){
      const north=rankedTeams(clubs.filter(t=>t.division==='북부')),south=rankedTeams(clubs.filter(t=>t.division==='남부'));
      office.futuresSeries=[{name:'북부 준결승',high:north[0].id!,low:south[1].id!,highWins:0,lowWins:0,target:1},{name:'남부 준결승',high:south[0].id!,low:north[1].id!,highWins:0,lowWins:0,target:1}];
    }
    const pending=office.futuresSeries.filter(s=>s.winner===undefined);
    if(!pending.length&&office.futuresSeries.length===2)office.futuresSeries.push({name:'퓨처스 챔피언 결정전',high:office.futuresSeries[0].winner!,low:office.futuresSeries[1].winner!,highWins:0,lowWins:0,target:1});
    for(const s of office.futuresSeries.filter(s=>s.winner===undefined))today.push({date:season.currentDate!,home:s.high,away:s.low});
  }
  for(const f of today){
    const id=`F_${f.date}_${f.away}_${f.home}`;if(office.futuresResults?.some(b=>b.matchId===id))continue;
    const home=clubs.find(t=>t.id===f.home)!,away=clubs.find(t=>t.id===f.away)!;
    const roster=(t:typeof home)=>players.filter(p=>p.status==='Pro'&&(t.parentId?p.teamId===t.parentId&&p.rosterTier==='2군':p.gm?.futuresTeamId===t.id)&&(!p.gm?.injuryUntil||p.gm.injuryUntil<=season.currentDate!));
    const h=roster(home),a=roster(away);
    // Real reserve players and their own statistical line; never leak into first-team totals.
    const copies=[...h,...a].map(p=>({...structuredClone(p),proStats:structuredClone(p.gm?.futuresStats??{})}));
    const arrange=(list:Player[])=>{const bats=list.filter(p=>p.position!=='P').sort((a,b)=>b.overall-a.overall),pitch=list.filter(p=>p.position==='P');if(bats.length<9||!pitch.length)return undefined;return [...bats,...pitch];};
    const hp=arrange(copies.filter(p=>h.some(o=>o.id===p.id))),ap=arrange(copies.filter(p=>a.some(o=>o.id===p.id)));
    if(!hp||!ap){addGMLog(season,`${home.name} vs ${away.name}: 2군 선수 부족으로 경기 보류`);continue;}
    const final=office.futuresSeries?.find(s=>s.high===home.id&&s.low===away.id&&s.winner===undefined);
    const box=quickSimulateMatch(id,f.date,home,away,hp,ap,!final);
    if(final&&box.homeScore!==box.awayScore){final.winner=box.homeScore>box.awayScore?home.id:away.id;if(final.name==='퓨처스 챔피언 결정전'){office.futuresChampionId=final.winner;addGMLog(season,`${clubs.find(t=>t.id===final.winner)?.name} 퓨처스 챔피언 결정전 우승`);}}
    (office.futuresResults??=[]).push(box);
    for(const copy of copies){const p=players.find(p=>p.id===copy.id)!;p.gm??={fatigue:0,training:'balanced'};p.gm.futuresStats=copy.proStats;p.gm.fatigue=copy.gm?.fatigue??p.gm.fatigue;}
  }
}
function advanceStage(teams:Team[],season:LeagueSeason) {
  const office=season.office!;
  if(season.currentStage==='RegularSeason'&&!getProFixtures(season.year).some(f=>!f.cancelled&&f.date>season.currentDate!)){
    const ranked=rankedTeams(teams);office.draftOrder=ranked.map(t=>t.id!);
    office.series=[{name:'와일드카드',high:ranked[3].id!,low:ranked[4].id!,highWins:1,lowWins:0,target:2}];season.currentStage='Playoffs';addGMLog(season,'정규시즌 종료 · 와일드카드 시작');
  }else if(season.currentStage==='Playoffs'){
    const current=office.series.at(-1)!;
    if(current.winner!==undefined){
      const index=office.series.length;
      if(index===4){office.championId=current.winner;season.currentStage='Draft';office.draftOrder.reverse();addGMLog(season,`${teams.find(t=>t.id===current.winner)?.name} 한국시리즈 우승 · 신인 드래프트 시작`);}
      else{office.series.push({name:['','준플레이오프','플레이오프','한국시리즈'][index],high:office.draftOrder[3-index],low:current.winner,highWins:0,lowWins:0,target:index===3?4:3});addGMLog(season,`${office.series.at(-1)!.name} 시작`);}
    }
  }
}
/** Owns one day's authoritative results, whether a game was watched or simulated. */
export function advanceGMDay(teams:Team[],players:Player[],season:LeagueSeason,live?:InGameMatchState,regularPlayers?:Player[]) {
  const office=season.office!;
  if(season.currentStage==='Draft'||season.currentStage==='Offseason')throw new Error('운영실에서 드래프트 또는 다음 시즌 준비를 완료해주세요.');
  for(const t of teams){if(t.id!==season.userTeamId)autoRoster(t,players,season.currentDate!);}
  const fixtures=gmFixtures(season);
  const postseason=season.currentStage==='Playoffs';
  const regular=new Map((live&&regularPlayers?regularPlayers:players).map(p=>[p.id,structuredClone(p.proStats??{})]));
  if(postseason&&!live)for(const p of players)p.proStats=structuredClone(p.gm?.postseasonStats??{});
  // Validate all participants before mutating any match statistics.
  const jobs=fixtures.map(f=>{
    const home=teams.find(t=>season.currentStage==='Playoffs'?t.id===Number(f.home):t.code===f.home)!;
    const away=teams.find(t=>season.currentStage==='Playoffs'?t.id===Number(f.away):t.code===f.away)!;
    return {f,home,away,hp:selectGameRoster(home,players,season.currentDate!,season.dayIndex),ap:selectGameRoster(away,players,season.currentDate!,season.dayIndex)};
  });
  for(const {f,home,away,hp,ap} of jobs){
    const id=`${f.date}_${f.away}_${f.home}`;
    const box=live?.matchId===id?completeGMMatch(live,home,away,players,season.currentStage==='RegularSeason'):quickSimulateMatch(id,f.date,home,away,hp,ap,season.currentStage==='RegularSeason');
    office.results.push(box);
    if(season.currentStage==='Playoffs'){
      const series=office.series.at(-1)!;
      if(box.homeScore===box.awayScore){if(series.name==='와일드카드')series.winner=series.high;}
      else {const winner=box.homeScore>box.awayScore?home.id:away.id;if(winner===series.high)series.highWins++;else series.lowWins++;if(series.highWins>=series.target)series.winner=series.high;if(series.lowWins>=series.target)series.winner=series.low;}
    }
  }
  if(season.currentStage==='RegularSeason')runFutures(teams,players,season);
  if(postseason)for(const p of players){p.gm??={fatigue:0,training:'balanced'};p.gm.postseasonStats=p.proStats;p.proStats=regular.get(p.id)??{};}
  advanceStage(teams,season);
  season.currentDate=nextCalendarDate(season.currentDate!);season.dayIndex=(season.dayIndex??0)+1;
  developPlayers(players,season);
}
