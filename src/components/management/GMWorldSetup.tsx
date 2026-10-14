import { useState } from 'react';
import { useProLeagueStore } from '../../store/proLeagueStore';
import { careerWorldYear } from '../../data/gmWorld';
import './GMWorldSetup.css';

export function GMWorldSetup() {
  const { teams, careerCandidates, startWorld, isLoading } = useProLeagueStore();
  const [teamId,setTeamId] = useState(teams.find(t => t.code)?.id ?? 0);
  const [year,setYear] = useState(2026);
  const [link,setLink] = useState(false);
  const [careerId,setCareerId] = useState(careerCandidates[0]?.id ?? 0);
  const [error,setError] = useState('');
  const source = careerCandidates.find(p => p.id === careerId);
  const worldYear = link && source ? careerWorldYear(source) : year;
  return <section className="gm-world-setup glass-panel" aria-labelledby="gm-start-title">
    <small>GM 모드 · 1단계</small>
    <h1 id="gm-start-title">나의 구단 이야기를 시작하세요</h1>
    <p>선수 육성과 구단 운영은 별도로 저장됩니다. 육성 선수를 연결할지 직접 선택하세요.</p>
    <form onSubmit={async e => {
      e.preventDefault(); setError('');
      try { await startWorld(worldYear,teamId,link ? careerId : undefined); }
      catch (err) { setError(err instanceof Error ? err.message : '시작 설정을 저장하지 못했습니다. 다시 시도해주세요.'); }
    }}>
      <label>운영할 구단<select value={teamId} onChange={e => setTeamId(Number(e.target.value))} disabled={isLoading}>
        {teams.filter(t => t.code).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>
      <fieldset disabled={isLoading}>
        <legend>육성 모드와 연결</legend>
        <label className="gm-radio"><input type="radio" name="gm-link" checked={!link} onChange={() => setLink(false)} />독립적인 GM 세계로 시작</label>
        <label className="gm-radio"><input type="radio" name="gm-link" checked={link} disabled={!careerCandidates.length} onChange={() => setLink(true)} />졸업한 육성 선수를 드래프트 후보로 연결</label>
        {!careerCandidates.length && <p>졸업을 마친 선수가 없습니다. 독립적으로 시작할 수 있습니다.</p>}
      </fieldset>
      {link && <label>연결할 선수<select value={careerId} onChange={e => setCareerId(Number(e.target.value))} disabled={isLoading}>
        {careerCandidates.map(p => <option key={p.id} value={p.id}>{p.name} · {p.highSchool} · {careerWorldYear(p)}년</option>)}
      </select></label>}
      <label>세계 시작 연도<input type="number" min={2026} max={2060} value={worldYear} disabled={isLoading || link} onChange={e => setYear(Number(e.target.value))} required /></label>
      {link && <p>육성 세계의 연도에 맞추고 선수를 후보 명단에 복사합니다. 원본 커리어 기록과 결말은 유지되며, 구단 입단은 다음 드래프트 단계에서 결정합니다.</p>}
      {error && <p role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={isLoading || !teamId || (link && !source)}>{isLoading ? '시작 설정 저장 중…' : `${worldYear}년 GM 세계 시작`}</button>
    </form>
  </section>;
}
