import type { Player,Team } from '../types';
import type { InGameMatchState,TacticalDefenseCommand,TacticalOffenseCommand,ProBattingStats,ProPitchingStats } from '../types/proManagement';
import type { BoxscoreRecord } from './proSimulation';

const batStats=():ProBattingStats=>({games:0,pa:0,ab:0,hits:0,doubles:0,triples:0,hr:0,rbi:0,runs:0,bb:0,so:0,sb:0,avg:0,obp:0,slg:0,ops:0});
const pitchStats=():ProPitchingStats=>({games:0,starts:0,wins:0,losses:0,saves:0,holds:0,innings:0,hitsAllowed:0,hrAllowed:0,bbAllowed:0,so:0,runsAllowed:0,earnedRuns:0,era:0,whip:0});
function batting(p:Player) { p.proStats??={};return p.proStats.batting??=batStats(); }
function pitching(p:Player) { p.proStats??={};return p.proStats.pitching??=pitchStats(); }
function refresh(players:Player[]) {
  for(const p of players){
    const b=p.proStats?.batting;if(b){b.avg=b.ab?b.hits/b.ab:0;b.obp=b.pa?(b.hits+b.bb)/b.pa:0;b.slg=b.ab?(b.hits+b.doubles+2*b.triples+3*b.hr)/b.ab:0;b.ops=b.obp+b.slg;}
    const s=p.proStats?.pitching;if(s){s.era=s.innings?s.earnedRuns*9/s.innings:0;s.whip=s.innings?(s.hitsAllowed+s.bbAllowed)/s.innings:0;}
  }
}
function log(s:InGameMatchState,text:string) { s.playLogs=[...s.playLogs,{id:`${s.matchId}-${s.gmParticipants?.length}-${s.inning}-${s.playLogs.length}-${s.currentBatterIndex.home}-${s.currentBatterIndex.away}`,inningText:`${s.inning}회${s.isTop?'초':'말'}`,text}].slice(-100); }
function participate(s:InGameMatchState,p:Player,isPitcher=false) {
  s.gmParticipants??=[];if(s.gmParticipants.includes(p.id!))return;s.gmParticipants.push(p.id!);
  if(isPitcher)pitching(p).games++;else batting(p).games++;
}
export function initInGameMatch(matchId:string,dateStr:string,home:Team,away:Team,hp:Player[],ap:Player[]):InGameMatchState {
  const hb=hp.filter(p=>p.position!=='P').slice(0,9),ab=ap.filter(p=>p.position!=='P').slice(0,9);
  const h=hp.find(p=>p.position==='P')!,a=ap.find(p=>p.position==='P')!;
  if(hb.length<9||ab.length<9||!h||!a)throw new Error('경기 출전 선수단이 부족합니다.');
  const s:InGameMatchState={matchId,dateStr,homeTeamName:home.name,awayTeamName:away.name,homeTeamCode:home.code!,awayTeamCode:away.code!,inning:1,isTop:true,outs:0,balls:0,strikes:0,bases:[false,false,false],runners:[null,null,null],homeScore:0,awayScore:0,homeHits:0,awayHits:0,homeErrors:0,awayErrors:0,inningScoresHome:[0],inningScoresAway:[0],currentBatter:ab[0],currentPitcher:h,currentBatterIndex:{home:0,away:0},playLogs:[],isGameOver:false,gmLineups:{home:hb.map(p=>p.id!),away:ab.map(p=>p.id!)},gmPitchers:{home:h.id!,away:a.id!},gmParticipants:[],gmUsed:[h.id!,a.id!]};
  participate(s,h,true);participate(s,a,true);pitching(h).starts++;pitching(a).starts++;
  log(s,`${away.name} vs ${home.name} · 선발 ${a.name} / ${h.name}`);return s;
}
export function simulateAtBat(input:InGameMatchState,hp:Player[],ap:Player[],offense?:TacticalOffenseCommand,defense?:TacticalDefenseCommand):InGameMatchState {
  if(input.isGameOver)return input;
  const s={...input,bases:[...input.bases],runners:[...input.runners],inningScoresHome:[...input.inningScoresHome],inningScoresAway:[...input.inningScoresAway],currentBatterIndex:{...input.currentBatterIndex},gmParticipants:[...input.gmParticipants!],gmUsed:[...input.gmUsed!],gmLineups:{home:[...input.gmLineups!.home],away:[...input.gmLineups!.away]},gmPitchers:{...input.gmPitchers!}} as InGameMatchState;
  const all=[...hp,...ap],attack=s.isTop?ap:hp,defend=s.isTop?hp:ap,side=s.isTop?'away':'home',opposite=s.isTop?'home':'away';
  const find=(id:number)=>all.find(p=>p.id===id)!;
  let batter=find(s.gmLineups![side][s.currentBatterIndex[side]%9]),pitcher=find(s.gmPitchers![opposite]);
  if(defense==='pitching_change'){
    const replacement=defend.filter(p=>p.position==='P'&&!s.gmUsed!.includes(p.id!)).sort((a,b)=>(b.stuff-(b.gm?.fatigue??0)/4)-(a.stuff-(a.gm?.fatigue??0)/4))[0];
    if(replacement){s.gmPitchers![opposite]=replacement.id!;s.gmUsed!.push(replacement.id!);participate(s,replacement,true);s.currentPitcher=replacement;log(s,`투수 교체: ${pitcher.name} → ${replacement.name}`);}else log(s,'교체 가능한 투수가 없습니다.');return s;
  }
  if(offense==='pinch_hit'){
    const replacement=attack.filter(p=>p.position!=='P'&&!s.gmLineups![side].includes(p.id!)&&!s.gmUsed!.includes(p.id!)).sort((a,b)=>b.contact-a.contact)[0];
    if(replacement){s.gmUsed!.push(batter.id!);s.gmLineups![side][s.currentBatterIndex[side]%9]=replacement.id!;s.currentBatter=replacement;log(s,`대타: ${batter.name} → ${replacement.name}`);}else log(s,'교체 가능한 타자가 없습니다.');return s;
  }
  if(offense==='pinch_run'){
    const base=s.bases.findIndex(Boolean);if(base<0){log(s,'교체할 주자가 없습니다.');return s;}
    const runner=attack.find(p=>p.name===s.runners[base]);
    const replacement=attack.filter(p=>p.position!=='P'&&!s.gmLineups![side].includes(p.id!)&&!s.gmUsed!.includes(p.id!)).sort((a,b)=>b.speed-a.speed)[0];
    if(runner&&replacement){const slot=s.gmLineups![side].indexOf(runner.id!);if(slot>=0)s.gmLineups![side][slot]=replacement.id!;s.gmUsed!.push(runner.id!);s.runners[base]=replacement.name;log(s,`대주자: ${runner.name} → ${replacement.name}`);}else log(s,'교체 가능한 주자가 없습니다.');return s;
  }
  s.currentBatter=batter;s.currentPitcher=pitcher;
  const bs=batting(batter),ps=pitching(pitcher);
  const score=(name:string|null)=>{const runner=attack.find(p=>p.name===name);if(runner)batting(runner).runs++;if(s.isTop){s.awayScore++;s.inningScoresAway[s.inning-1]=(s.inningScoresAway[s.inning-1]??0)+1;}else{s.homeScore++;s.inningScoresHome[s.inning-1]=(s.inningScoresHome[s.inning-1]??0)+1;}ps.runsAllowed++;ps.earnedRuns++;};
  const advance=(bases:number)=>{let runs=0;for(let i=2;i>=0;i--)if(s.bases[i]){const name=s.runners[i];s.bases[i]=false;s.runners[i]=null;if(i+bases>=3){score(name);runs++;}else{s.bases[i+bases]=true;s.runners[i+bases]=name;}}if(bases===4){score(batter.name);runs++;}else{s.bases[bases-1]=true;s.runners[bases-1]=batter.name;}return runs;};
  const out=(count=1)=>{s.outs+=count;ps.innings+=count/3;};
  let consume=true;
  if(offense==='steal'){
    consume=false;const base:number=s.bases[0]&&!s.bases[1]?0:s.bases[1]&&!s.bases[2]?1:-1;
    if(base<0){log(s,'도루 가능한 주자가 없습니다.');return s;}
    const runner=attack.find(p=>p.name===s.runners[base])!;
    if(Math.random()<0.4+runner.speed/200){s.bases[base+1]=true;s.runners[base+1]=s.runners[base]??null;batting(runner).sb++;log(s,`${runner.name} 도루 성공`);}else{out();log(s,`${runner.name} 도루 실패`);}s.bases[base]=false;s.runners[base]=null;
  }else{
    participate(s,batter);bs.pa++;
    const fatigue=(pitcher.gm?.fatigue??0)/500;
    const roll=Math.random(),bb=Math.min(.18,Math.max(.03,.08+(batter.eye-pitcher.control)*.001)),strike=Math.min(.35,Math.max(.08,.20+(pitcher.stuff-batter.contact)*.0015+(defense==='pitch_strike'?.02:0))),hit=Math.min(.4,Math.max(.15,.26+(batter.contact-pitcher.stuff)*.0015+fatigue+(offense==='hit_and_run'?.01:0)));
    if(defense==='intentional_walk'||roll<bb){
      bs.bb++;ps.bbAllowed++;if(s.bases[0]){if(s.bases[1]){if(s.bases[2]){score(s.runners[2]);bs.rbi++;}s.bases[2]=true;s.runners[2]=s.runners[1];}s.bases[1]=true;s.runners[1]=s.runners[0];}s.bases[0]=true;s.runners[0]=batter.name;log(s,`${batter.name} 볼넷`);
    }else if(offense==='bunt'&&s.bases.some(Boolean)){
      out();if(s.bases[1]&&!s.bases[2]){s.bases[2]=true;s.runners[2]=s.runners[1];s.bases[1]=false;s.runners[1]=null;}if(s.bases[0]&&!s.bases[1]){s.bases[1]=true;s.runners[1]=s.runners[0];s.bases[0]=false;s.runners[0]=null;}log(s,`${batter.name} 희생번트`);
    }else if(roll<bb+strike){bs.ab++;bs.so++;ps.so++;out();log(s,`${batter.name} 삼진`);
    }else if(roll<bb+strike+hit){
      bs.ab++;bs.hits++;ps.hitsAllowed++;if(s.isTop)s.awayHits++;else s.homeHits++;
      const long=Math.random(),bases=long<Math.max(.02,(batter.power-20)/550)?4:long<.3?2:long<.32?3:1;
      if(bases===4){bs.hr++;ps.hrAllowed++;}else if(bases===2)bs.doubles++;else if(bases===3)bs.triples++;
      bs.rbi+=advance(bases);log(s,`${batter.name} ${bases===4?'홈런':`${bases}루타`}`);
    }else{bs.ab++;out();log(s,`${batter.name} 범타`);}
    pitcher.gm??={fatigue:0,training:'balanced'};pitcher.gm.fatigue=Math.min(100,pitcher.gm.fatigue+1);
    batter.gm??={fatigue:0,training:'balanced'};batter.gm.fatigue=Math.min(100,batter.gm.fatigue+2);
  }
  if(consume)s.currentBatterIndex[side]++;
  if(!s.isTop&&s.inning>=9&&s.homeScore>s.awayScore)s.isGameOver=true;
  if(s.outs>=3){
    if(s.inning>=9&&((s.isTop&&s.homeScore>s.awayScore)||(!s.isTop&&(s.homeScore!==s.awayScore||s.inning>=12))))s.isGameOver=true;
    if(!s.isGameOver){s.outs=0;s.bases=[false,false,false];s.runners=[null,null,null];if(!s.isTop)s.inning++;s.isTop=!s.isTop;}
  }
  if(s.isGameOver){s.winnerTeamCode=s.homeScore>s.awayScore?s.homeTeamCode:s.awayScore>s.homeScore?s.awayTeamCode:undefined;log(s,`경기 종료 ${s.awayScore}:${s.homeScore}`);}
  else {const nextSide=s.isTop?'away':'home';s.currentBatter=find(s.gmLineups![nextSide][s.currentBatterIndex[nextSide]%9]);s.currentPitcher=find(s.gmPitchers![s.isTop?'home':'away']);}
  refresh(all);return s;
}
export function completeGMMatch(s:InGameMatchState,home:Team,away:Team,players:Player[],regular=true):BoxscoreRecord {
  if(!s.isGameOver)throw new Error('경기를 마친 뒤 결과를 확정해주세요.');
  const homeWin=s.homeScore>s.awayScore,awayWin=s.awayScore>s.homeScore;
  if(regular){if(homeWin){home.wins=(home.wins??0)+1;away.losses=(away.losses??0)+1;}else if(awayWin){away.wins=(away.wins??0)+1;home.losses=(home.losses??0)+1;}else{home.draws=(home.draws??0)+1;away.draws=(away.draws??0)+1;}
    home.runsScored=(home.runsScored??0)+s.homeScore;home.runsAllowed=(home.runsAllowed??0)+s.awayScore;away.runsScored=(away.runsScored??0)+s.awayScore;away.runsAllowed=(away.runsAllowed??0)+s.homeScore;
  }
  const winner=homeWin?home:awayWin?away:undefined,loser=homeWin?away:awayWin?home:undefined;
  const winning=winner?players.find(p=>p.id===s.gmPitchers![homeWin?'home':'away']):undefined;
  const losing=loser?players.find(p=>p.id===s.gmPitchers![homeWin?'away':'home']):undefined;
  if(winning)pitching(winning).wins++;if(losing)pitching(losing).losses++;
  return {matchId:s.matchId,dateStr:s.dateStr,homeTeamName:home.name,awayTeamName:away.name,homeScore:s.homeScore,awayScore:s.awayScore,homeHits:s.homeHits,awayHits:s.awayHits,homeErrors:s.homeErrors,awayErrors:s.awayErrors,winningPitcher:winning?.name,losingPitcher:losing?.name};
}
export function quickSimulateMatch(id:string,date:string,home:Team,away:Team,hp:Player[],ap:Player[],regular=true) {
  let s=initInGameMatch(id,date,home,away,hp,ap);
  for(let i=0;i<1500&&!s.isGameOver;i++)s=simulateAtBat(s,hp,ap);
  return completeGMMatch(s,home,away,[...hp,...ap],regular);
}
