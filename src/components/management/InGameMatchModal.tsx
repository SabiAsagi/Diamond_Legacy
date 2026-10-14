import React, { useEffect, useRef } from 'react';
import type { InGameMatchState, TacticalOffenseCommand, TacticalDefenseCommand } from '../../types/proManagement';
import { Zap, ArrowRight, Play, FastForward, CheckCircle2 } from 'lucide-react';
import './InGameMatchModal.css';

interface InGameMatchModalProps {
  match: InGameMatchState;
  userTeamCode: string;
  onTacticalAction: (offense?: TacticalOffenseCommand, defense?: TacticalDefenseCommand) => void;
  onStepHalfInning: () => void;
  onFinishSimulate: () => void;
  onClose: () => void;
}

export const InGameMatchModal: React.FC<InGameMatchModalProps> = ({
  match,
  userTeamCode,
  onTacticalAction,
  onStepHalfInning,
  onFinishSimulate,
  onClose,
}) => {
  const isUserBatting = (match.isTop && match.awayTeamCode === userTeamCode) || (!match.isTop && match.homeTeamCode === userTeamCode);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [match.playLogs.length]);

  return (
    <div className="in-game-modal-backdrop">
      <div className="in-game-modal-container glass-panel animate-scale-up">
        {/* 상단 전광판 (스코어보드) */}
        <div className="scoreboard-panel">
          <div className="scoreboard-header">
            <span className="stadium-tag">🏟️ {match.homeTeamName} 홈구장</span>
            <span className="inning-indicator-badge">
              {match.isGameOver ? '🏁 경기 종료' : `${match.inning}회${match.isTop ? ' ▲ 초' : ' ▼ 말'}`}
            </span>
          </div>

          <table className="scoreboard-table">
            <thead>
              <tr>
                <th className="team-col">구단</th>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => <th key={i}>{i}</th>)}
                {match.inning > 9 && <th>{match.inning}</th>}
                <th className="sum-col">R</th>
                <th className="sum-col">H</th>
                <th className="sum-col">E</th>
              </tr>
            </thead>
            <tbody>
              <tr className={match.isTop && !match.isGameOver ? 'active-batting-row' : ''}>
                <td className="team-cell">
                  <strong>{match.awayTeamName}</strong>
                  {match.awayTeamCode === userTeamCode && <span className="my-team-pill">MY</span>}
                </td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((_, i) => (
                  <td key={i}>{match.inningScoresAway[i] !== undefined ? match.inningScoresAway[i] : (i === 0 ? 0 : '-')}</td>
                ))}
                {match.inning > 9 && <td>{match.inningScoresAway[match.inning - 1] ?? 0}</td>}
                <td className="score-cell bold-score">{match.awayScore}</td>
                <td>{match.awayHits}</td>
                <td>{match.awayErrors}</td>
              </tr>
              <tr className={!match.isTop && !match.isGameOver ? 'active-batting-row' : ''}>
                <td className="team-cell">
                  <strong>{match.homeTeamName}</strong>
                  {match.homeTeamCode === userTeamCode && <span className="my-team-pill">MY</span>}
                </td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((_, i) => (
                  <td key={i}>{match.inningScoresHome[i] !== undefined ? match.inningScoresHome[i] : (i === 0 ? 0 : '-')}</td>
                ))}
                {match.inning > 9 && <td>{match.inningScoresHome[match.inning - 1] ?? 0}</td>}
                <td className="score-cell bold-score">{match.homeScore}</td>
                <td>{match.homeHits}</td>
                <td>{match.homeErrors}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 중단: 다이아몬드 주자 상황 & 볼카운트 & 매치업 */}
        <div className="game-field-row">
          {/* 다이아몬드 야구장 & 주자 베이스 */}
          <div className="diamond-field-card glass-panel">
            <div className="diamond-wrapper">
              <div className="diamond-shape">
                {/* 2루 */}
                <div className={`base base-2b ${match.bases[1] ? 'occupied' : ''}`} title="2루">
                  <span>2B</span>
                </div>
                {/* 3루 */}
                <div className={`base base-3b ${match.bases[2] ? 'occupied' : ''}`} title="3루">
                  <span>3B</span>
                </div>
                {/* 1루 */}
                <div className={`base base-1b ${match.bases[0] ? 'occupied' : ''}`} title="1루">
                  <span>1B</span>
                </div>
                {/* 홈 */}
                <div className="base base-home">
                  <span>H</span>
                </div>
              </div>
            </div>

            {/* 볼카운트 표시판 */}
            <div className="count-board">
              <div className="count-row">
                <span className="count-label">B</span>
                <span className={`count-lamp ball ${match.balls >= 1 ? 'on' : ''}`}></span>
                <span className={`count-lamp ball ${match.balls >= 2 ? 'on' : ''}`}></span>
                <span className={`count-lamp ball ${match.balls >= 3 ? 'on' : ''}`}></span>
              </div>
              <div className="count-row">
                <span className="count-label">S</span>
                <span className={`count-lamp strike ${match.strikes >= 1 ? 'on' : ''}`}></span>
                <span className={`count-lamp strike ${match.strikes >= 2 ? 'on' : ''}`}></span>
              </div>
              <div className="count-row">
                <span className="count-label">O</span>
                <span className={`count-lamp out ${match.outs >= 1 ? 'on' : ''}`}></span>
                <span className={`count-lamp out ${match.outs >= 2 ? 'on' : ''}`}></span>
              </div>
            </div>
          </div>

          {/* 타자 vs 투수 매치업 카드 */}
          <div className="matchup-card glass-panel">
            <div className="matchup-header">
              <span className="matchup-title">⚡ 현재 승부 타석</span>
              <span className="team-role-tag">{isUserBatting ? '🟢 우리 팀 공격 중' : '🔵 우리 팀 수비 중'}</span>
            </div>

            <div className="matchup-details">
              <div className="player-matchup-box batter-box">
                <span className="role-sub">타자 (BATTER)</span>
                <h4>{match.currentBatter?.name}</h4>
                <div className="player-stat-pills">
                  <span>포지션: {match.currentBatter?.position}</span>
                  <span>타율: {(match.currentBatter?.proStats?.batting?.avg ?? 0.280).toFixed(3)}</span>
                  <span>홈런: {match.currentBatter?.proStats?.batting?.hr ?? 0}</span>
                </div>
              </div>

              <div className="vs-badge">VS</div>

              <div className="player-matchup-box pitcher-box">
                <span className="role-sub">투수 (PITCHER)</span>
                <h4>{match.currentPitcher?.name}</h4>
                <div className="player-stat-pills">
                  <span>역할: {match.currentPitcher?.pitcherRole}</span>
                  <span>구위: {match.currentPitcher?.stuff}</span>
                  <span>제구: {match.currentPitcher?.control}</span>
                </div>
              </div>
            </div>

            {/* 주자 상태 요약 */}
            <div className="runners-summary-row">
              <strong>주자 현황:</strong>
              {match.bases.some(b => b) ? (
                <span>
                  {match.bases[2] ? `3루(${match.runners[2] || '주자'}) ` : ''}
                  {match.bases[1] ? `2루(${match.runners[1] || '주자'}) ` : ''}
                  {match.bases[0] ? `1루(${match.runners[0] || '주자'})` : ''}
                </span>
              ) : (
                <span className="text-muted">주자 없음</span>
              )}
            </div>
          </div>
        </div>

        {/* 중계 텍스트 로그 (플레이-바이-플레이) */}
        <div className="live-broadcast-box glass-panel">
          <div className="broadcast-header">
            <h4>🎙️ 경기 실시간 문자 중계</h4>
          </div>
          <div className="broadcast-content">
            {match.playLogs.map((log) => (
              <div 
                key={log.id} 
                className={`broadcast-line ${log.scoreChange ? 'score-highlight' : ''}`}
              >
                <span className="log-inning-tag">{log.inningText}</span>
                <span className="log-text">{log.text}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* 하단: OOTP 전술 개입 컨트롤 바 */}
        <div className="tactical-action-bar glass-panel">
          {!match.isGameOver ? (
            <>
              <div className="tactical-commands-group">
                <span className="action-group-title">
                  {isUserBatting ? '📋 공격 작전 지휘 (GM/감독):' : '🛡️ 수비/투수 작전 지휘:'}
                </span>

                {isUserBatting ? (
                  <>
                    <button 
                      className="btn btn-primary btn-tactical" 
                      onClick={() => onTacticalAction('swing')}
                    >
                      <Zap size={16} /> 강공 타격
                    </button>
                    <button 
                      className="btn btn-secondary btn-tactical" 
                      onClick={() => onTacticalAction('bunt')}
                    >
                      🎯 희생 번트
                    </button>
                    <button 
                      className="btn btn-secondary btn-tactical" 
                      disabled={!match.bases[0] || match.bases[1]}
                      onClick={() => onTacticalAction('steal')}
                    >
                      🏃 2루 도루 시도
                    </button>
                    <button 
                      className="btn btn-secondary btn-tactical" 
                      onClick={() => onTacticalAction('hit_and_run')}
                    >
                      ⚡ 치고 달리기
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      className="btn btn-primary btn-tactical" 
                      onClick={() => onTacticalAction(undefined, 'pitch_strike')}
                    >
                      ⚡ 정면 승부
                    </button>
                    <button 
                      className="btn btn-secondary btn-tactical" 
                      onClick={() => onTacticalAction(undefined, 'pitch_waste')}
                    >
                      🎣 유인구 승부
                    </button>
                    <button 
                      className="btn btn-secondary btn-tactical" 
                      onClick={() => onTacticalAction(undefined, 'intentional_walk')}
                    >
                      🛑 고의사구
                    </button>
                    <button 
                      className="btn btn-secondary btn-tactical" 
                      onClick={() => onTacticalAction(undefined, 'infield_in')}
                    >
                      🛡️ 전진 수비
                    </button>
                  </>
                )}
              </div>

              <div className="sim-speed-controls">
                <button 
                  className="btn btn-outline" 
                  onClick={() => onTacticalAction()}
                  title="다음 타석 1개 진행"
                >
                  <Play size={14} /> 1타석 진행
                </button>
                <button 
                  className="btn btn-outline" 
                  onClick={onStepHalfInning}
                  title="현재 하프이닝 종료까지 진행"
                >
                  <ArrowRight size={14} /> 이닝 넘기기
                </button>
                <button 
                  className="btn btn-warning" 
                  onClick={onFinishSimulate}
                  title="경기 끝까지 고속 자동 시뮬레이션"
                >
                  <FastForward size={14} /> 경기 완료
                </button>
              </div>
            </>
          ) : (
            <div className="game-over-actions">
              <div className="game-over-msg">
                <CheckCircle2 size={24} className="text-success" />
                <span>
                  경기가 모두 종료되었습니다! (최종: {match.awayTeamName} {match.awayScore} : {match.homeScore} {match.homeTeamName})
                </span>
              </div>
              <button className="btn btn-primary btn-lg" onClick={onClose}>
                결과 확정 및 리그 복귀
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
