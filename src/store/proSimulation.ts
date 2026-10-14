import type { Player, Team } from '../types';
import type { 
  InGameMatchState, 
  TacticalOffenseCommand, 
  TacticalDefenseCommand, 
  InGamePlayLog,
  ProBattingStats,
  ProPitchingStats
} from '../types/proManagement';

export interface BoxscoreRecord {
  matchId: string;
  dateStr: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  winningPitcher?: string;
  losingPitcher?: string;
  savePitcher?: string;
  mvp?: string;
  mvpDesc?: string;
}

export function initInGameMatch(
  matchId: string,
  dateStr: string,
  homeTeam: Team,
  awayTeam: Team,
  homePlayers: Player[],
  awayPlayers: Player[]
): InGameMatchState {
  const awayBatters = awayPlayers.filter(p => p.position !== 'P').slice(0, 9);
  const homePitcher = homePlayers.find(p => p.pitcherRole === 'Starter') || homePlayers.find(p => p.position === 'P') || homePlayers[0];
  const awayPitcher = awayPlayers.find(p => p.pitcherRole === 'Starter') || awayPlayers.find(p => p.position === 'P') || awayPlayers[0];

  const initialLog: InGamePlayLog = {
    id: 'log_0',
    inningText: '1회초',
    text: `⚾ ${awayTeam.name} vs ${homeTeam.name} 경기가 시작되었습니다. (선발 투수: ${homePitcher.name} vs ${awayPitcher.name})`,
  };

  return {
    matchId,
    dateStr,
    homeTeamName: homeTeam.name,
    awayTeamName: awayTeam.name,
    homeTeamCode: homeTeam.code ?? 'HOME',
    awayTeamCode: awayTeam.code ?? 'AWAY',
    inning: 1,
    isTop: true, // 1회초
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [false, false, false],
    runners: [null, null, null],
    homeScore: 0,
    awayScore: 0,
    homeHits: 0,
    awayHits: 0,
    homeErrors: 0,
    awayErrors: 0,
    inningScoresHome: [0],
    inningScoresAway: [0],
    currentBatter: awayBatters[0] || awayPlayers[0],
    currentPitcher: homePitcher,
    currentBatterIndex: { away: 0, home: 0 },
    playLogs: [initialLog],
    isGameOver: false,
  };
}

