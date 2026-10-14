import type {Player,Team,LeagueSeason,Position} from '../types';
import { buildDefaultProPlayers } from './proClubs';
import { emptyOffice,autoRoster,payroll } from './gmOperations';

const surnames=['김','이','박','최','정','강','조','윤','장','임'];
const names=['민준','도윤','서진','현우','지호','준서','태윤','성민','우진','시우','건우','재현','동현','준혁','승현'];
export function generatedPlayer(template:Player,id:number,year:number,index:number,status:'Pro'|'DraftProspect',teamId?:number):Player {
  const position:Position[]=['P','P','P','P','P','C','1B','2B','3B','SS','LF','CF','RF'];
  const pos=position[index%position.length],overall=40+(index*17+year)%30;
  return {...structuredClone(template),id,name:`${surnames[index%surnames.length]}${names[Math.floor(index/surnames.length)%names.length]}`,teamId,status,position:pos,age:status==='DraftProspect'?18:20+index%14,overall,potential:Math.min(95,overall+10+index%20),contact:pos==='P'?20:overall,power:pos==='P'?15:overall-5,eye:overall,speed:overall,defense:overall,stuff:pos==='P'?overall:0,control:pos==='P'?overall:0,stamina:pos==='P'?overall:0,pitcherRole:pos==='P'?(index%5<3?'Starter':'Reliever'):'None',salary:3000+overall*100,contractYears:2+index%3,rosterTier:'2군',proStats:{},gm:{fatigue:0,training:'balanced',futuresStats:{}},draftClassYear:status==='DraftProspect'?year:undefined};
}
export function initializeOrganization(teams:Team[],players:Player[],season:LeagueSeason,firstId:number) {
  const office=season.office??=emptyOffice();if(office.initialized)return;
  let id=firstId,index=0;
  const template=buildDefaultProPlayers([teams[0]])[0];
  for(const team of teams){
    const own=players.filter(p=>p.teamId===team.id&&p.status==='Pro');
    // The old field represented remaining cash, while the operations screen uses a payroll cap.
    team.budget+=payroll(team.id!,players,season);
    for(let n=own.length;n<52;n++){players.push(generatedPlayer(template,id++,season.year,index++,'Pro',team.id));}
    for(let n=0;n<5;n++){const p=generatedPlayer(template,id++,season.year,index++,'Pro',team.id);p.age=20;p.salary=3000;p.contractYears=1;p.gm!.registration='development';p.gm!.developmentSignedYear=season.year;players.push(p);}
    autoRoster(team,players,season.currentDate!);team.payroll=payroll(team.id!,players,season);
  }
  const north=['EAGLES','TWINS','LANDERS','BEARS','HEROES'];
  office.futuresTeams=teams.map(t=>({...structuredClone(t),id:10000+t.id!,parentId:t.id,name:`${t.name} 2군`,code:`F_${t.code}`,division:(north.includes(t.code!)?'북부':'남부') as '북부'|'남부',wins:0,losses:0,draws:0,runsScored:0,runsAllowed:0,lineup:[],rotation:[]}));
  for(const [specialId,name,division] of [[20001,'상무','북부'],[20002,'울산 웨일즈','남부']] as const){
    office.futuresTeams.push({id:specialId,name,shortName:name,city:specialId===20001?'문경':'울산',code:`F_${specialId}`,budget:0,fanBase:50,division,wins:0,losses:0,draws:0});
    for(let n=0;n<28;n++){const p=generatedPlayer(template,id++,season.year,index++,'Pro');p.gm!.futuresTeamId=specialId;players.push(p);}
  }
  for(let n=0;n<20;n++)players.push(generatedPlayer(template,id++,season.year,index++,'Pro'));
  const candidates=players.filter(p=>p.status==='DraftProspect'&&p.draftClassYear===season.year).length;
  for(let n=candidates;n<130;n++)players.push(generatedPlayer(template,id++,season.year,index++,'DraftProspect'));
  office.initialized=true;office.futuresResults=[];
}
export function ensureDraftClass(teams:Team[],players:Player[],year:number,firstId:number) {
  const count=players.filter(p=>p.status==='DraftProspect'&&p.draftClassYear===year).length;
  const template=buildDefaultProPlayers([teams[0]])[0];
  for(let n=count;n<130;n++)players.push(generatedPlayer(template,firstId++,year,n,'DraftProspect'));
}
