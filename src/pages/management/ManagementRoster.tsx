import { useEffect, useState } from 'react';
import { useProLeagueStore } from '../../store/proLeagueStore';
import type { Player } from '../../types';
import { db } from '../../db';
import { Shield } from 'lucide-react';
import './ManagementRoster.css';

export default function ManagementRoster() {
  const { teams, players, season, loadLeague } = useProLeagueStore();
  const [filterPos, setFilterPos] = useState<'ALL' | 'P' | 'C' | 'IF' | 'OF'>('ALL');
  const [filterTier, setFilterTier] = useState<'ALL' | '1군' | '2군'>('ALL');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    loadLeague();
  }, [loadLeague]);

  const userTeam = teams.find(t => t.id === season?.userTeamId) || teams[0];
  const teamPlayers = players.filter(p => p.teamId === userTeam?.id);

  // 포지션 필터링
  const filtered = teamPlayers.filter(p => {
    if (filterTier !== 'ALL' && (p.rosterTier ?? '1군') !== filterTier) return false;
    if (filterPos === 'ALL') return true;
    if (filterPos === 'P') return p.position === 'P';
    if (filterPos === 'C') return p.position === 'C';
    if (filterPos === 'IF') return ['1B', '2B', '3B', 'SS'].includes(p.position);
    if (filterPos === 'OF') return ['LF', 'CF', 'RF'].includes(p.position);
    return true;
  });

  const toggleRosterTier = async (player: Player) => {
    const nextTier = (player.rosterTier ?? '1군') === '1군' ? '2군' : '1군';
    const updated = { ...player, rosterTier: nextTier as '1군' | '2군' };
    await db.players.put(updated);
    await loadLeague();
    if (selectedPlayer?.id === player.id) setSelectedPlayer(updated);
  };

  const startingPitchers = teamPlayers.filter(p => p.position === 'P' && p.pitcherRole === 'Starter').slice(0, 5);
  const closers = teamPlayers.filter(p => p.position === 'P' && p.pitcherRole === 'Closer');
  const coreBatters = teamPlayers.filter(p => p.position !== 'P').slice(0, 9);

  return (
    <div className="management-roster-container animate-fade-in">
      {/* 상단 팀 로스터 헤더 */}
      <div className="roster-header glass-panel">
        <div className="roster-header-info">
          <Shield size={28} className="text-primary" />
          <div>
            <h1>{userTeam?.name} 선수단 로스터</h1>
            <p>1군 28인 / 2군 육성 선수단 등록 및 선발 라인업 점검</p>
          </div>
        </div>

        {/* 1군 / 2군 통계 배너 */}
        <div className="roster-counts">
          <div className="count-pill">
            <span>1군 등록:</span>
            <strong>{teamPlayers.filter(p => (p.rosterTier ?? '1군') === '1군').length}명</strong>
          </div>
          <div className="count-pill">
            <span>2군 육성:</span>
            <strong>{teamPlayers.filter(p => p.rosterTier === '2군').length}명</strong>
          </div>
          <div className="count-pill">
            <span>총 선수:</span>
            <strong>{teamPlayers.length}명</strong>
          </div>
        </div>
      </div>

      {/* 라인업 프리뷰 요약 박스 */}
      <div className="lineup-preview-grid">
        <div className="lineup-box glass-panel">
          <h4>⚾ 선발 타순 (1~9번 라인업)</h4>
          <div className="lineup-list">
            {coreBatters.map((b, idx) => (
              <div key={b.id} className="lineup-row">
                <span className="order-num">{idx + 1}번</span>
                <span className="pos-badge">{b.position}</span>
                <span className="player-name">{b.name}</span>
                <span className="rating-pill">OVR {b.overall}</span>
                <span className="stat-preview">타율 {(b.proStats?.batting?.avg ?? 0.280).toFixed(3)} · {b.proStats?.batting?.hr ?? 0}홈런</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lineup-box glass-panel">
          <h4>🔥 투수진 (선발 로테이션 & 불펜)</h4>
          <div className="lineup-list">
            {startingPitchers.map((p, idx) => (
              <div key={p.id} className="lineup-row">
                <span className="order-num">{idx + 1}선발</span>
                <span className="pos-badge">SP</span>
                <span className="player-name">{p.name}</span>
                <span className="rating-pill">OVR {p.overall}</span>
                <span className="stat-preview">구위 {p.stuff} · 제구 {p.control} · ERA {(p.proStats?.pitching?.era ?? 3.85).toFixed(2)}</span>
              </div>
            ))}
            {closers.map((p) => (
              <div key={p.id} className="lineup-row closer-row">
                <span className="order-num">마무리</span>
                <span className="pos-badge">CP</span>
                <span className="player-name">{p.name}</span>
                <span className="rating-pill">OVR {p.overall}</span>
                <span className="stat-preview">{p.proStats?.pitching?.saves ?? 0}SV · 구위 {p.stuff}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 필터 툴바 */}
      <div className="roster-toolbar glass-panel">
        <div className="filter-group">
          <span>포지션:</span>
          {(['ALL', 'P', 'C', 'IF', 'OF'] as const).map(f => (
            <button 
              key={f}
              className={`filter-btn ${filterPos === f ? 'active' : ''}`}
              onClick={() => setFilterPos(f)}
            >
              {f === 'ALL' ? '전체' : f === 'P' ? '투수' : f === 'C' ? '포수' : f === 'IF' ? '내야수' : '외야수'}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <span>군 분류:</span>
          {(['ALL', '1군', '2군'] as const).map(t => (
            <button 
              key={t}
              className={`filter-btn ${filterTier === t ? 'active' : ''}`}
              onClick={() => setFilterTier(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 선수단 테이블 */}
      <div className="roster-table-card glass-panel">
        <table className="roster-table">
          <thead>
            <tr>
              <th>등번호</th>
              <th>선수명</th>
              <th>포지션</th>
              <th>나이</th>
              <th>종합(OVR)</th>
              <th>잠재력</th>
              <th>정확도(컨택)</th>
              <th>파워</th>
              <th>선구안</th>
              <th>주력</th>
              <th>수비</th>
              <th>구위</th>
              <th>제구</th>
              <th>스테미너</th>
              <th>컨디션</th>
              <th>연봉</th>
              <th>등록</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr 
                key={p.id} 
                className={selectedPlayer?.id === p.id ? 'selected-row' : ''}
                onClick={() => setSelectedPlayer(p)}
              >
                <td>#{p.uniformNumber}</td>
                <td className="player-name-cell"><strong>{p.name}</strong></td>
                <td><span className="pos-pill">{p.position}</span></td>
                <td>{p.age}세</td>
                <td className="ovr-cell">{p.overall}</td>
                <td>{p.potential}</td>
                <td>{p.contact}</td>
                <td>{p.power}</td>
                <td>{p.eye}</td>
                <td>{p.speed}</td>
                <td>{p.defense}</td>
                <td>{p.stuff || '-'}</td>
                <td>{p.control || '-'}</td>
                <td>{p.stamina || '-'}</td>
                <td>{p.condition}</td>
                <td>{p.salary ? `${(p.salary / 10000).toFixed(0)}억` : '5,000만'}</td>
                <td>
                  <span className={`tier-badge ${(p.rosterTier ?? '1군') === '1군' ? 'tier-1' : 'tier-2'}`}>
                    {p.rosterTier ?? '1군'}
                  </span>
                </td>
                <td>
                  <button 
                    className="btn btn-sm btn-outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleRosterTier(p);
                    }}
                  >
                    {(p.rosterTier ?? '1군') === '1군' ? '2군 말소' : '1군 콜업'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
