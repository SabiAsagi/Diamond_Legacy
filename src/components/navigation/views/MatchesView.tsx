import { TournamentBracket } from './TournamentBracket';
import { useState } from 'react';
import type { Player } from '../../../types';
import type { ScheduledMatch } from '../../../types/tournament';
import type { DayLogRecord } from '../../../store/gameClockStore';
import { Trophy, Calendar, BookOpen, Shield, Award, BarChart3 } from 'lucide-react';
import { getWeekendGroupStandings } from '../../../data/weekendLeague';
import { getHighSchoolDataByName, HIGH_SCHOOLS_DATA } from '../../../data/highSchools';

interface MatchesViewProps {
  player: Player;
  matches: ScheduledMatch[];
  historyLogs: DayLogRecord[];
  onClose: () => void;
  showBracket?: boolean;
}

export function MatchesView({ player, matches, historyLogs, showBracket = true }: MatchesViewProps) {
  const records = (player.matchRecords ?? []).filter(r => r.year === (player.gameDate?.year ?? 2026));
  const played = records.filter(r => r.performance && !['bench', 'outside'].includes(r.performance.role));
  const atBats = played.reduce((sum, r) => sum + r.performance!.atBats, 0);
  const hits = played.reduce((sum, r) => sum + r.performance!.hits, 0);
  const homeRuns = played.reduce((sum, r) => sum + (r.performance!.homeRuns ?? 0), 0);
  const rbi = played.reduce((sum, r) => sum + (r.performance!.rbi ?? 0), 0);
  const stolenBases = played.reduce((sum, r) => sum + (r.performance!.stolenBases ?? 0), 0);
  const innings = played.reduce((sum, r) => sum + r.performance!.innings, 0);
  const strikeouts = played.reduce((sum, r) => sum + (r.performance!.strikeouts ?? 0), 0);
  const runsAllowed = played.reduce((sum, r) => sum + (r.performance!.runsAllowed ?? 0), 0);
  
  const [activeTab, setActiveTab] = useState<'schedule' | 'standings' | 'stats' | 'logs' | 'bracket'>('schedule');
  const [leagueHalf, setLeagueHalf] = useState<1 | 2>(1);

  const school = getHighSchoolDataByName(player.highSchool);
  const groupData = school ? getWeekendGroupStandings(school, HIGH_SCHOOLS_DATA, matches, leagueHalf) : null;

  return (
    <div className="menu-view-container glass-panel animate-scale-up">
      <div className="menu-view-header">
        <div className="menu-view-title-group">
          <Trophy size={22} className="text-accent" />
          <div>
            <h3 className="menu-view-title">야구부 경기 기록실</h3>
            <p className="menu-view-sub">청백전·연습경기·주말리그·전국대회의 출전 형태와 경기 후 평가 및 리그 순위표를 확인합니다.</p>
          </div>
        </div>

        {/* 탭 전환 바 */}
        <div className="menu-view-tabs">
          {showBracket && (
            <button className={`tab-btn ${activeTab === 'bracket' ? 'active' : ''}`} onClick={() => setActiveTab('bracket')}>
              조 추첨 · 대진표
            </button>
          )}
          <button
            className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            <Calendar size={14} /> 대회 일정 & 결과
          </button>
          <button
            className={`tab-btn ${activeTab === 'standings' ? 'active' : ''}`}
            onClick={() => setActiveTab('standings')}
          >
            <BarChart3 size={14} /> 주말리그 순위표
          </button>
          <button
            className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            <Award size={14} /> 개인 시즌 성적
          </button>
          <button
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <BookOpen size={14} /> 활동 일지 아카이브
          </button>
        </div>
      </div>

      <div className="menu-view-body">
        {activeTab === 'bracket' && <TournamentBracket matches={matches} />}

        {/* 1. 대회 일정 및 결과 */}
        {activeTab === 'schedule' && (
          <div className="matches-schedule-list">
            <div className="record-summary-banner glass-panel">
              <div className="school-record-stat">
                <Shield size={20} className="text-primary" />
                <span>{player.highSchool} 야구부 {player.gameDate?.year ?? 2026} 시즌 경기 현황</span>
              </div>
              <span className="record-badge">우리 학교 {matches.filter(m => m.isPlayerTeamMatch).length}경기 편성</span>
            </div>

            <div className="match-cards-grid">
              {matches.filter(m => m.isPlayerTeamMatch).map(m => (
                <div key={m.id} className="match-card glass-panel">
                  <div className="m-card-header">
                    <span className="m-tour-name">{m.tournamentName}</span>
                    <span className="m-date-tag">{m.date.month}월 {m.date.day}일</span>
                  </div>
                  <div className="m-round-title">{m.round}</div>
                  <div className="m-vs-row">
                    <span className="team-name home">{m.drawn === false ? '추첨 대기' : m.homeSchoolName}</span>
                    <span className="vs-tag">VS</span>
                    <span className="team-name away">{m.drawn === false ? '추첨 대기' : m.awaySchoolName}</span>
                  </div>
                  <p className="m-desc">{m.result ? `승리: ${m.result === 'home' ? m.homeSchoolName : m.awaySchoolName}` : m.description || '정규 공식 경기'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. 주말리그 순위표 (신규) */}
        {activeTab === 'standings' && groupData && (
          <div className="weekend-standings-view">
            <div className="record-summary-banner glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>고교야구 주말리그 {groupData.groupName} 순위표</strong>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>같은 조 상대와 권역 단일 순환 리그를 치릅니다.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className={`btn btn-sm ${leagueHalf === 1 ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLeagueHalf(1)}>
                  전반기 주말리그
                </button>
                <button className={`btn btn-sm ${leagueHalf === 2 ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLeagueHalf(2)}>
                  후반기 주말리그
                </button>
              </div>
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                    <th style={{ padding: '8px 10px' }}>순위</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>학교명</th>
                    <th style={{ padding: '8px 10px' }}>경기</th>
                    <th style={{ padding: '8px 10px' }}>승</th>
                    <th style={{ padding: '8px 10px' }}>무</th>
                    <th style={{ padding: '8px 10px' }}>패</th>
                    <th style={{ padding: '8px 10px' }}>승률</th>
                    <th style={{ padding: '8px 10px' }}>득점</th>
                    <th style={{ padding: '8px 10px' }}>실점</th>
                    <th style={{ padding: '8px 10px' }}>득실차</th>
                  </tr>
                </thead>
                <tbody>
                  {groupData.standings.map((s) => (
                    <tr 
                      key={s.schoolId} 
                      style={{ 
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        backgroundColor: s.isPlayerSchool ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        fontWeight: s.isPlayerSchool ? 'bold' : 'normal',
                      }}
                    >
                      <td style={{ padding: '8px 10px' }}>{s.rank}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'left' }}>
                        {s.schoolName} {s.isPlayerSchool && <span style={{ color: '#38bdf8', fontSize: '0.75rem' }}>(우리 학교)</span>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>{s.games}</td>
                      <td style={{ padding: '8px 10px', color: '#34d399' }}>{s.wins}</td>
                      <td style={{ padding: '8px 10px' }}>{s.draws}</td>
                      <td style={{ padding: '8px 10px', color: '#f87171' }}>{s.losses}</td>
                      <td style={{ padding: '8px 10px', color: '#facc15' }}>{s.winRate.toFixed(3)}</td>
                      <td style={{ padding: '8px 10px' }}>{s.runsScored}</td>
                      <td style={{ padding: '8px 10px' }}>{s.runsAllowed}</td>
                      <td style={{ padding: '8px 10px' }}>{s.runDiff >= 0 ? `+${s.runDiff}` : s.runDiff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. 개인 시즌 성적 (상세 표) */}
        {activeTab === 'stats' && (
          <div className="player-season-records">
            <div className="glass-panel" style={{ padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, textAlign: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>출전 경기</span>
                <h4 style={{ margin: 0, fontSize: '1.4rem', color: '#38bdf8' }}>{played.length}G</h4>
              </div>
              {player.position !== 'P' && (
                <>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>타율 (AVG)</span>
                    <h4 style={{ margin: 0, fontSize: '1.4rem', color: '#facc15' }}>{atBats ? (hits / atBats).toFixed(3) : '.000'}</h4>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>안타 / 홈런</span>
                    <h4 style={{ margin: 0, fontSize: '1.4rem' }}>{hits}H / {homeRuns}HR</h4>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>타점 / 도루</span>
                    <h4 style={{ margin: 0, fontSize: '1.4rem' }}>{rbi}타점 / {stolenBases}도루</h4>
                  </div>
                </>
              )}
              {(player.position === 'P' || player.position === 'TwoWay') && (
                <>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>투구 이닝</span>
                    <h4 style={{ margin: 0, fontSize: '1.4rem', color: '#34d399' }}>{innings} IP</h4>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>탈삼진 / 실점</span>
                    <h4 style={{ margin: 0, fontSize: '1.4rem' }}>{strikeouts} K / {runsAllowed} R</h4>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>평균자책 (ERA)</span>
                    <h4 style={{ margin: 0, fontSize: '1.4rem', color: '#facc15' }}>{innings ? ((runsAllowed * 9) / innings).toFixed(2) : '0.00'}</h4>
                  </div>
                </>
              )}
            </div>

            <h4>경기별 출전 상세 일지</h4>
            {records.length === 0 ? (
              <p>아직 공식 경기 출전 기록이 없습니다. 대회가 시작되면 경기 결과가 누적됩니다.</p>
            ) : (
              records.map(r => (
                <div key={r.matchId} className="glass-panel" style={{ padding: 12, marginBottom: 8 }}>
                  <p style={{ margin: 0, whiteSpace: 'pre-line', fontSize: '0.85rem' }}>{r.log}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* 3. 활동 일지 아카이브 */}
        {activeTab === 'logs' && (
          <div className="logs-archive-list">
            {historyLogs.length === 0 ? (
              <div className="empty-archive">
                <BookOpen size={24} className="text-muted" />
                <p>아직 지난 일자의 활동 기록이 없습니다.</p>
              </div>
            ) : (
              historyLogs.map((item, idx) => (
                <div key={idx} className="archive-log-card glass-panel">
                  <div className="archive-date-tag">
                    📅 {item.date.grade}학년 {item.date.month}월 {item.date.day}일
                  </div>
                  <div className="archive-lines">
                    {item.morningLog && <div className="a-slot-item">🌅 오전: {item.morningLog}</div>}
                    {item.afternoonLog && <div className="a-slot-item">☀️ 오후: {item.afternoonLog}</div>}
                    {item.nightLog && <div className="a-slot-item">🌙 야간: {item.nightLog}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

