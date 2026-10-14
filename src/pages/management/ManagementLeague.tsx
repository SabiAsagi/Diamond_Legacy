import { useEffect, useState } from 'react';
import { useProLeagueStore } from '../../store/proLeagueStore';
import { Trophy, Award, Flame, Shield, TrendingUp, Activity } from 'lucide-react';
import './ManagementLeague.css';

export default function ManagementLeague() {
  const { standings, players, season, loadLeague } = useProLeagueStore();
  const [activeTab, setActiveTab] = useState<'standings' | 'batting' | 'pitching'>('standings');

  useEffect(() => {
    loadLeague();
  }, [loadLeague]);

  // 타격 부문 TOP 5
  const qualifiedBatters = players.filter(p => p.position !== 'P' && (p.proStats?.batting?.ab ?? 0) >= 1);
  const avgLeaders = [...qualifiedBatters].sort((a, b) => (b.proStats?.batting?.avg ?? 0) - (a.proStats?.batting?.avg ?? 0)).slice(0, 5);
  const hrLeaders = [...qualifiedBatters].sort((a, b) => (b.proStats?.batting?.hr ?? 0) - (a.proStats?.batting?.hr ?? 0)).slice(0, 5);
  const rbiLeaders = [...qualifiedBatters].sort((a, b) => (b.proStats?.batting?.rbi ?? 0) - (a.proStats?.batting?.rbi ?? 0)).slice(0, 5);
  const hitLeaders = [...qualifiedBatters].sort((a, b) => (b.proStats?.batting?.hits ?? 0) - (a.proStats?.batting?.hits ?? 0)).slice(0, 5);

  // 투수 부문 TOP 5
  const qualifiedPitchers = players.filter(p => p.position === 'P' && (p.proStats?.pitching?.innings ?? 0) >= 1);
  const eraLeaders = [...qualifiedPitchers].sort((a, b) => (a.proStats?.pitching?.era ?? 99) - (b.proStats?.pitching?.era ?? 99)).slice(0, 5);
  const winLeaders = [...qualifiedPitchers].sort((a, b) => (b.proStats?.pitching?.wins ?? 0) - (a.proStats?.pitching?.wins ?? 0)).slice(0, 5);
  const soLeaders = [...qualifiedPitchers].sort((a, b) => (b.proStats?.pitching?.so ?? 0) - (a.proStats?.pitching?.so ?? 0)).slice(0, 5);
  const saveLeaders = [...qualifiedPitchers].sort((a, b) => (b.proStats?.pitching?.saves ?? 0) - (a.proStats?.pitching?.saves ?? 0)).slice(0, 5);

  return (
    <div className="management-league-container animate-fade-in">
      {/* 헤더 */}
      <div className="league-page-header glass-panel">
        <div>
          <div className="league-title-row">
            <Trophy size={28} className="text-accent" />
            <h1>{season?.year ?? 2026}시즌 KBO 프로야구 리그 순위 및 기록실</h1>
          </div>
          <p className="league-subtitle">
            정규 시즌 144경기 기준 10개 구단 순위표 및 부문별 개인 타이틀 기록
          </p>
        </div>

        {/* 탭 네비게이션 */}
        <div className="league-tabs">
          <button 
            className={`tab-btn ${activeTab === 'standings' ? 'active' : ''}`}
            onClick={() => setActiveTab('standings')}
          >
            <TrendingUp size={16} /> 구단 순위표
          </button>
          <button 
            className={`tab-btn ${activeTab === 'batting' ? 'active' : ''}`}
            onClick={() => setActiveTab('batting')}
          >
            <Flame size={16} /> 타격 타이틀 TOP 5
          </button>
          <button 
            className={`tab-btn ${activeTab === 'pitching' ? 'active' : ''}`}
            onClick={() => setActiveTab('pitching')}
          >
            <Activity size={16} /> 투구 타이틀 TOP 5
          </button>
        </div>
      </div>

      {/* 1. 정규 순위표 탭 */}
      {activeTab === 'standings' && (
        <section className="standings-table-card glass-panel">
          <table className="kbo-standings-table">
            <thead>
              <tr>
                <th>순위</th>
                <th className="team-head">구단명</th>
                <th>경기</th>
                <th>승</th>
                <th>무</th>
                <th>패</th>
                <th>승률</th>
                <th>게임차</th>
                <th>득점</th>
                <th>실점</th>
                <th>득실차</th>
                <th>연속</th>
                <th>최근 10경기</th>
                <th>팀타율</th>
                <th>팀평균자책</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.teamId} className={s.teamId === season?.userTeamId ? 'my-team-row' : ''}>
                  <td className="rank-number">
                    {s.rank <= 5 ? <span className="postseason-pill">{s.rank}</span> : s.rank}
                  </td>
                  <td className="team-name-cell">
                    <strong>{s.name}</strong>
                    {s.teamId === season?.userTeamId && <span className="my-label">내 구단</span>}
                  </td>
                  <td>{s.games}</td>
                  <td className="text-win font-bold">{s.wins}</td>
                  <td>{s.draws}</td>
                  <td className="text-loss font-bold">{s.losses}</td>
                  <td className="font-bold text-accent">{s.winRate.toFixed(3)}</td>
                  <td>{s.gamesBehind === 0 ? '-' : s.gamesBehind}</td>
                  <td>{s.runsScored}</td>
                  <td>{s.runsAllowed}</td>
                  <td className={s.runDifferential >= 0 ? 'text-win' : 'text-loss'}>
                    {s.runDifferential >= 0 ? `+${s.runDifferential}` : s.runDifferential}
                  </td>
                  <td>{s.streak}</td>
                  <td>{s.last10}</td>
                  <td>{s.teamAvg.toFixed(3)}</td>
                  <td>{s.teamEra.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="standings-footer-note">
            * 1위~5위는 포스트시즌(와일드카드·준플레이오프·플레이오프·한국시리즈) 진출 순위입니다.
          </div>
        </section>
      )}

      {/* 2. 타격 부문 리더보드 */}
      {activeTab === 'batting' && (
        <div className="leaderboards-grid">
          {/* 타율 */}
          <div className="leader-card glass-panel">
            <h4><Award size={16} /> 타율 (AVG)</h4>
            <div className="leader-list">
              {avgLeaders.map((p, i) => (
                <div key={p.id} className="leader-item">
                  <span className="leader-rank">{i + 1}</span>
                  <span className="leader-name">{p.name}</span>
                  <span className="leader-pos">{p.position}</span>
                  <span className="leader-val font-bold text-accent">{(p.proStats?.batting?.avg ?? 0).toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 홈런 */}
          <div className="leader-card glass-panel">
            <h4><Flame size={16} /> 홈런 (HR)</h4>
            <div className="leader-list">
              {hrLeaders.map((p, i) => (
                <div key={p.id} className="leader-item">
                  <span className="leader-rank">{i + 1}</span>
                  <span className="leader-name">{p.name}</span>
                  <span className="leader-pos">{p.position}</span>
                  <span className="leader-val font-bold text-accent">{p.proStats?.batting?.hr ?? 0}개</span>
                </div>
              ))}
            </div>
          </div>

          {/* 타점 */}
          <div className="leader-card glass-panel">
            <h4><Award size={16} /> 타점 (RBI)</h4>
            <div className="leader-list">
              {rbiLeaders.map((p, i) => (
                <div key={p.id} className="leader-item">
                  <span className="leader-rank">{i + 1}</span>
                  <span className="leader-name">{p.name}</span>
                  <span className="leader-pos">{p.position}</span>
                  <span className="leader-val font-bold text-accent">{p.proStats?.batting?.rbi ?? 0}타점</span>
                </div>
              ))}
            </div>
          </div>

          {/* 최다안타 */}
          <div className="leader-card glass-panel">
            <h4><Award size={16} /> 최다 안타 (H)</h4>
            <div className="leader-list">
              {hitLeaders.map((p, i) => (
                <div key={p.id} className="leader-item">
                  <span className="leader-rank">{i + 1}</span>
                  <span className="leader-name">{p.name}</span>
                  <span className="leader-pos">{p.position}</span>
                  <span className="leader-val font-bold text-accent">{p.proStats?.batting?.hits ?? 0}안타</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. 투구 부문 리더보드 */}
      {activeTab === 'pitching' && (
        <div className="leaderboards-grid">
          {/* 평균자책점 */}
          <div className="leader-card glass-panel">
            <h4><Shield size={16} /> 평균자책점 (ERA)</h4>
            <div className="leader-list">
              {eraLeaders.map((p, i) => (
                <div key={p.id} className="leader-item">
                  <span className="leader-rank">{i + 1}</span>
                  <span className="leader-name">{p.name}</span>
                  <span className="leader-pos">{p.pitcherRole}</span>
                  <span className="leader-val font-bold text-accent">{(p.proStats?.pitching?.era ?? 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 다승 */}
          <div className="leader-card glass-panel">
            <h4><Trophy size={16} /> 다승 (WINS)</h4>
            <div className="leader-list">
              {winLeaders.map((p, i) => (
                <div key={p.id} className="leader-item">
                  <span className="leader-rank">{i + 1}</span>
                  <span className="leader-name">{p.name}</span>
                  <span className="leader-pos">{p.pitcherRole}</span>
                  <span className="leader-val font-bold text-accent">{p.proStats?.pitching?.wins ?? 0}승</span>
                </div>
              ))}
            </div>
          </div>

          {/* 탈삼진 */}
          <div className="leader-card glass-panel">
            <h4><Flame size={16} /> 탈삼진 (SO)</h4>
            <div className="leader-list">
              {soLeaders.map((p, i) => (
                <div key={p.id} className="leader-item">
                  <span className="leader-rank">{i + 1}</span>
                  <span className="leader-name">{p.name}</span>
                  <span className="leader-pos">{p.pitcherRole}</span>
                  <span className="leader-val font-bold text-accent">{p.proStats?.pitching?.so ?? 0}K</span>
                </div>
              ))}
            </div>
          </div>

          {/* 세이브 */}
          <div className="leader-card glass-panel">
            <h4><Shield size={16} /> 세이브 (SAVES)</h4>
            <div className="leader-list">
              {saveLeaders.map((p, i) => (
                <div key={p.id} className="leader-item">
                  <span className="leader-rank">{i + 1}</span>
                  <span className="leader-name">{p.name}</span>
                  <span className="leader-pos">{p.pitcherRole}</span>
                  <span className="leader-val font-bold text-accent">{p.proStats?.pitching?.saves ?? 0}SV</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