/** 1타석(At-Bat)을 시뮬레이션하고 상태를 전진시킨다 (전술 개입 포함) */
export function simulateAtBat(
  state: InGameMatchState,
  homePlayers: Player[],
  awayPlayers: Player[],
  offenseCmd?: TacticalOffenseCommand,
  defenseCmd?: TacticalDefenseCommand
): InGameMatchState {
  if (state.isGameOver) return state;

  const next = { ...state, bases: [...state.bases] as [boolean, boolean, boolean], runners: [...state.runners] as [string | null, string | null, string | null] };
  const inningLabel = `${next.inning}회${next.isTop ? '초' : '말'}`;
  
  const batter = next.currentBatter;
  const pitcher = next.currentPitcher;
  const hittingTeamName = next.isTop ? next.awayTeamName : next.homeTeamName;
  const pitchingTeamName = next.isTop ? next.homeTeamName : next.awayTeamName;

  // 1. 도루 시도 처리 (단독 액션)
  if (offenseCmd === 'steal') {
    if (next.bases[0] && !next.bases[1]) {
      const success = Math.random() < 0.65 + (batter.speed - 50) * 0.005;
      if (success) {
        next.bases[0] = false;
        next.bases[1] = true;
        next.runners[1] = next.runners[0];
        next.runners[0] = null;
        recordBattingStat(batter, { sb: 1 });
        appendLog(next, inningLabel, `⚡ [도루 성공!] 1루 주자 ${next.runners[1]} 선수가 기습적으로 2루를 훔쳐냅니다!`);
      } else {
        next.bases[0] = false;
        next.runners[0] = null;
        next.outs++;
        appendLog(next, inningLabel, `❌ [도루 실패!] 포수의 정확한 2루 송구로 주자가 태그아웃됩니다!`);
        if (checkOuts(next, homePlayers, awayPlayers)) return next;
      }
      return next;
    }
  }

  // 2. 고의사구 처리
  if (defenseCmd === 'intentional_walk') {
    recordBattingStat(batter, { pa: 1, bb: 1 });
    recordPitchingStat(pitcher, { bbAllowed: 1 });
    advanceRunners(next, batter.name, 1);
    appendLog(next, inningLabel, `🛑 [고의사구] ${pitchingTeamName} 벤치에서 ${batter.name} 선수를 거르고 다음 타자와의 승부를 지시합니다.`);
    advanceBatter(next, homePlayers, awayPlayers);
    return next;
  }

  // 3. 희생번트 시도
  if (offenseCmd === 'bunt' && (next.bases[0] || next.bases[1])) {
    const buntSuccess = Math.random() < 0.75 + (batter.defense - 50) * 0.003;
    recordBattingStat(batter, { pa: 1 });
    if (buntSuccess) {
      next.outs++;
      if (next.bases[1]) {
        next.bases[2] = true;
        next.runners[2] = next.runners[1];
        next.bases[1] = false;
        next.runners[1] = null;
      }
      if (next.bases[0]) {
        next.bases[1] = true;
        next.runners[1] = next.runners[0];
        next.bases[0] = false;
        next.runners[0] = null;
      }
      appendLog(next, inningLabel, `🎯 [희생번트 성공] ${batter.name} 선수의 완벽한 번트로 주자 진루에 성공합니다. (1아웃)`);
      if (checkOuts(next, homePlayers, awayPlayers)) return next;
      advanceBatter(next, homePlayers, awayPlayers);
      return next;
    } else {
      next.outs++;
      appendLog(next, inningLabel, `❌ [번트 실패] 번트 타구가 포수 정면으로 향해 선행 주자가 아웃됩니다.`);
      if (checkOuts(next, homePlayers, awayPlayers)) return next;
      advanceBatter(next, homePlayers, awayPlayers);
      return next;
    }
  }

  // 4. 일반 타격 시뮬레이션 (능력치 및 전술 보정)
  let hitRate = 0.250 + (batter.contact - pitcher.stuff) * 0.0025;
  let hrRate = 0.035 + (batter.power - pitcher.stuff) * 0.0015;
  let bbRate = 0.080 + (batter.eye - pitcher.control) * 0.0015;
  let soRate = 0.180 + (pitcher.stuff - batter.contact) * 0.0025;

  if (offenseCmd === 'swing') {
    hitRate += 0.02;
    hrRate += 0.01;
    soRate += 0.02;
  }
  if (defenseCmd === 'pitch_strike') {
    soRate += 0.03;
    bbRate -= 0.03;
    hitRate += 0.02;
  } else if (defenseCmd === 'pitch_waste') {
    soRate += 0.02;
    bbRate += 0.04;
    hitRate -= 0.03;
  } else if (defenseCmd === 'infield_in') {
    hitRate += 0.03; // 내야 전진수비 시 안타 확률 소폭 증가
  }

  hitRate = Math.max(0.12, Math.min(0.45, hitRate));
  hrRate = Math.max(0.005, Math.min(0.15, hrRate));
  bbRate = Math.max(0.02, Math.min(0.20, bbRate));
  soRate = Math.max(0.05, Math.min(0.40, soRate));

  const roll = Math.random();

  if (roll < bbRate) {
    // 볼넷 (Walk)
    recordBattingStat(batter, { pa: 1, bb: 1 });
    recordPitchingStat(pitcher, { bbAllowed: 1 });
    advanceRunners(next, batter.name, 1);
    appendLog(next, inningLabel, `⚾ [볼넷] ${batter.name} 선수가 침착하게 풀카운트에서 1루로 출루합니다.`);
  } else if (roll < bbRate + soRate) {
    // 삼진 (Strikeout)
    recordBattingStat(batter, { pa: 1, ab: 1, so: 1 });
    recordPitchingStat(pitcher, { so: 1 });
    next.outs++;
    appendLog(next, inningLabel, `🔥 [삼진 아웃] ${pitcher.name} 투수의 날카로운 결정구에 ${batter.name} 선수 헛스윙 삼진! (${next.outs}아웃)`);
  } else if (roll < bbRate + soRate + hitRate) {
    // 안타 또는 장타
    const hitRoll = Math.random();
    if (hitRoll < hrRate / hitRate) {
      // 홈런 (Home Run)
      let runsScored = 1;
      next.bases.forEach((occupied) => { if (occupied) runsScored++; });
      addRuns(next, runsScored);
      recordBattingStat(batter, { pa: 1, ab: 1, hits: 1, hr: 1, rbi: runsScored, runs: 1 });
      recordPitchingStat(pitcher, { hitsAllowed: 1, hrAllowed: 1, runsAllowed: runsScored, earnedRuns: runsScored });
      clearBases(next);
      appendLog(next, inningLabel, `💥 [홈런!!] ${batter.name}의 통렬한 타격! 담장을 훌쩍 넘어가는 ${runsScored}점 홈런!! (${hittingTeamName} ${next.isTop ? next.awayScore : next.homeScore}점)`, true);
    } else if (hitRoll < 0.28) {
      // 2루타 (Double)
      const rbi = advanceRunners(next, batter.name, 2);
      recordBattingStat(batter, { pa: 1, ab: 1, hits: 1, doubles: 1, rbi });
      recordPitchingStat(pitcher, { hitsAllowed: 1, runsAllowed: rbi, earnedRuns: rbi });
      appendLog(next, inningLabel, `🚀 [2루타] ${batter.name} 좌우중간을 완전히 가르는 2루타!${rbi > 0 ? ` (${rbi}타점 적시타!)` : ''}`, rbi > 0);
    } else if (hitRoll < 0.32) {
      // 3루타 (Triple)
      const rbi = advanceRunners(next, batter.name, 3);
      recordBattingStat(batter, { pa: 1, ab: 1, hits: 1, triples: 1, rbi });
      recordPitchingStat(pitcher, { hitsAllowed: 1, runsAllowed: rbi, earnedRuns: rbi });
      appendLog(next, inningLabel, `⚡ [3루타] ${batter.name} 우익선상 깊숙한 코스! 3루까지 전력질주! (${rbi}타점)`, rbi > 0);
    } else {
      // 1루타 (Single)
      const rbi = advanceRunners(next, batter.name, 1);
      recordBattingStat(batter, { pa: 1, ab: 1, hits: 1, rbi });
      recordPitchingStat(pitcher, { hitsAllowed: 1, runsAllowed: rbi, earnedRuns: rbi });
      appendLog(next, inningLabel, `✨ [안타] ${batter.name} 깔끔한 중전 안타로 출루합니다!${rbi > 0 ? ` (${rbi}타점 적시타!)` : ''}`, rbi > 0);
    }
  } else {
    // 범타 (Groundout / Flyout / Double Play)
    recordBattingStat(batter, { pa: 1, ab: 1 });
    if (next.outs < 2 && next.bases[0] && Math.random() < 0.25) {
      // 병살타 (Double Play)
      next.outs += 2;
      next.bases[0] = false;
      next.runners[0] = null;
      appendLog(next, inningLabel, `❌ [병살타!] 6-4-3으로 이어지는 완벽한 병살 플레이! 순식간에 2아웃이 올라갑니다! (${next.outs}아웃)`);
    } else {
      next.outs++;
      const isFly = Math.random() < 0.5;
      appendLog(next, inningLabel, `⚾ [${isFly ? '뜬공' : '땅볼'}] ${batter.name} 선수의 타구가 야수 정면으로 향해 아웃됩니다. (${next.outs}아웃)`);
    }
  }

  if (checkOuts(next, homePlayers, awayPlayers)) return next;
  advanceBatter(next, homePlayers, awayPlayers);
  return next;
}

