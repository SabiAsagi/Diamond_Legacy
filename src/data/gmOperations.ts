import type { LeagueSeason, Player, Team } from '../types';
import type { BoxscoreRecord } from '../store/proSimulation';

// Game rules, deliberately separate from real-world league regulations.
export const GM_RULES = { activeLimit:29, organizationLimit:68, draftRounds:11, minimumSalary:3000, tradeDeadline:'07-31' };
export interface GMTransaction { date:string; text:string; teamId?:number }
export interface GMSeries { name:string; high:number; low:number; highWins:number; lowWins:number; target:number; winner?:number }
export interface GMOffice {
  initialized?:boolean;
  futuresTeams?: (Team & { division:'북부'|'남부'; parentId?:number })[];
  futuresResults?:BoxscoreRecord[];
  futuresSeries?:GMSeries[];
  futuresChampionId?:number;
  results:BoxscoreRecord[];
  transactions:GMTransaction[];
  draftOrder:number[];
  draftPicks:{ teamId:number; playerId:number; round:number }[];
  draftComplete:boolean;
  series:GMSeries[];
  championId?:number;
  archives:{ year:number; championId?:number; standings:{teamId:number; wins:number; losses:number; draws:number}[] }[];
  releasedLiabilities:{teamId:number; salary:number; years:number}[];
}
export type GMCommand =
  | {type:'roster'; playerId:number; tier:'1군'|'2군'|'3군'}
  | {type:'lineup'; lineup:number[]; rotation:number[]; closer?:number}
  | {type:'contract'; playerId:number; salary:number; years:number; development?:boolean}
  | {type:'registerDevelopment'; playerId:number}
  | {type:'release'; playerId:number}
  | {type:'trade'; give:number[]; receive:number[]; partnerId:number}
  | {type:'draft'; playerId?:number}
  | {type:'training'; playerId:number; focus:'balanced'|'hitting'|'pitching'|'fielding'}
  | {type:'nextSeason'}
  | {type:'autoRoster'};

export const emptyOffice = ():GMOffice => ({results:[],transactions:[],draftOrder:[],draftPicks:[],draftComplete:false,series:[],archives:[],releasedLiabilities:[]});
export function addGMLog(season:LeagueSeason,text:string,teamId?:number) {
  const office=season.office ??= emptyOffice();
  office.transactions.unshift({date:season.currentDate!,text,teamId});
  office.transactions=office.transactions.slice(0,500);
}
export function payroll(teamId:number,players:Player[],season?:LeagueSeason):number {
  return players.filter(p=>p.status==='Pro'&&p.teamId===teamId).reduce((sum,p)=>sum+(p.salary??5000)*10000,0)
    +(season?.office?.releasedLiabilities.filter(l=>l.teamId===teamId).reduce((sum,l)=>sum+l.salary*10000,0)??0);
}
export function availablePlayer(p:Player,date:string) { return p.status==='Pro'&&(!p.gm?.injuryUntil||p.gm.injuryUntil<=date); }
export function activePlayers(players:Player[],teamId:number,date:string):Player[] {
  return players.filter(p=>p.teamId===teamId&&(p.rosterTier??'1군')==='1군'&&p.gm?.registration!=='development'&&availablePlayer(p,date));
}
export function selectGameRoster(team:Team,players:Player[],date:string,dayIndex=0):Player[] {
  const active=activePlayers(players,team.id!,date);
  const batters=active.filter(p=>p.position!=='P');
  const ordered=(team.lineup??[]).map(id=>batters.find(p=>p.id===id)).filter((p):p is Player=>!!p);
  const lineup=[...ordered,...batters.filter(p=>!ordered.includes(p)).sort((a,b)=>b.overall-a.overall)].slice(0,9);
  const pitchers=active.filter(p=>p.position==='P');
  const rotation=(team.rotation??[]).map(id=>pitchers.find(p=>p.id===id)).filter((p):p is Player=>!!p);
  const starters=rotation.length?rotation:pitchers.filter(p=>p.pitcherRole==='Starter').sort((a,b)=>(a.gm?.fatigue??0)-(b.gm?.fatigue??0));
  const starter=starters.length?starters[dayIndex%starters.length]:pitchers[0];
  if(lineup.length<9||!starter) throw new Error(`${team.name}: 출전 가능한 타자 9명과 투수가 필요합니다. 선수단에서 1군 등록을 확인해주세요.`);
  return [...lineup,...batters.filter(p=>!lineup.includes(p)),starter,...pitchers.filter(p=>p!==starter).sort((a,b)=>(a.id===team.bullpen?.closer?-1:0)-(b.id===team.bullpen?.closer?-1:0)||(a.gm?.fatigue??0)-(b.gm?.fatigue??0)).slice(0,Math.max(0,27-batters.length))];
}
export function minimumSalary(year:number) { return year>=2027?3300:3000; }
export function salaryDemand(p:Player,year=2026) { return p.gm?.registration==='development'?minimumSalary(year):Math.max(minimumSalary(year),Math.round((p.overall-35)**2*25/100)*100); }
export function tradeValue(p:Player) { return Math.max(1,p.overall*1.5+Math.max(0,p.potential-p.overall)*0.7-Math.max(0,p.age-29)*3-(p.salary??5000)/2000); }
function assert(condition:unknown,message:string):asserts condition { if(!condition) throw new Error(message); }
function assertTeamPlayable(team:Team,players:Player[],date:string) { selectGameRoster(team,players,date); }
function validateBudget(team:Team,players:Player[],season:LeagueSeason) {
  assert(payroll(team.id!,players,season)<=team.budget,'연봉 예산을 초과합니다. 계약 금액이나 교환 선수를 조정해주세요.');
  assert(players.filter(p=>p.teamId===team.id&&p.status==='Pro'&&p.gm?.registration!=='development').length<=GM_RULES.organizationLimit,'정식 소속선수 한도 68명을 초과합니다. 육성선수 계약 또는 선수단 정리를 검토해주세요.');
}
function removeAssignments(team:Team,id:number) {
  team.lineup=team.lineup?.filter(x=>x!==id); team.rotation=team.rotation?.filter(x=>x!==id);
  if(team.bullpen?.closer===id) team.bullpen.closer=undefined;
}

