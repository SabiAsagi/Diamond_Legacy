import { useEffect, useState } from 'react';
import { GMWorldSetup } from '../../components/management/GMWorldSetup';
import { GMNameEditor } from '../../components/management/GMNameEditor';
import { useProLeagueStore } from '../../store/proLeagueStore';
import { gmFixtures } from '../../data/gmSeason';
import { Link } from 'react-router-dom';
import { payroll } from '../../data/gmOperations';
import { InGameMatchModal } from '../../components/management/InGameMatchModal';
import { 
  Shield, 
  Calendar, 
  Play, 
  FastForward, 
  Trophy, 
  Coins, 
  Users, 
  Zap,
  ArrowRight,
  TrendingUp,
  Award
} from 'lucide-react';
import './ManagementDashboard.css';

export default function ManagementDashboard() {
  const [loadError,setLoadError] = useState('');
  const [nameEditor,setNameEditor] = useState(false);
  const { 
    teams, 
    players,
    initializeGM,
    season, 
    standings, 
    recentBoxscores, 
    draftProspects,
    inGameMatch, 
    isLoading, 
    currentDateStr,
    loadLeague, 
    setUserTeam, 
    simulateDay, 
    simulateDays, 
    simulateToNextUserMatch, 
    startInGameMatch, 
    executeTacticalAction, 
    stepHalfInning, 
    finishLiveGameSimulate, 
    closeLiveGame 
  } = useProLeagueStore();

  useEffect(() => {
    if(!useProLeagueStore.getState().season) loadLeague().catch(() => setLoadError('GM 저장을 불러오지 못했습니다. 다시 시도해주세요.'));
  }, [loadLeague]);

  const ready=season?.setupCompleted,initialized=season?.office?.initialized;
  useEffect(()=>{if(ready&&!initialized)void initializeGM().catch(e=>setLoadError(String(e)));},[ready,initialized,initializeGM]);
  const action=async(fn:()=>void|Promise<void>)=>{try{await fn();setLoadError('');}catch(e){setLoadError(e instanceof Error?e.message:String(e));}};
  if (loadError && !season) return <section className="glass-panel gm-world-setup"><p role="alert">{loadError}</p><button className="btn btn-primary" onClick={() => { setLoadError(''); loadLeague().catch(() => setLoadError('GM 저장을 불러오지 못했습니다. 다시 시도해주세요.')); }}>다시 불러오기</button></section>;
  if (!season) return <p role="status">GM 세계를 불러오는 중…</p>;
  if (!season.setupCompleted) return <GMWorldSetup />;

  const userTeam = teams.find(t => t.id === season?.userTeamId) || teams[0];
  const userStanding = standings.find(s => s.teamId === userTeam?.id);

  // 오늘 일정 매치업
  const todayFixtures = season ? gmFixtures(season).map(f=>({...f,home:teams.find(t=>t.id===Number(f.home))?.code??f.home,away:teams.find(t=>t.id===Number(f.away))?.code??f.away})) : [];
  const userFixture = todayFixtures.find(f => f.home === userTeam?.code || f.away === userTeam?.code);

  return (
    <div className="management-dashboard-container animate-fade-in">
      <Link className="btn btn-primary" to="/management/office">구단 운영실 · 계약·트레이드·드래프트·퓨처스</Link>
      {loadError && <p role="alert">{loadError}</p>}
      <button className="btn btn-secondary" aria-expanded={nameEditor} onClick={()=>setNameEditor(v=>!v)}>{nameEditor?'이름 편집 닫기':'구단·선수 이름 편집'}</button>
      {nameEditor && <GMNameEditor />}
      {draftProspects.some(p=>p.draftSourceCareerId!==undefined) && <section className="glass-panel" style={{padding:'20px'}}><h2>연결된 드래프트 후보</h2><p>선수 육성에서 연결한 후보입니다. 운영실의 신인 드래프트에서 지명할 수 있습니다.</p><ul>{draftProspects.filter(p=>p.draftSourceCareerId!==undefined).map(p => <li key={p.id}>{p.name} · {p.highSchool} · {p.draftClassYear}년 후보</li>)}</ul></section>}
      {['Draft','Offseason'].includes(season.currentStage) && <section className="glass-panel"><p>{season.currentStage==='Draft'?'시즌이 끝났습니다. 운영실에서 신인 지명을 진행해주세요.':'비시즌입니다. 계약과 선수단을 정리한 뒤 운영실에서 다음 시즌을 시작해주세요.'}</p></section>}
      {/* 1. 상단 내 구단 헤더 */}
      {userTeam && (
        <section className="club-header-panel glass-panel">
          <div className="club-identity-col">
            <div className="club-emblem-badge" style={{ backgroundColor: userTeam.primaryColor || 'var(--primary)' }}>
              <Shield size={36} color="#ffffff" />
            </div>
            <div>
              <div className="club-select-wrap">
                <select 
                  value={userTeam.id} 
                  onChange={(e) => void setUserTeam(Number(e.target.value))}
                  className="club-select"
                >
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.city})</option>
                  ))}
                </select>
                <span className="venue-label">🏟️ {userTeam.venue}</span>
              </div>
              <h1 className="club-headline">{userTeam.name}</h1>
              <p className="club-subline">
                단장 집무실 · {season?.year ?? 2026}시즌 · {season.currentStage}
              </p>
            </div>
          </div>

          <div className="club-stats-grid">
            <div className="stat-card">
              <span className="stat-label"><Trophy size={14} /> 현재 순위</span>
              <span className="stat-value text-accent">{userStanding?.rank ?? 1}위</span>
              <span className="stat-sub">
                {userStanding?.wins ?? 0}승 {userStanding?.draws ?? 0}무 {userStanding?.losses ?? 0}패 (승률 {((userStanding?.winRate ?? 0) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label"><Coins size={14} /> 잔여 예산</span>
              <span className="stat-value">{((userTeam.budget-payroll(userTeam.id!,players,season)) / 100000000).toFixed(1)}억원</span>
              <span className="stat-sub">총 연봉 {(payroll(userTeam.id!,players,season) / 100000000).toFixed(1)}억</span>
            </div>
            <div className="stat-card">
              <span className="stat-label"><Users size={14} /> 팬 지지도</span>
              <span className="stat-value">{userTeam.fanBase}점</span>
              <span className="stat-sub">구단 명성 {userTeam.reputation ?? 85}</span>
            </div>
          </div>
        </section>
      )}

      {/* 2. 일정 시뮬레이션 및 경기 개입 컨트롤 바 */}
      <section className="simulation-toolbar glass-panel">
        <div className="date-display">
          <Calendar size={18} className="text-primary" />
          <span><strong>{currentDateStr}</strong> 경기 일정</span>
          <span className="match-count-badge">오늘 총 {todayFixtures.length}경기 예정</span>
        </div>

        <div className="toolbar-actions">
          {userFixture && (
            <button 
              className="btn btn-primary btn-ootp-live"
              onClick={()=>void action(startInGameMatch)}
              disabled={isLoading||!!inGameMatch||['Draft','Offseason'].includes(season.currentStage)}
            >
              <Zap size={18} /> 실시간 경기 지휘
            </button>
          )}
          <button 
            className="btn btn-secondary" 
            onClick={() => void action(simulateDay)}
            disabled={isLoading||!!inGameMatch||['Draft','Offseason'].includes(season.currentStage)}
          >
            <Play size={16} /> 오늘 경기 시뮬레이션
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => void action(simulateToNextUserMatch)}
            disabled={isLoading||!!inGameMatch||['Draft','Offseason'].includes(season.currentStage)}
          >
            <ArrowRight size={16} /> 다음 우리 경기까지 진행
          </button>
          <button 
            className="btn btn-outline" 
            onClick={() => void action(()=>simulateDays(7))}
            disabled={isLoading||!!inGameMatch||['Draft','Offseason'].includes(season.currentStage)}
          >
            <FastForward size={16} /> 1주일 일괄 진행
          </button>
        </div>
      </section>

      {/* 3. 오늘 경기 매치업 카드 리스트 */}
      <section className="today-matches-section">
        <h3 className="section-title">⚾ 오늘 열리는 리그 매치업 (10개 구단)</h3>
        {todayFixtures.length === 0 ? (
          <div className="glass-panel empty-match-panel">
            <p>오늘은 예정된 공식 경기가 없습니다. 이동일 또는 휴식일입니다.</p>
          </div>
        ) : (
          <div className="fixtures-grid">
            {todayFixtures.map((f, i) => {
              const home = teams.find(t => t.code === f.home);
              const away = teams.find(t => t.code === f.away);
              const isMyGame = home?.id === userTeam?.id || away?.id === userTeam?.id;

              return (
                <div key={i} className={`fixture-card glass-panel ${isMyGame ? 'my-game-highlight' : ''}`}>
                  <div className="fixture-time-row">
                    <span className="f-time">⏰ {f.time}</span>
                    <span className="f-venue">{f.venue}</span>
                    {isMyGame && <span className="my-match-tag">MY GAME</span>}
                  </div>
                  <div className="fixture-teams-row">
                    <span className="f-team away">
                      {away?.name ?? f.away}
                    </span>
                    <span className="vs-circle">VS</span>
                    <span className="f-team home">
                      {home?.name ?? f.home}
                    </span>
                  </div>
                  {isMyGame && (
                    <div className="fixture-footer">
                      <button 
                        className="btn btn-sm btn-primary w-full"
                        onClick={()=>void action(startInGameMatch)}
                      >
                        <Zap size={14} /> 직접 지휘하기
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. 대시보드 하단: 미니 순위표 & 최근 경기 박스스코어 */}
      <div className="dashboard-columns-grid">
        {/* 미니 순위표 */}
        <section className="mini-standings-card glass-panel">
          <div className="card-header-row">
            <h4><TrendingUp size={18} /> 정규 시즌 순위 (TOP 10)</h4>
          </div>
          <table className="mini-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>구단</th>
                <th>경기</th>
                <th>승</th>
                <th>패</th>
                <th>승률</th>
                <th>게임차</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.teamId} className={s.teamId === userTeam?.id ? 'my-row' : ''}>
                  <td className="rank-cell"><strong>{s.rank}</strong></td>
                  <td>{s.name}</td>
                  <td>{s.games}</td>
                  <td className="win-cell">{s.wins}</td>
                  <td className="loss-cell">{s.losses}</td>
                  <td>{s.winRate.toFixed(3)}</td>
                  <td>{s.gamesBehind === 0 ? '-' : s.gamesBehind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 최근 경기 결과 */}
        <section className="recent-results-card glass-panel">
          <div className="card-header-row">
            <h4><Award size={18} /> 최근 경기 박스스코어</h4>
          </div>
          {recentBoxscores.length === 0 ? (
            <p className="text-muted" style={{ padding: 16 }}>아직 완료된 경기 기록이 없습니다. 상단에서 경기를 진행해 보세요.</p>
          ) : (
            <div className="boxscores-scroll-list">
              {recentBoxscores.map((box, idx) => (
                <div key={idx} className="boxscore-mini-card">
                  <div className="box-date-row">
                    <span>📅 {box.dateStr}</span>
                    {box.winningPitcher && <span>승리: {box.winningPitcher}</span>}
                  </div>
                  <div className="box-score-row">
                    <span className="box-team">{box.awayTeamName} <strong>{box.awayScore}</strong></span>
                    <span className="box-vs">:</span>
                    <span className="box-team"><strong>{box.homeScore}</strong> {box.homeTeamName}</span>
                  </div>
                  {box.mvp && <div className="box-mvp">⭐ MVP: {box.mvp} ({box.mvpDesc})</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* OOTP 실시간 전술 개입 모달창 */}
      {inGameMatch && (
        <InGameMatchModal 
          match={inGameMatch}
          userTeamCode={userTeam?.code ?? 'TWINS'}
          onTacticalAction={executeTacticalAction}
          onStepHalfInning={stepHalfInning}
          onFinishSimulate={finishLiveGameSimulate}
          onClose={()=>void action(closeLiveGame)}
        />
      )}
    </div>
  );
}