function advanceRunners(state: InGameMatchState, batterName: string, hitBases: number): number {
  let runs = 0;
  const oldRunners = [...state.runners];
  const oldBases = [...state.bases];
  clearBases(state);

  for (let b = 2; b >= 0; b--) {
    if (oldBases[b]) {
      const targetBase = b + hitBases;
      if (targetBase >= 3) {
        runs++;
      } else {
        state.bases[targetBase] = true;
        state.runners[targetBase] = oldRunners[b];
      }
    }
  }

  if (hitBases >= 4) {
    runs++;
  } else if (hitBases > 0) {
    state.bases[hitBases - 1] = true;
    state.runners[hitBases - 1] = batterName;
  }

  if (runs > 0) {
    addRuns(state, runs);
  }
  return runs;
}

function addRuns(state: InGameMatchState, runs: number) {
  if (state.isTop) {
    state.awayScore += runs;
    state.awayHits += 1;
    const idx = state.inning - 1;
    state.inningScoresAway[idx] = (state.inningScoresAway[idx] ?? 0) + runs;
  } else {
    state.homeScore += runs;
    state.homeHits += 1;
    const idx = state.inning - 1;
    state.inningScoresHome[idx] = (state.inningScoresHome[idx] ?? 0) + runs;
  }
}

function clearBases(state: InGameMatchState) {
  state.bases = [false, false, false];
  state.runners = [null, null, null];
}