/** Pure, atomic decision: callers persist the returned copy in one transaction. */
export function applyGMCommand(input:{teams:Team[];players:Player[];season:LeagueSeason},command:GMCommand) {
  const world=structuredClone(input),{teams,players,season}=world;
  const office=season.office??=emptyOffice();
  const team=teams.find(t=>t.id===season.userTeamId);
  assert(team&&season.setupCompleted,'먼저 GM 세계와 운영 구단을 선택해주세요.');
  const date=season.currentDate!;
  const ownPlayer=(id:number)=>{ const p=players.find(p=>p.id===id&&p.status==='Pro'&&p.teamId===team.id); assert(p,'우리 구단 소속 선수를 선택해주세요.'); return p; };
  switch(command.type) {
    case 'roster': {
      const p=ownPlayer(command.playerId);
      if(command.tier==='1군') {
        assert(p.gm?.registration!=='development','육성선수는 정식 소속선수로 전환한 뒤 1군에 등록할 수 있습니다.');
        assert(!p.gm?.recallAfter||p.gm.recallAfter<=date,`${p.gm?.recallAfter}부터 1군 재등록할 수 있습니다.`);
        assert(availablePlayer(p,date),'부상 중인 선수는 복귀한 뒤 등록할 수 있습니다.');
        assert((p.rosterTier??'1군')==='1군'||players.filter(q=>q.teamId===team.id&&(q.rosterTier??'1군')==='1군').length<GM_RULES.activeLimit,'1군 등록 한도는 29명입니다.');
      }
      if((p.rosterTier??'1군')==='1군'&&command.tier!=='1군'){p.gm??={fatigue:0,training:'balanced'};p.gm.recallAfter=nextCalendarDate(date,10);}
      p.rosterTier=command.tier;
      if(command.tier!=='1군') { removeAssignments(team,p.id!); }
      addGMLog(season,`${p.name} ${command.tier} 등록`,team.id); break;
    }
    case 'lineup': {
      assert(command.lineup.length===9&&new Set(command.lineup).size===9,'타순에는 서로 다른 타자 9명을 배치해주세요.');
      assert(command.rotation.length>=1&&command.rotation.length<=5&&new Set(command.rotation).size===command.rotation.length,'선발 로테이션은 서로 다른 투수 1~5명입니다.');
      for(const id of [...command.lineup,...command.rotation,...(command.closer?[command.closer]:[])]) {
        const p=ownPlayer(id); assert((p.rosterTier??'1군')==='1군'&&availablePlayer(p,date),'라인업에는 건강한 1군 선수를 배치해주세요.');
        assert(command.lineup.includes(id)?p.position!=='P':p.position==='P','타순과 투수진의 포지션을 확인해주세요.');
      }
      assert(!command.closer||!command.rotation.includes(command.closer),'선발과 마무리에 같은 투수를 배치할 수 없습니다.');
      team.lineup=command.lineup;team.rotation=command.rotation;team.bullpen={...team.bullpen,closer:command.closer};
      addGMLog(season,'타순·선발 로테이션·마무리 설정 저장',team.id);break;
    }
    case 'contract': {
      const p=players.find(p=>p.id===command.playerId&&p.status==='Pro');
      assert(p&&!p.gm?.futuresTeamId&&(p.teamId===undefined||p.teamId===team.id),'자유계약 선수 또는 우리 구단 선수를 선택해주세요.');
      assert(Number.isInteger(command.salary)&&command.salary>=minimumSalary(season.year)&&command.salary<=2000000,`연봉은 ${minimumSalary(season.year).toLocaleString()}~2,000,000만원 사이의 정수입니다.`);
      assert(Number.isInteger(command.years)&&command.years>=1&&command.years<=5,'계약 기간은 1~5년입니다.');
      assert(command.salary>=(command.development?minimumSalary(season.year):salaryDemand(p,season.year)),'선수가 제안 연봉을 거절했습니다. 희망 연봉 이상으로 제안해주세요.');
      const isFree=p.teamId===undefined;
      if(command.development){
        assert(isFree||p.gm?.registration==='development','기존 정식 선수를 육성선수로 임의 전환할 수 없습니다.');
        assert(p.gm?.releasedInYear!==season.year,'당해 시즌 방출 선수는 육성선수 계약 대상에서 제외합니다.');
        assert(command.years===1,'육성선수 계약은 1년 단위입니다.');
        if(isFree&&p.age<=19)assert(players.filter(q=>q.teamId===team.id&&q.age<=19&&q.gm?.developmentSignedYear===season.year).length<5,'이번 연도 고졸 육성선수 계약은 최대 5명입니다.');
        p.gm??={fatigue:0,training:'balanced'};p.gm.registration='development';if(isFree)p.gm.developmentSignedYear=season.year;
      }
      p.teamId=team.id;p.salary=command.salary;p.contractYears=command.years+(season.currentStage==='Offseason'?1:0);
      if(isFree)p.rosterTier='2군';
      validateBudget(team,players,season);
      addGMLog(season,`${p.name} ${isFree?'영입':'계약 갱신'} · ${command.years}년 / 연 ${command.salary.toLocaleString()}만원`,team.id);break;
    }
    case 'registerDevelopment': {
      const p=ownPlayer(command.playerId);assert(p.gm?.registration==='development','육성선수를 선택해주세요.');
      assert(date.slice(5)>='05-01','육성선수의 정식 소속선수 전환은 5월 1일부터 가능합니다.');
      p.gm.registration='registered';validateBudget(team,players,season);
      addGMLog(season,`${p.name} 육성선수 → 정식 소속선수 전환`,team.id);break;
    }
    case 'release': {
      const p=ownPlayer(command.playerId);
      office.releasedLiabilities.push({teamId:team.id!,salary:p.salary??5000,years:p.contractYears??1});
      p.teamId=undefined;p.rosterTier='2군';p.contractYears=0;removeAssignments(team,p.id!);
      p.gm??={fatigue:0,training:'balanced'};p.gm.releasedInYear=season.year;
      assertTeamPlayable(team,players,date);
      addGMLog(season,`${p.name} 방출 · 남은 보장 연봉은 구단 부담`,team.id);break;
    }
    case 'trade': {
      assert(season.currentStage==='Offseason'||(season.currentStage==='RegularSeason'&&date.slice(5)<=GM_RULES.tradeDeadline),'트레이드는 비시즌 또는 7월 31일까지 가능합니다.');
      const partner=teams.find(t=>t.id===command.partnerId&&t.id!==team.id); assert(partner,'상대 구단을 선택해주세요.');
      assert(command.give.length>0&&command.receive.length>0&&command.give.length<=3&&command.receive.length<=3,'각 구단에서 1~3명을 교환할 수 있습니다.');
      assert(new Set([...command.give,...command.receive]).size===command.give.length+command.receive.length,'같은 선수를 중복 선택할 수 없습니다.');
      const give=command.give.map(ownPlayer);
      const receive=command.receive.map(id=>{const p=players.find(p=>p.id===id&&p.teamId===partner.id&&p.status==='Pro');assert(p,'상대 구단 소속 선수만 교환할 수 있습니다.');return p;});
      assert(give.reduce((sum,p)=>sum+tradeValue(p),0)>=receive.reduce((sum,p)=>sum+tradeValue(p),0)*1.05,'상대 구단이 거절했습니다. 현재 능력·잠재력·나이·연봉을 고려해 제안을 보강해주세요.');
      for(const p of give){removeAssignments(team,p.id!);p.teamId=partner.id;p.rosterTier='2군';}
      for(const p of receive){removeAssignments(partner,p.id!);p.teamId=team.id;p.rosterTier='2군';}
      validateBudget(team,players,season);validateBudget(partner,players,season);
      assertTeamPlayable(team,players,date);assertTeamPlayable(partner,players,date);
      addGMLog(season,`${team.name} ↔ ${partner.name}: ${give.map(p=>p.name).join(', ')} / ${receive.map(p=>p.name).join(', ')}`,team.id);break;
    }
    case 'training': { const p=ownPlayer(command.playerId);p.gm??={fatigue:0,training:'balanced'};p.gm.training=command.focus;addGMLog(season,`${p.name} 육성 방향 변경`,team.id);break; }
    case 'draft': {
      assert(season.currentStage==='Draft'&&!office.draftComplete,'신인 드래프트 기간에만 지명할 수 있습니다.');
      const total=office.draftOrder.length*GM_RULES.draftRounds;
      let draftPlayerId=command.playerId;
      while(office.draftPicks.length<total){
        const index=office.draftPicks.length,teamId=office.draftOrder[index%office.draftOrder.length];
        const pool=players.filter(p=>p.status==='DraftProspect'&&p.draftClassYear===season.year).sort((a,b)=>tradeValue(b)-tradeValue(a));
        let p:Player|undefined;
        if(teamId===team.id){
          if(draftPlayerId===undefined)break;
          p=pool.find(p=>p.id===draftPlayerId);assert(p,'이번 연도에 아직 지명되지 않은 후보를 선택해주세요.');draftPlayerId=undefined;
        }else p=pool[0];
        assert(p,'드래프트 후보가 부족합니다.');
        p.status='Pro';p.teamId=teamId;p.salary=minimumSalary(season.year);p.contractYears=2;p.rosterTier='2군';p.proStats={};
        office.draftPicks.push({teamId,playerId:p.id!,round:Math.floor(index/office.draftOrder.length)+1});
        addGMLog(season,`${teams.find(t=>t.id===teamId)?.name} ${Math.floor(index/office.draftOrder.length)+1}라운드 ${p.name} 지명`,teamId);
      }
      if(office.draftPicks.length===total){office.draftComplete=true;season.currentStage='Offseason';for(const p of players.filter(p=>p.status==='DraftProspect'&&p.draftClassYear===season.year)){p.status='Pro';p.teamId=undefined;p.contractYears=0;p.salary=GM_RULES.minimumSalary;p.rosterTier='2군';}addGMLog(season,'드래프트 종료 · 미지명 후보는 자유계약·육성선수 계약 가능');}
      break;
    }
    case 'autoRoster': {
      autoRoster(team,players,date);addGMLog(season,'감독 추천으로 1군·타순·투수진 정리',team.id);break;
    }
    case 'nextSeason': {
      assert(season.currentStage==='Offseason'&&office.draftComplete,'시즌과 신인 드래프트를 마친 뒤 다음 시즌을 시작할 수 있습니다.');
      office.archives.push({year:season.year,championId:office.championId,standings:teams.map(t=>({teamId:t.id!,wins:t.wins??0,draws:t.draws??0,losses:t.losses??0}))});
      for(const p of players.filter(p=>p.status==='Pro')){
        p.gm??={fatigue:0,training:'balanced'};
        (p.gm.seasonHistory??=[]).push({year:season.year,teamId:p.teamId,stats:structuredClone(p.proStats??{})});
        p.proStats={};p.age++;p.gm.fatigue=0;p.gm.injuryUntil=undefined;
        p.salary=Math.max(p.salary??3000,minimumSalary(season.year+1));
        if(p.age>=40&&p.overall<65){p.status='Retired';p.teamId=undefined;continue;}
        if(p.teamId!==undefined){p.contractYears=Math.max(0,(p.contractYears??1)-1);if(!p.contractYears){addGMLog(season,`${p.name} 계약 만료 · 자유계약 시장 등록`,p.teamId);p.teamId=undefined;p.rosterTier='2군';}}
      }
      office.releasedLiabilities=office.releasedLiabilities.map(l=>({...l,years:l.years-1})).filter(l=>l.years>0);
      season.year++;season.currentDate=`${season.year}-03-28`;season.currentStage='RegularSeason';season.dayIndex=0;
      office.results=[];office.series=[];office.championId=undefined;office.draftPicks=[];office.draftOrder=[];office.draftComplete=false;
      office.futuresResults=[];office.futuresSeries=[];office.futuresChampionId=undefined;
      for(const t of office.futuresTeams??[]){t.wins=0;t.losses=0;t.draws=0;t.runsScored=0;t.runsAllowed=0;}
      for(const p of players){if(p.gm){p.gm.futuresStats={};p.gm.postseasonStats={};}}
      for(const t of teams){t.wins=0;t.losses=0;t.draws=0;t.runsScored=0;t.runsAllowed=0;t.lineup=[];t.rotation=[];t.bullpen={};}
      addGMLog(season,`${season.year} 시즌 개막 · 계약 만료 선수와 1군 등록을 점검해주세요.`);break;
    }
  }
  for(const t of teams)t.payroll=payroll(t.id!,players,season);
  return world;
}

