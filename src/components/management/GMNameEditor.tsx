import { useState } from 'react';
import { useProLeagueStore } from '../../store/proLeagueStore';
import type { Team, Player } from '../../types';
import './GMWorldSetup.css';

export function GMNameEditor() {
  const {teams,players,draftProspects,season}=useProLeagueStore();
  const [kind,setKind]=useState<'team'|'player'>('team');
  const [teamId,setTeamId]=useState(season?.userTeamId ?? teams[0]?.id);
  const [playerId,setPlayerId]=useState<number>();
  const team=teams.find(t=>t.id===teamId) ?? teams[0];
  const choices=[...players.filter(p=>p.teamId===team?.id),...draftProspects];
  const player=choices.find(p=>p.id===playerId) ?? choices[0];
  return <section className="gm-world-setup glass-panel" aria-labelledby="gm-name-title">
    <h2 id="gm-name-title">구단·선수 이름 편집</h2>
    <p>이름은 현재 GM 저장에 적용됩니다. 선수 기록과 소속, 구단 전적은 유지됩니다.</p>
    <div style={{display:'flex',gap:12,marginBottom:20}}>
      <button className="btn btn-secondary" aria-pressed={kind==='team'} onClick={()=>setKind('team')}>구단 이름</button>
      <button className="btn btn-secondary" aria-pressed={kind==='player'} onClick={()=>setKind('player')}>선수 이름</button>
    </div>
    <label>편집할 구단<select value={team?.id} onChange={e=>setTeamId(Number(e.target.value))}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    {kind==='player' && <label style={{marginTop:16}}>편집할 선수<select value={player?.id ?? ''} onChange={e=>setPlayerId(Number(e.target.value))}>{choices.map(p=><option key={p.id} value={p.id}>{p.name}{p.status==='DraftProspect'?' · 드래프트 후보':''}</option>)}</select></label>}
    {kind==='team' && team && <NameForm key={`team:${team.id}`} team={team} />}
    {kind==='player' && (player ? <NameForm key={`player:${player.id}`} player={player} /> : <p>편집할 선수가 없습니다.</p>)}
  </section>;
}

function NameForm({team,player}:{team?:Team;player?:Player}) {
  const {renameTeam,renamePlayer,isLoading,inGameMatch}=useProLeagueStore();
  const [name,setName]=useState(team?.name ?? player?.name ?? '');
  const [shortName,setShortName]=useState(team?.shortName ?? '');
  const [venue,setVenue]=useState(team?.venue ?? '');
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  const busy=isLoading || !!inGameMatch;
  return <form style={{marginTop:20}} onSubmit={async e=>{
    e.preventDefault();setError('');setSaved(false);
    try {if(team?.id)await renameTeam(team.id,name,shortName,venue);else if(player?.id)await renamePlayer(player.id,name);setSaved(true);}
    catch(err){setError(err instanceof Error?err.message:'저장하지 못했습니다. 다시 시도해주세요.');}
  }}>
    <label>{team?'구단명':'선수명'}<input value={name} maxLength={40} required disabled={busy} onChange={e=>{setName(e.target.value);setSaved(false);}} /></label>
    {team && <><label>약칭<input value={shortName} maxLength={24} required disabled={busy} onChange={e=>{setShortName(e.target.value);setSaved(false);}} /></label><label>구장명<input value={venue} maxLength={60} required disabled={busy} onChange={e=>{setVenue(e.target.value);setSaved(false);}} /></label></>}
    {inGameMatch && <p>진행 중인 경기를 마친 뒤 이름을 수정할 수 있습니다.</p>}
    {error && <p role="alert">{error}</p>}{saved && <p role="status">이름을 저장했습니다.</p>}
    <button className="btn btn-primary" disabled={busy}>{isLoading?'저장 중…':'이름 저장'}</button>
  </form>;
}