function checkOuts(state: InGameMatchState, homePlayers: Player[], awayPlayers: Player[]): boolean {
  if (state.outs < 3) return false;

  // 이닝 교대 (3아웃)
  clearBases(state);
  state.outs = 0;
  state.balls = 0;
  state.strikes = 0;

  // 9회말 끝내기 또는 게임 종료 조건
  if (state.inning >= 9) {
    if (state.isTop && state.homeScore > state.awayScore) {
      endGame(state);
      return true;
    }
    if (!state.isTop && state.homeScore !== state.awayScore) {
      endGame(state);
      return true;
    }
    if (state.inning >= 12 && !state.isTop) {
      endGame(state);
      return true;
    }
  }

  if (state.isTop) {
    // 말 공격으로 전환
    state.isTop = false;
    state.currentPitcher = awayPlayers.find(p => p.position === 'P') || awayPlayers[0];
    const batters = homePlayers.filter(p => p.position !== 'P');
    state.currentBatter = batters[state.currentBatterIndex.home % batters.length] || homePlayers[0];
    state.inningScoresHome.push(0);
    appendLog(state, `${state.inning}회말`, `🔔 공수 교대. ${state.homeTeamName}의 ${state.inning}회말 공격이 시작됩니다.`);
  } else {
    // 다음 이닝 초로 전환
    state.inning++;
    state.isTop = true;
    state.currentPitcher = homePlayers.find(p => p.position === 'P') || homePlayers[0];
    const batters = awayPlayers.filter(p => p.position !== 'P');
    state.currentBatter = batters[state.currentBatterIndex.away % batters.length] || awayPlayers[0];
    state.inningScoresAway.push(0);
    appendLog(state, `${state.inning}회초`, `🔔 공수 교대. ${state.awayTeamName}의 ${state.inning}회초 공격이 시작됩니다.`);
  }

  return false;
}

function advanceBatter(state: InGameMatchState, homePlayers: Player[], awayPlayers: Player[]) {
  if (state.isTop) {
    state.currentBatterIndex.away++;
    const batters = awayPlayers.filter(p => p.position !== 'P');
    state.currentBatter = batters[state.currentBatterIndex.away % batters.length] || awayPlayers[0];
  } else {
    state.currentBatterIndex.home++;
    const batters = homePlayers.filter(p => p.position !== 'P');
    state.currentBatter = batters[state.currentBatterIndex.home % batters.length] || homePlayers[0];
  }
}

function endGame(state: InGameMatchState) {
  state.isGameOver = true;
  state.winnerTeamCode = state.homeScore > state.awayScore ? state.homeTeamCode : state.awayScore > state.homeScore ? state.awayTeamCode : undefined;
  const resultText = state.homeScore === state.awayScore 
    ? '무승부로 경기가 종료되었습니다.' 
    : `${state.homeScore > state.awayScore ? state.homeTeamName : state.awayTeamName}의 승리로 경기가 종료되었습니다!`;
  appendLog(state, '경기 종료', `🏁 [경기 종료] 최종 스코어: ${state.awayTeamName} ${state.awayScore} : ${state.homeScore} ${state.homeTeamName}. ${resultText}`, true);
}

function appendLog(state: InGameMatchState, inningText: string, text: string, scoreChange = false) {
  state.playLogs.push({
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    inningText,
    text,
    scoreChange,
  });
  if (state.playLogs.length > 50) {
    state.playLogs.splice(0, state.playLogs.length - 50);
  }
}

