import { GAME_VERSION } from '../../../version';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player } from '../../../types';
import { Settings, Database, RotateCcw, Upload, Download } from 'lucide-react';
import { db } from '../../../db';
import { createSaveExport, parseSaveExport } from '../../../data/saveExport';
import { useGameClockStore } from '../../../store/gameClockStore';
interface SettingsViewProps { player: Player; onClose: () => void }
export function SettingsView({ player }: SettingsViewProps) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoading = useGameClockStore(s => s.isLoading);
  const exportSave = () => {
    setError(''); setSuccess('');
    try {
      const url = URL.createObjectURL(new Blob([createSaveExport(player, GAME_VERSION)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `DiamondGM-${player.id ?? 'player'}-${player.gameDate?.year ?? 2026}-${player.gameDate?.month ?? 3}-${player.gameDate?.day ?? 2}.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess('진행 기록을 성공적으로 다운로드했습니다.');
    } catch { setError('진행 기록 파일을 만들지 못했습니다. 다시 시도해주세요.'); }
  };
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setSuccess('');
    useGameClockStore.setState({ isLoading: true });
    try {
      const text = await file.text();
      const imported = parseSaveExport(text);
      if (!confirm(`'${imported.name}' (${imported.highSchool}) 선수의 저장 데이터를 복원하시겠습니까? 현재 선수의 데이터가 대체됩니다.`)) {
        return;
      }
      imported.id = player.id ?? 1;
      await db.players.put(imported);
      await useGameClockStore.getState().initClock(imported);
      setSuccess(`'${imported.name}' 선수의 저장 데이터를 성공적으로 복원했습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '세이브 파일을 불러오지 못했습니다.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      useGameClockStore.setState({ isLoading: false });
    }
  };
  const reset = async () => {
    if (useGameClockStore.getState().isLoading || !confirm('현재 선수를 삭제하고 새 선수를 만드시겠습니까? 진행 기록이 사라집니다.')) return;
    setError(''); useGameClockStore.setState({ isLoading: true });
    try { if (player.id !== undefined) await db.players.delete(player.id); navigate('/development/create'); }
    catch { setError('선수를 삭제하지 못했습니다. 저장본을 유지합니다. 다시 시도해주세요.'); }
    finally { useGameClockStore.setState({ isLoading: false }); }
  };
  return <div className="menu-view-container glass-panel animate-scale-up">
    <div className="menu-view-header"><div className="menu-view-title-group"><Settings size={22} /><div><h3 className="menu-view-title">환경설정 & 데이터 관리</h3><p className="menu-view-sub">Diamond Legacy {GAME_VERSION} · 현재 선수의 진행 기록</p></div></div></div>
    <div className="menu-view-body"><div className="settings-sections-stack">
      <section className="settings-section glass-panel"><h4 className="setting-sec-title"><Database size={16} /> 저장과 진행 기록</h4>
        <div className="setting-row"><div className="setting-label-group"><strong>브라우저 자동 저장</strong><span>활동·경기·목표·인연 변경이 저장되면 다음 진행에 반영됩니다.</span></div><span className="save-status-badge">{isLoading ? '저장 중…' : '자동 저장 사용'}</span></div>
        <div className="setting-row"><div className="setting-label-group"><strong>진행 기록 내보내기</strong><span>현재 선수의 전체 저장본을 JSON으로 내려받습니다. 백업에 사용할 수 있습니다.</span></div><button className="btn btn-secondary" disabled={isLoading} onClick={exportSave}><Download size={14} /> JSON 내려받기</button></div>
        <div className="setting-row"><div className="setting-label-group"><strong>진행 기록 가져오기</strong><span>백업해둔 JSON 저장 파일을 불러와 현재 선수의 데이터로 복원합니다.</span></div>
          <button className="btn btn-secondary" disabled={isLoading} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> JSON 불러오기</button>
          <input type="file" ref={fileInputRef} accept=".json" style={{ display: 'none' }} onChange={(e) => void handleFileSelect(e)} />
        </div>
        <div className="setting-row danger-zone"><div className="setting-label-group"><strong>선수 데이터 초기화</strong><span>현재 선수를 삭제하고 새 선수 생성으로 이동합니다.</span></div><button className="btn btn-sm btn-danger" disabled={isLoading} onClick={() => void reset()}><RotateCcw size={14} /> 데이터 초기화</button></div>
        {success && <p className="text-success" style={{ color: '#34d399', marginTop: 8 }}>✓ {success}</p>}
        {error && <p role="alert" style={{ color: '#f87171', marginTop: 8 }}>⚠ {error}</p>}
      </section>
      <section className="settings-section glass-panel"><h4 className="setting-sec-title">시뮬레이션 안내</h4><p>고교 리그 및 전국대회 경기와 프로 구단 경기는 날짜 진행 시 자동 시뮬레이션되며, 순위표와 개인 세부 스탯에 누적됩니다. GM 모드에서는 OOTP 스타일 실시간 작전 개입(번트, 도루, 투수교체 등)을 지원합니다.</p></section>
    </div></div>
  </div>;
}