export function autoRoster(team:Team,players:Player[],date:string) {
  const pool=players.filter(p=>p.teamId===team.id&&p.gm?.registration!=='development'&&availablePlayer(p,date)&&(!p.gm?.recallAfter||p.gm.recallAfter<=date)&&p.rosterTier!=='3군').sort((a,b)=>b.overall-a.overall);
  const hitters=pool.filter(p=>p.position!=='P'),pitchers=pool.filter(p=>p.position==='P');
  const chosen=[...hitters.slice(0,15),...pitchers.slice(0,14)];
  for(const p of players.filter(p=>p.teamId===team.id&&p.status==='Pro'&&p.rosterTier!=='3군')){
    const tier=chosen.includes(p)?'1군':'2군';
    if((p.rosterTier??'1군')==='1군'&&tier==='2군'){p.gm??={fatigue:0,training:'balanced'};p.gm.recallAfter=nextCalendarDate(date,10);}
    p.rosterTier=tier;
  }
  team.lineup=hitters.slice(0,9).map(p=>p.id!);team.rotation=pitchers.filter(p=>p.pitcherRole==='Starter').slice(0,5).map(p=>p.id!);
  if(!team.rotation.length&&pitchers[0])team.rotation=[pitchers[0].id!];
  team.bullpen={closer:pitchers.find(p=>!team.rotation!.includes(p.id!))?.id};
}