function recordBattingStat(player: Player, stat: Partial<ProBattingStats>) {
  if (!player.proStats) player.proStats = {};
  if (!player.proStats.batting) {
    player.proStats.batting = {
      games: 1, pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, runs: 0, bb: 0, so: 0, sb: 0, avg: 0, obp: 0, slg: 0, ops: 0
    };
  }
  const b = player.proStats.batting;
  if (stat.pa) b.pa += stat.pa;
  if (stat.ab) b.ab += stat.ab;
  if (stat.hits) b.hits += stat.hits;
  if (stat.doubles) b.doubles += stat.doubles;
  if (stat.triples) b.triples += stat.triples;
  if (stat.hr) b.hr += stat.hr;
  if (stat.rbi) b.rbi += stat.rbi;
  if (stat.runs) b.runs += stat.runs;
  if (stat.bb) b.bb += stat.bb;
  if (stat.so) b.so += stat.so;
  if (stat.sb) b.sb += stat.sb;
  b.avg = b.ab > 0 ? Number((b.hits / b.ab).toFixed(3)) : 0;
  b.obp = b.pa > 0 ? Number(((b.hits + b.bb) / b.pa).toFixed(3)) : 0;
  const tb = b.hits + b.doubles + b.triples * 2 + b.hr * 3;
  b.slg = b.ab > 0 ? Number((tb / b.ab).toFixed(3)) : 0;
  b.ops = Number((b.obp + b.slg).toFixed(3));
}

function recordPitchingStat(player: Player, stat: Partial<ProPitchingStats>) {
  if (!player.proStats) player.proStats = {};
  if (!player.proStats.pitching) {
    player.proStats.pitching = {
      games: 1, starts: 0, wins: 0, losses: 0, saves: 0, holds: 0, innings: 0, hitsAllowed: 0, hrAllowed: 0, bbAllowed: 0, so: 0, runsAllowed: 0, earnedRuns: 0, era: 0, whip: 0
    };
  }
  const p = player.proStats.pitching;
  if (stat.innings) p.innings += stat.innings;
  if (stat.hitsAllowed) p.hitsAllowed += stat.hitsAllowed;
  if (stat.hrAllowed) p.hrAllowed += stat.hrAllowed;
  if (stat.bbAllowed) p.bbAllowed += stat.bbAllowed;
  if (stat.so) p.so += stat.so;
  if (stat.runsAllowed) p.runsAllowed += stat.runsAllowed;
  if (stat.earnedRuns) p.earnedRuns += stat.earnedRuns;
  p.era = p.innings > 0 ? Number(((p.earnedRuns * 9) / p.innings).toFixed(2)) : 0;
  p.whip = p.innings > 0 ? Number(((p.bbAllowed + p.hitsAllowed) / p.innings).toFixed(2)) : 0;
}

