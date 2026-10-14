import type { Player } from '../types';
/** 내보내기는 파일을 내려받을 뿐 기존 저장본을 수정하지 않는다. */
export function createSaveExport(player: Player, gameVersion: string, exportedAt = new Date().toISOString()): string {
  return JSON.stringify({ format: 'DiamondGM-save', schemaVersion: 1, gameVersion, exportedAt, player }, null, 2);
}

/** JSON 텍스트를 검증하고 Player 객체를 복원한다. */
export function parseSaveExport(jsonString: string): Player {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('올바른 JSON 파일 형식이 아닙니다.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('저장 파일 데이터 구조가 올바르지 않습니다.');
  }
  const data = parsed as Record<string, unknown>;
  const rawPlayer = (data.format === 'DiamondGM-save' && data.player ? data.player : data) as Partial<Player>;
  if (!rawPlayer.name || typeof rawPlayer.name !== 'string' || !rawPlayer.highSchool || typeof rawPlayer.highSchool !== 'string') {
    throw new Error('선수 필수 정보(이름, 고등학교 등)가 올바르지 않거나 손상된 세이브 파일입니다.');
  }
  return rawPlayer as Player;
}