export function nextCalendarDate(date:string,days=1) { const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); }
export function developPlayers(players:Player[],season:LeagueSeason,rng= Math.random) {
  for(const p of players.filter(p=>p.status==='Pro')){
    p.gm??={fatigue:0,training:'balanced'};p.gm.fatigue=Math.max(0,p.gm.fatigue-12);
    if(p.gm.injuryUntil&&p.gm.injuryUntil<=season.currentDate!){p.gm.injuryUntil=undefined;addGMLog(season,`${p.name} 부상에서 복귀`,p.teamId);}
    if(p.rosterTier==='3군')p.gm.fatigue=Math.max(0,p.gm.fatigue-10);
    if((p.teamId===undefined&&!p.gm.futuresTeamId)||p.gm.injuryUntil)continue;
    if(p.gm.fatigue>65&&rng()<0.008){p.gm.injuryUntil=nextCalendarDate(season.currentDate!,7+Math.floor(rng()*15));addGMLog(season,`${p.name} 부상 · ${p.gm.injuryUntil} 복귀 예정`,p.teamId);}
    if(season.currentDate!.endsWith('-01')){
      const delta=p.age<28&&p.overall<p.potential?1:p.age>32?-1:0;
      const keys:('contact'|'power'|'eye'|'stuff'|'control'|'stamina'|'defense')[]=p.gm.training==='fielding'?['defense']:p.gm.training==='hitting'?['contact','power','eye']:p.position==='P'?['stuff','control','stamina']:['contact','power','eye','defense'];
      if(delta) {for(const key of keys)p[key]=Math.max(1,Math.min(99,p[key]+delta));p.overall=Math.max(1,Math.min(p.potential,p.overall+delta));}
    }
  }
}