/** 경기 전체를 즉시 자동 시뮬레이션하여 박스스코어와 결과 반환 */
export function quickSimulateMatch(
  matchId: string,
  dateStr: string,
  homeTeam: Team,
  awayTeam: Team,
  homePlayers: Player[],
  awayPlayers: Player[]
): BoxscoreRecord {
  const homeSkill = homeTeam.reputation ?? 80;
  const awaySkill = awayTeam.reputation ?? 80;

  // 9이닝 득점 시뮬레이션
  const homeStarter = homePlayers.find(p => p.pitcherRole === 'Starter') || homePlayers.find(p => p.position === 'P');
  const awayStarter = awayPlayers.find(p => p.pitcherRole === 'Starter') || awayPlayers.find(p => p.position === 'P');

  const homeExpRuns = Math.max(1, 4.2 + (homeSkill - awaySkill) * 0.05);
  const awayExpRuns = Math.max(1, 4.0 + (awaySkill - homeSkill) * 0.05);

  let homeScore = Math.floor(Math.random() * homeExpRuns * 1.6);
  let awayScore = Math.floor(Math.random() * awayExpRuns * 1.6);

  if (homeScore === awayScore) {
    if (Math.random() < 0.6) {
      if (Math.random() < 0.53) homeScore++; else awayScore++;
    } // 일부 무승부 허용 (KBO 규칙)
  }

  const homeHits = homeScore + Math.floor(Math.random() * 6);
  const awayHits = awayScore + Math.floor(Math.random() * 6);
  const homeErrors = Math.random() < 0.4 ? 1 : 0;
  const awayErrors = Math.random() < 0.4 ? 1 : 0;

  // 팀 전적 갱신
  if (homeScore > awayScore) {
    homeTeam.wins = (homeTeam.wins ?? 0) + 1;
    awayTeam.losses = (awayTeam.losses ?? 0) + 1;
  } else if (awayScore > homeScore) {
    awayTeam.wins = (awayTeam.wins ?? 0) + 1;
    homeTeam.losses = (homeTeam.losses ?? 0) + 1;
  } else {
    homeTeam.draws = (homeTeam.draws ?? 0) + 1;
    awayTeam.draws = (awayTeam.draws ?? 0) + 1;
  }
  homeTeam.runsScored = (homeTeam.runsScored ?? 0) + homeScore;
  homeTeam.runsAllowed = (homeTeam.runsAllowed ?? 0) + awayScore;
  awayTeam.runsScored = (awayTeam.runsScored ?? 0) + awayScore;
  awayTeam.runsAllowed = (awayTeam.runsAllowed ?? 0) + homeScore;

  // 선수 개인 스탯 누적 (안타, 타점, 투구)
  distributeTeamStats(homePlayers, homeScore, homeHits, homeScore > awayScore);
  distributeTeamStats(awayPlayers, awayScore, awayHits, awayScore > homeScore);

  const winningPitcher = homeScore > awayScore ? homeStarter?.name : awayScore > homeScore ? awayStarter?.name : undefined;
  const losingPitcher = homeScore > awayScore ? awayStarter?.name : awayScore > homeScore ? homeStarter?.name : undefined;

  // MVP 선정
  const winningPlayers = homeScore >= awayScore ? homePlayers : awayPlayers;
  const batters = winningPlayers.filter(p => p.position !== 'P');
  const mvpPlayer = batters[Math.floor(Math.random() * Math.min(5, batters.length))] || winningPlayers[0];

  return {
    matchId,
    dateStr,
    homeTeamName: homeTeam.name,
    awayTeamName: awayTeam.name,
    homeScore,
    awayScore,
    homeHits,
    awayHits,
    homeErrors,
    awayErrors,
    winningPitcher,
    losingPitcher,
    savePitcher: (homeScore > awayScore && homeScore - awayScore <= 3) ? homePlayers.find(p => p.pitcherRole === 'Closer')?.name : undefined,
    mvp: mvpPlayer?.name,
    mvpDesc: `${mvpPlayer?.name} 4타수 2안타 1홈런 ${Math.max(1, Math.floor(Math.abs(homeScore - awayScore)))}타점 맹타`,
  };
}

function distributeTeamStats(players: Player[], teamRuns: number, teamHits: number, won: boolean) {
  const batters = players.filter(p => p.position !== 'P');
  const pitchers = players.filter(p => p.position === 'P');

  let remainingHits = teamHits;
  let remainingRuns = teamRuns;

  batters.forEach((b) => {
    const hits = remainingHits > 0 && Math.random() < 0.35 ? 1 : 0;
    const hr = hits > 0 && Math.random() < 0.15 ? 1 : 0;
    const rbi = hr > 0 ? 1 : (remainingRuns > 0 && Math.random() < 0.25 ? 1 : 0);
    remainingHits -= hits;
    remainingRuns -= rbi;
    recordBattingStat(b, {
      games: 1,
      pa: 4,
      ab: 4,
      hits,
      hr,
      rbi,
      runs: hr,
      so: Math.random() < 0.2 ? 1 : 0,
      bb: Math.random() < 0.1 ? 1 : 0,
    });
  });

  const starter = pitchers.find(p => p.pitcherRole === 'Starter') || pitchers[0];
  if (starter) {
    recordPitchingStat(starter, {
      games: 1,
      starts: 1,
      wins: won ? 1 : 0,
      losses: won ? 0 : 1,
      innings: 6,
      so: 5 + Math.floor(Math.random() * 4),
      earnedRuns: Math.max(0, Math.floor(Math.random() * 4)),
      hitsAllowed: 4 + Math.floor(Math.random() * 3),
      bbAllowed: Math.floor(Math.random() * 3),
    });
  }
}
