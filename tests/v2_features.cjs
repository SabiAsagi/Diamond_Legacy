const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamond-v2-tests-'));
function compile(folder) {
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, item.name);
    if (item.isDirectory()) compile(file);
    else if (file.endsWith('.json')) {
      const target = path.join(dir, path.relative(path.resolve('src'), file));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const target = path.join(dir, path.relative(path.resolve('src'), file).replace(/\.tsx?$/, '.js'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        ts.transpileModule(fs.readFileSync(file, 'utf8'), {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText
      );
    }
  }
}
compile(path.resolve('src'));
fs.symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

const { EQUIPMENT_CATALOG, getEffectiveStat, getRelevantSlots, getRelevantGloveCategory, isEquipmentRelevant, SHOP_TIERS, EQUIPMENT_STAT_LABELS } = require(path.join(dir, 'types/equipment.js'));
const { normalizePlayer, overallRating } = require(path.join(dir, 'data/playerDevelopment.js'));
const { buildBondProfiles, scoreToStage, getTrainingEfficiencyMultiplier } = require(path.join(dir, 'types/relationship.js'));
const { getOutdoorLocations } = require(path.join(dir, 'types/outdoorMap.js'));
const { INITIAL_RELATIONSHIPS } = require(path.join(dir, 'types/bondScores.js'));
const { POSITION_LABELS } = require(path.join(dir, 'types/index.js'));

test('주요 포지션 이름을 한글로 표시한다', () => {
  assert.equal(POSITION_LABELS.P, '투수');
  assert.equal(POSITION_LABELS.TwoWay, '투타겸업');
  assert.equal(POSITION_LABELS.C, '포수');
  assert.equal(POSITION_LABELS.SS, '유격수');
});

test('장비 8개 슬롯이 존재하고 장착 보너스가 능력치와 종합에 반영된다', () => {
  const slots = new Set(EQUIPMENT_CATALOG.map(e => e.slot));
  assert.ok(slots.has('bat'));
  assert.ok(slots.has('glove'));
  assert.ok(slots.has('catcherGear'));
  assert.ok(slots.has('spikes'));
  assert.ok(slots.has('trainingGear'));
  assert.ok(slots.has('protectiveGear'));
  assert.ok(slots.has('accessory'));
  assert.ok(slots.has('baseRunningGloves'));
  assert.equal(slots.size, 8);

  // Base player with power 20
  const basePlayer = normalizePlayer({
    name: '테스트',
    gender: 'male',
    age: 16,
    position: '1B',
    status: 'HighSchool',
    uniformNumber: 10,
    highSchool: '덕수고',
    handedness: 'R/R',
    pitchingForm: 'None',
    pitcherRole: 'None',
    battingForm: 'Straight',
    overall: 20,
    potential: 80,
    contact: 20,
    power: 20,
    eye: 20,
    speed: 20,
    defense: 20,
    stuff: 20,
    control: 20,
    stamina: 20,
    condition: 100,
    academics: 50,
    relationships: { ...INITIAL_RELATIONSHIPS },
    equippedItems: {},
  });

  const baseOvr = overallRating(basePlayer);
  assert.equal(getEffectiveStat(basePlayer, 'power'), 20);

  // Find a high-tier bat with power bonus
  const proBat = EQUIPMENT_CATALOG.find(e => e.slot === 'bat' && e.tier === '프로' && (e.bonuses.power || 0) > 0);
  assert.ok(proBat);

  const equippedPlayer = {
    ...basePlayer,
    equippedItems: { bat: proBat.id },
  };

  const effectivePower = getEffectiveStat(equippedPlayer, 'power');
  assert.equal(effectivePower, 20 + proBat.bonuses.power);
  assert.ok(overallRating(equippedPlayer) > baseOvr);
});

test('상점 등급·장비 한글명·포지션별 슬롯과 글러브 제한을 유지한다', () => {
  assert.deepEqual(SHOP_TIERS.map(s => s.id), ['basic', 'premium']);
  assert.equal(EQUIPMENT_STAT_LABELS.contact, '컨택');
  assert.equal(EQUIPMENT_STAT_LABELS.control, '제구');
  assert.ok(getRelevantSlots('P').includes('glove'));
  assert.ok(!getRelevantSlots('P').includes('bat'));
  assert.ok(getRelevantSlots('C').includes('catcherGear'));
  assert.ok(getRelevantSlots('SS').includes('baseRunningGloves'));
  assert.equal(getRelevantGloveCategory('1B'), 'firstBase');
  assert.equal(getRelevantGloveCategory('CF'), 'outfield');
  const pitcherGlove = EQUIPMENT_CATALOG.find(e => e.slot === 'glove' && e.gloveCategory === 'pitcher');
  assert.ok(pitcherGlove);
  assert.ok(isEquipmentRelevant({ position: 'P' }, pitcherGlove));
  assert.ok(!isEquipmentRelevant({ position: 'SS' }, pitcherGlove));
});

test('개별 감독·동기 인연 단계에 따라 훈련 배율이 합산된다', () => {
  const multiplier = (coach, peer, other = 10) => getTrainingEfficiencyMultiplier({
    relationships: { ...INITIAL_RELATIONSHIPS, coach, peer, senior: other, coach2: other },
  });
  assert.equal(multiplier(10, 10), 1);
  assert.equal(multiplier(34, 89), 1);
  assert.equal(multiplier(35, 89), 1.03);
  assert.equal(multiplier(89, 89), 1.03);
  assert.equal(multiplier(90, 10), 1.08);
  assert.equal(multiplier(10, 90), 1.10);
  assert.equal(multiplier(90, 90), 1.18);
  assert.equal(multiplier(10, 10, 100), 1, '선배·기술 코치 점수는 감독·동기 배율에 섞이지 않는다');
});

test('초기 인연은 1단계이고 네 로맨스 대상은 선수 성별과 무관하다', () => {
  const expectedRomance = ['childhood', 'deskmate', 'peer', 'senior'];
  for (const gender of ['male', 'female']) {
    const bonds = buildBondProfiles({ gender, grade: 1, relationships: { ...INITIAL_RELATIONSHIPS } });
    for (const bond of bonds) {
      assert.equal(bond.score, INITIAL_RELATIONSHIPS[bond.id], `${gender}: ${bond.id} 개별 초기 점수`);
      assert.equal(scoreToStage(bond.score), 1, `${gender}: ${bond.id} 초기 단계`);
      assert.equal(bond.stageLabels.length, 5);
    }
    assert.deepEqual(bonds.filter(b => b.romanceable).map(b => b.id).sort(), expectedRomance);
    assert.ok(!bonds.some(b => b.id === 'junior'), '1학년에게는 후배가 노출되지 않는다');
    const laterBonds = buildBondProfiles({ gender, grade: 2, relationships: { ...INITIAL_RELATIONSHIPS } });
    assert.equal(laterBonds.length, 14);
    assert.ok(laterBonds.some(b => b.id === 'junior'));
  }
});

test('지역별 외출 명소와 미등록 지역 대체 장소를 제공한다', () => {
  const seoulLocs = getOutdoorLocations('서울');
  assert.ok(seoulLocs.length >= 7);
  assert.ok(seoulLocs.some(l => l.id === 'jamsil'));
  assert.ok(seoulLocs.some(l => l.id === 'goods'));

  const gyeonggiIncheon = getOutdoorLocations('경기/인천');
  assert.ok(gyeonggiIncheon.length >= 6);

  const fallback = getOutdoorLocations('가상지역');
  assert.ok(fallback.length >= 5);
  assert.ok(fallback.some(l => l.id === 'goods'));
});

process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

const { generateCast, getBondName, personalizeText, DEFAULT_CAST, CAST_IDS } = require(path.join(dir, 'data/cast.js'));
const { formatBondChanges, BOND_NAMES } = require(path.join(dir, 'types/bondScores.js'));
const { HIGH_SCHOOLS_DATA } = require(path.join(dir, 'data/highSchools.js'));
const { SUB_ACTIVITY_POOL } = require(path.join(dir, 'types/activity.js'));
const { CUTSCENE_EVENTS_POOL } = require(path.join(dir, 'data/cutsceneEvents.js'));
const REGIONS = [...new Set(HIGH_SCHOOLS_DATA.map(s => s.region))];

function seeded(seed) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
const castPlayer = { name: '김선수', gender: 'male', appearance: { hairStyleId: 'male_spiky' }, highSchool: HIGH_SCHOOLS_DATA[0].name };

test('회차별 인물: 이름·성별·외모가 무작위로 정해지고 서로·선수와 겹치지 않는다', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const cast = generateCast(castPlayer, HIGH_SCHOOLS_DATA, seeded(seed));
    assert.deepEqual(Object.keys(cast).sort(), [...CAST_IDS].sort());
    const names = CAST_IDS.map(id => cast[id].name);
    assert.equal(new Set(names).size, 8, `이름 중복 (seed ${seed})`);
    assert.equal(new Set(names.map(n => n.slice(1))).size, 8, `성을 뺀 이름 중복 (seed ${seed})`);
    assert.ok(!names.includes(castPlayer.name), '선수 이름과 중복');
    const team = ['senior', 'peer', 'rival', 'junior'].map(id => cast[id]);
    assert.ok(team.every(member => member.portrait.kind === 'image'));
    assert.equal(new Set(team.map(m => m.portrait.src)).size, 4, '야구부 인물 얼굴 중복');
    assert.equal(cast.senior.portrait.schoolName, castPlayer.highSchool);
    assert.notEqual(cast.rival.portrait.schoolName, castPlayer.highSchool, '라이벌은 다른 학교 유니폼');
    assert.equal(HIGH_SCHOOLS_DATA.find(s => s.name === cast.rival.portrait.schoolName)?.region, HIGH_SCHOOLS_DATA[0].region, '라이벌은 같은 시·도 학교·팀 소속');
    const friends = ['childhood', 'neighbor', 'deskmate', 'classLeader'].map(id => cast[id]);
    assert.ok(friends.every(m => m.portrait.kind === 'imagePair'));
    assert.equal(new Set(friends.map(m => m.portrait.schoolSrc)).size, 4, '친구 교복 일러스트 중복');
    assert.ok(friends.every(m => m.portrait.schoolSrc !== m.portrait.casualSrc), '교복·사복 파일이 같음');
  }
  const casts = Array.from({ length: 40 }, (_, index) => generateCast(castPlayer, HIGH_SCHOOLS_DATA, seeded(index + 1)));
  assert.ok(new Set(casts.map(c => c.peer.name)).size > 1, '회차마다 같은 동기 이름');
  assert.ok(new Set(casts.map(c => c.peer.gender + c.senior.gender + c.rival.gender + c.junior.gender)).size > 1, '회차마다 같은 성별 구성');
  assert.ok(new Set(casts.map(c => c.childhood.portrait.schoolSrc)).size > 1, '회차마다 같은 소꿉친구 외모');
});

test('회차별 인물: 이전 저장본은 기존 인물을 유지하고, 새 회차는 이번 이름으로 표시된다', () => {
  const legacy = normalizePlayer({ id: 1, name: '예전선수', gender: 'male', position: 'P', relationships: { ...INITIAL_RELATIONSHIPS } });
  assert.equal(legacy.cast, undefined);
  assert.equal(getBondName(legacy, 'peer'), '이도현');
  assert.equal(getBondName(legacy, 'coach'), '야구부 감독');
  assert.ok(buildBondProfiles(legacy).some(p => p.name === '입학 동기 이도현'));
  assert.equal(DEFAULT_CAST.childhood.gender, 'female');

  const cast = generateCast(castPlayer, HIGH_SCHOOLS_DATA, seeded(7));
  const current = normalizePlayer({ ...legacy, cast });
  assert.ok(buildBondProfiles(current).some(p => p.name === `입학 동기 ${cast.peer.name}`));
  const rivalProfile = buildBondProfiles(current).find(p => p.id === 'rival');
  assert.equal(rivalProfile.name, `지역 라이벌 ${cast.rival.name}`);
  assert.equal(rivalProfile.role, `라이벌 · ${cast.rival.portrait.schoolName}`, '라이벌 소속 표시');
  assert.equal(buildBondProfiles(legacy).find(p => p.id === 'rival').role, '라이벌');
  assert.equal(formatBondChanges({ peer: 3, coach: 2 }), '{peer} 인연 +3 · 야구부 감독 인연 +2');
  assert.equal(personalizeText(formatBondChanges({ peer: 3 }), current), `${cast.peer.name} 인연 +3`);
});

test('회차별 인물: 이름 뒤 조사는 받침에 맞춰 고른다', () => {
  const withName = (peer, rival) => ({ cast: { ...DEFAULT_CAST, peer: { ...DEFAULT_CAST.peer, name: peer }, rival: { ...DEFAULT_CAST.rival, name: rival } } });
  const p = withName('김하준', '박수아');
  assert.equal(personalizeText('{peer|과} {rival|과}', p), '김하준과 박수아와');
  assert.equal(personalizeText('{peer|이} {rival|이}', p), '김하준이 박수아가');
  assert.equal(personalizeText('{peer|은} {rival|은}', p), '김하준은 박수아는');
  assert.equal(personalizeText('{peer|를} {rival|를}', p), '김하준을 박수아를');
  assert.equal(personalizeText('{peer}의 {rival}도', p), '김하준의 박수아도');
  assert.equal(personalizeText('{rival|과} 대결', null), '박태성과 대결', '플레이어가 없으면 기본 인물');
});

test('회차별 인물: 활동·이벤트·외출 문구에 기본 인물 이름이 직접 적혀 있지 않다', () => {
  const defaults = CAST_IDS.map(id => BOND_NAMES[id]);
  const texts = [
    ...Object.values(SUB_ACTIVITY_POOL).flat().flatMap(o => [o.label, o.description]),
    ...CUTSCENE_EVENTS_POOL.flatMap(e => [e.title, e.subtitle, e.speakerName, e.dialogue, ...(e.dialogueLines ?? []).map(l => l.text), ...(e.choices ?? []).flatMap(c => [c.label, c.response])]),
    ...REGIONS.flatMap(region => getOutdoorLocations(region).map(l => l.description)),
  ];
  for (const name of defaults) {
    const hit = texts.find(t => typeof t === 'string' && t.includes(name));
    assert.equal(hit, undefined, `기본 이름 "${name}"이 문구에 남아 있음: ${hit}`);
  }
  const cast = generateCast(castPlayer, HIGH_SCHOOLS_DATA, seeded(3));
  const arcade = SUB_ACTIVITY_POOL.relationship.find(o => o.id === 'rel_friends_arcade');
  assert.ok(personalizeText(arcade.label, { cast }).startsWith(`${cast.peer.name}·${cast.neighbor.name}`));
  const juniorScene = CUTSCENE_EVENTS_POOL.find(e => e.id === 'junior_advice');
  assert.equal(juniorScene.speakerId, 'junior');
  assert.equal(personalizeText(juniorScene.speakerName, { cast }), `후배 ${cast.junior.name}`);
});

const { trainingFocus, trainingRecommendation, optionMatchesTrainingAdvice } = require(path.join(dir, 'data/teamCompetition.js'));
test('코치 조언은 컨디션 회복을 우선하고 포지션별 보완 활동만 표시한다', () => {
  const player = { position: 'P', condition: 70, teamCompetition: { recentForm: 30 } };
  const option = (category, statChanges, pitchTraining) => ({ category, statChanges, pitchTraining, staminaDelta: 0 });
  assert.equal(trainingFocus({ ...player, condition: 44 }), 'recovery');
  assert.ok(optionMatchesTrainingAdvice({ ...player, condition: 44 }, option('rest', { condition: 3 })));
  assert.equal(optionMatchesTrainingAdvice({ ...player, condition: 44 }, option('rest', { condition: -1 })), false);
  assert.equal(optionMatchesTrainingAdvice({ ...player, condition: 44 }, option('training', { control: 3 })), false);
  assert.ok(optionMatchesTrainingAdvice({ ...player, condition: 44 }, { ...option('rest', {}), staminaDelta: 20 }));
  assert.ok(optionMatchesTrainingAdvice(player, option('special', { control: 3 })));
  assert.equal(optionMatchesTrainingAdvice(player, option('training', { power: 3 })), false);
  assert.equal(optionMatchesTrainingAdvice(player, option('relationship', { control: 3 })), false);
  const batter = { ...player, position: 'SS' };
  assert.ok(optionMatchesTrainingAdvice(batter, option('training', { eye: 1 })));
  assert.equal(optionMatchesTrainingAdvice(batter, option('training', { defense: 3 })), false);
  const twoWay = { ...player, position: 'TwoWay' };
  assert.ok(optionMatchesTrainingAdvice(twoWay, option('training', { contact: 1 })));
  assert.ok(optionMatchesTrainingAdvice(twoWay, option('training', { control: 1 })));
  assert.ok(optionMatchesTrainingAdvice(twoWay, option('training', {}, { pitch: 'Slider' })));
  assert.ok(trainingRecommendation(twoWay).includes('타격·수비와 구종·제구'));
  assert.equal(trainingFocus({ ...player, condition: 45, teamCompetition: { recentForm: 40 } }), 'technique');
});

const { evaluateActivityWithGating } = require(path.join(dir, 'types/activity.js'));
test('미리보기는 부상 난수를 소비하지 않고 실제 수행에서만 부상을 판정한다', () => {
  const random = Math.random;
  let rolls = 0;
  Math.random = () => { rolls++; return 0; };
  try {
    const option = SUB_ACTIVITY_POOL.training.find(o => !o.season);
    const preview = evaluateActivityWithGating(option, 5, 5, { rollInjury: false });
    assert.equal(rolls, 0);
    assert.equal(preview.isInjured, false);
    const actual = evaluateActivityWithGating(option, 5, 5);
    assert.equal(rolls, 1);
    assert.equal(actual.isInjured, true);
    assert.equal(actual.staminaDelta, preview.staminaDelta - 10);
  } finally { Math.random = random; }
});

const { getSeasonJourney } = require(path.join(dir, 'data/seasonJourney.js'));
test('한 해의 흐름은 달력과 윤년을 따르고 1월에 진행률이 초기화되지 않는다', () => {
  const date = (year, month, day) => ({ year, month, day, grade: 1 });
  assert.equal(getSeasonJourney(date(2026, 3, 2)).elapsedDays, 1);
  assert.equal(getSeasonJourney(date(2026, 3, 2)).totalDays, 365);
  assert.equal(getSeasonJourney(date(2027, 1, 1)).startYear, 2026);
  assert.equal(getSeasonJourney(date(2027, 2, 28)).remainingDays, 1);
  assert.equal(getSeasonJourney(date(2027, 12, 24)).totalDays, 366);
  assert.equal(getSeasonJourney(date(2028, 2, 29)).remainingDays, 1);
  for (let month = 1; month <= 12; month++) assert.ok(getSeasonJourney(date(2027, month, 1)).chapter);
});

const { createSaveExport } = require(path.join(dir, 'data/saveExport.js'));
test('진행 기록 내보내기는 대회·인연·미확인 리포트를 보존하고 원본을 수정하지 않는다', () => {
  const player = { name: '기록 확인', id: 7, gameDate: { year: 2027, month: 3, day: 1, grade: 2 }, savedMatches: [{ id: 'final', result: 'home' }], relationships: { peer: 70 }, pendingGradeReportId: '2026:1', gradeReports: [{ id: '2026:1' }] };
  const before = structuredClone(player);
  const exported = JSON.parse(createSaveExport(player, '2.0', '2026-10-01T00:00:00Z'));
  assert.equal(exported.format, 'DiamondGM-save');
  assert.deepEqual(exported.player, before);
  assert.deepEqual(player, before);
});

const { getSavedCareers, getCareerRoute } = require(path.join(dir, 'data/savedCareers.js'));
test('이어서 하기는 샘플 선수 제외·날짜와 졸업 기록 보존·입학 면담 재진입', () => {
  const players = [
    { id: 1, status: 'HighSchool', name: '샘플' },
    { id: 2, status: 'Pro', careerGoal: 'KBO' },
    { id: 3, status: 'HighSchool', careerGoal: 'KBO' },
    { id: 4, status: 'HighSchool', interviewCompleted: true, gameDate: { month: 12, day: 24 }, careerEndedAt: { month: 3, day: 1 } },
  ];
  const careers = getSavedCareers(players);
  assert.deepEqual(careers.map(p => p.id), [4, 3]);
  assert.equal(getCareerRoute(careers[0]), '/development/dashboard/4');
  assert.equal(getCareerRoute(careers[1]), '/development/interview/3');
  assert.equal(players[0].id, 1, '표시를 위해 저장본 순서를 변경하지 않음');
});

const { getSchoolKit, getSchoolPortraitSrc, SCHOOL_KIT_REFERENCES } = require(path.join(dir, 'data/schoolKits.js'));
const { normalizeAppearance, getPortraitPresets } = require(path.join(dir, 'data/playerDevelopment.js'));
const { PlayerPortrait, AppearanceEditor } = require(path.join(dir, 'components/PlayerAppearance.js'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');

const allPresets = [...getPortraitPresets('male'), ...getPortraitPresets('female')];

test('학교별 디자인은 안정적이고 사진 참고 배색과 기본 배색을 구분한다', () => {
  const styles = new Set();
  for (const school of HIGH_SCHOOLS_DATA) {
    const kit = getSchoolKit(school.name);
    assert.deepEqual(kit, getSchoolKit(school.name));
    assert.equal(kit.id, school.id);
    assert.match(kit.capPrimary, /^#[a-f0-9]{6}$/i);
    if (!SCHOOL_KIT_REFERENCES[school.name]) {
      assert.equal(kit.primary, school.uniformPrimaryColor);
      assert.equal(kit.secondary, school.uniformSecondaryColor);
    }
    styles.add(kit.style);
  }
  assert.equal(styles.size, 4);
  assert.equal(Object.keys(SCHOOL_KIT_REFERENCES).length, 20);
  assert.ok(Object.keys(SCHOOL_KIT_REFERENCES).every(name => HIGH_SCHOOLS_DATA.some(s => s.name === name)));
});

test('이전 성별·헤어 외형은 유지하고 액세서리와 모자 토글은 제거한다', () => {
  assert.deepEqual(normalizeAppearance({ hairStyle: 'long', accessory: 'glasses' }, 'female'), { hairStyleId: 'female_long' });
  assert.deepEqual(normalizeAppearance({ hairStyleId: 'male_buzz', accessoryId: 'headband', cap: 'none' }), { hairStyleId: 'male_buzz' });
  assert.equal(normalizeAppearance({ hairStyleId: 'female_bob' }, 'male').hairStyleId, 'male_spiky');
});

test('8개 외형은 완성 이미지와 등번호로만 렌더링하고 액세서리 입력이 없다', () => {
  const portraits = [];
  for (const gender of ['male', 'female']) for (const preset of getPortraitPresets(gender)) {
    for (const schoolName of ['덕수고', '충암고', '휘문고', '서울고']) for (const accessoryId of [undefined, 'goggles', 'headband']) {
      portraits.push(React.createElement(PlayerPortrait, { key: portraits.length, gender, schoolName, appearance: { hairStyleId: preset.id, accessoryId } }));
    }
  }
  const html = renderToStaticMarkup(React.createElement('div', null, portraits));
  assert.equal((html.match(/role="img"/g) || []).length, 96);
  assert.equal((html.match(/<img /g) || []).length, 96);
  assert.ok(!html.includes('<mask') && !html.includes('<filter') && !html.includes('<path'));
  const editor = renderToStaticMarkup(React.createElement(AppearanceEditor, { value: { hairStyleId: 'female_long', accessoryId: 'headband' }, onChange() {}, gender: 'female', schoolName: '덕수고' }));
  assert.ok(!editor.includes('<select') && !editor.includes('액세서리'));
  assert.ok(editor.includes('aria-pressed="true"'));
  assert.equal((editor.match(/role="img"/g) || []).length, 5);
});

test('원화32장과 학교91×외형8장 및 기본8장이 모두 존재한다', () => {
  for (const preset of allPresets) {
    for (const style of ['classic', 'pinstripe', 'solid', 'raglan']) assert.ok(fs.existsSync(`public/assets/kit-sources/${preset.id}-${style}.webp`));
    for (const school of [...HIGH_SCHOOLS_DATA, { name: '' }]) assert.ok(fs.existsSync('public/' + getSchoolPortraitSrc(school.name, preset.id)));
  }
  assert.equal(HIGH_SCHOOLS_DATA.length, 91);
});

test('32개 작업 원화는 실제 투명 배경과 인물을 가진640×960WebP다', async () => {
  for (const preset of allPresets) for (const style of ['classic', 'pinstripe', 'solid', 'raglan']) {
    const file = `public/assets/kit-sources/${preset.id}-${style}.webp`;
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 640, file);
    assert.equal(metadata.height, 960, file);
    assert.equal(metadata.format, 'webp', file);
    assert.ok(metadata.hasAlpha, file);
    const stats = await sharp(file).ensureAlpha().stats();
    const alpha = stats.channels[3];
    assert.equal(alpha.min, 0, file + ' 투명 배경');
    assert.equal(alpha.max, 255, file + ' 인물');
    assert.ok(alpha.mean > 255 * .25 && alpha.mean < 255 * .98, file + ' 배경/인물 비율');
  }
});

test('알 수 없는 학교와 잘못된 외형은 준비된 기본 원화를 사용한다', () => {
  assert.equal(getSchoolPortraitSrc('알 수 없는 학교', '../../bad'), 'assets/school-kits/default-male_spiky.webp');
});

test('작업용 원단 색을 바꿔도 선화·피부·중성 그림자와 알파는 보존한다', async () => {
  const { recolourFabric } = await import('../scripts/kit-colours.mjs');
  const pixels = Buffer.from([255, 0, 255, 255, 0, 255, 255, 230, 24, 24, 24, 255, 250, 188, 145, 255, 0, 0, 0, 0]);
  const out = recolourFabric(pixels, '#183a72', '#ce243d', { width: 5 });
  assert.deepEqual([...out.subarray(0, 3)], [24, 58, 114]);
  assert.deepEqual([...out.subarray(4, 7)], [206, 36, 61]);
  assert.deepEqual(out.subarray(8), pixels.subarray(8));
  assert.equal(out[7], 230);
});

test('흰 원단만 그레이로 바꾸고 모자와 유니폼은 독립된 색을 쓴다', async () => {
  const { recolourFabric } = await import('../scripts/kit-colours.mjs');
  const pixels = Buffer.alloc(4 * 300);
  for (let y = 0; y < 300; y++) pixels.set([255, 0, 255, 255], y * 4);
  pixels.set([255, 255, 255, 255], 200 * 4);
  const out = recolourFabric(pixels, '#b52239', '#ffffff', { width: 1, capPrimary: '#182b45', baseFabric: '#cccccc', forehead: 50, chestY: 180 });
  assert.deepEqual([...out.subarray(0, 3)], [24, 43, 69]);
  assert.deepEqual([...out.subarray(180 * 4, 180 * 4 + 3)], [181, 34, 57]);
  assert.deepEqual([...out.subarray(200 * 4, 200 * 4 + 3)], [204, 204, 204]);
});

test('학교명과 모자 글자의 모든 문자가 번들 폰트에 포함된다', () => {
  const supported = new Set(JSON.parse(fs.readFileSync('scripts/fonts/glyphs.json', 'utf8')));
  for (const school of [...HIGH_SCHOOLS_DATA, { name: '' }]) {
    const kit = getSchoolKit(school.name);
    assert.ok([...kit.wordmark + kit.symbol].every(c => supported.has(c)), school.name);
  }
});

test('같은 학교는 모든 외형에서 학교명 배치·서체·배색·모자 문양을 유지한다', async () => {
  const { getKitLetteringSvg } = await import('../scripts/kit-lettering.mjs');
  for (const school of [...HIGH_SCHOOLS_DATA, { name: '' }]) {
    const kit = getSchoolKit(school.name);
    let expected;
    for (const preset of allPresets) {
      const svg = await getKitLetteringSvg(kit, preset.id);
      // Body fitting can resize and translate words, but cannot redesign them.
      const design = [...svg.matchAll(/<text\b[^>]*>[^<]*<\/text>/g)]
        .map(([text]) => text.replace(/\s(?:x|y|font-size)="[^"]*"/g, ''));
      expected ??= design;
      assert.deepEqual(design, expected, school.name + ' ' + preset.id);
    }
  }
});

test('학교91×외형8의 실제 글자 렌더링에서 단추 여밈선20px은 비어 있다', async () => {
  const { registerKitFont, getKitLetteringSvg, LETTERING_FITS } = await import('../scripts/kit-lettering.mjs');
  await registerKitFont();
  for (const school of HIGH_SCHOOLS_DATA) for (const preset of allPresets) {
    const fit = LETTERING_FITS[preset.id];
    const { data, info } = await sharp(Buffer.from(await getKitLetteringSvg(getSchoolKit(school.name), preset.id, { cap: false }))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y++) for (let x = Math.ceil((fit.seam - 9) * info.width / 200); x < Math.floor((fit.seam + 9) * info.width / 200); x++) {
      assert.equal(data[(y * info.width + x) * 4 + 3], 0, school.name + ' ' + preset.id + ' 단추');
    }
  }
});

test('유니폼 글씨는 머리·피부·투명 배경을 덮지 않고 원단 가장자리 알파를 보존한다', async () => {
  const { maskLetteringToFabric } = await import('../scripts/kit-lettering.mjs');
  const plate = Buffer.from([255,255,255,128, 30,25,20,255, 230,165,130,255, 255,0,255,255, 255,255,255,0]);
  const ink = Buffer.from(Array.from({length:5}, () => [200,0,0,255]).flat());
  const out = maskLetteringToFabric(ink, plate, {width:1,chestY:0});
  assert.deepEqual([out[3],out[7],out[11],out[15],out[19]], [128,0,0,255,0]);
});

test('완성 원화는512×768이며 투명 배경을 유지한다', async () => {
  for (const preset of allPresets) {
    const meta = await sharp('public/' + getSchoolPortraitSrc('서울고', preset.id)).metadata();
    assert.equal(meta.width, 512); assert.equal(meta.height, 768); assert.ok(meta.hasAlpha);
  }
});

test('세이브 파일 내보내기 및 복원(parseSaveExport) 무결성을 검증한다', () => {
  const { createSaveExport, parseSaveExport } = require(path.join(dir, 'data/saveExport.js'));
  const samplePlayer = { name: '홍길동', highSchool: '덕수고', position: 'P', overall: 60 };
  const jsonStr = createSaveExport(samplePlayer, '2.1.1');
  const restored = parseSaveExport(jsonStr);
  assert.equal(restored.name, '홍길동');
  assert.equal(restored.highSchool, '덕수고');
  assert.throws(() => parseSaveExport('{}'), /선수 필수 정보/);
  assert.throws(() => parseSaveExport('not json'), /올바른 JSON 파일 형식/);
});

test('KBO 라이선스 회피를 위한 10개 프로 구단 및 가상 선수 생성을 검증한다', () => {
  const { buildDefaultProTeams, buildDefaultProPlayers, INITIAL_CLUBS_META } = require(path.join(dir, 'data/proClubs.js'));
  assert.equal(INITIAL_CLUBS_META.length, 10);
  const teams = buildDefaultProTeams();
  assert.equal(teams.length, 10);
  // 기업명(LG, 두산, 삼성 등) 대신 도시 연고지 기반 명칭 확인
  assert.ok(teams.some(t => t.name === '서울 듀오스'));
  assert.ok(teams.some(t => t.name === '부산 샤크즈'));
  assert.ok(teams.some(t => t.name === '광주 재규어스'));
  assert.ok(teams.some(t => t.name === '대전 호크스'));

  const players = buildDefaultProPlayers(teams);
  assert.ok(players.length >= 100);
  assert.ok(players.every(p => p.status === 'Pro' && p.teamId !== undefined));
  assert.ok(players.every(p => p.proStats && p.proStats.batting && p.proStats.pitching));
});

test('프로 경기 자동 시뮬레이션 및 KBO 스타일 순위표 계산을 검증한다', () => {
  const { buildDefaultProTeams, buildDefaultProPlayers } = require(path.join(dir, 'data/proClubs.js'));
  const { quickSimulateMatch } = require(path.join(dir, 'store/proSimulation.js'));
  const { computeStandings } = require(path.join(dir, 'store/proLeagueStore.js'));

  const teams = buildDefaultProTeams();
  const players = buildDefaultProPlayers(teams);

  const home = teams[0];
  const away = teams[1];
  const homePlayers = players.filter(p => p.teamId === home.id);
  const awayPlayers = players.filter(p => p.teamId === away.id);

  const boxscore = quickSimulateMatch('2026-03-28_TWINS_BEARS', '2026-03-28', home, away, homePlayers, awayPlayers);
  assert.ok(boxscore.homeScore >= 0);
  assert.ok(boxscore.awayScore >= 0);
  assert.ok(boxscore.mvp);

  const standings = computeStandings(teams, players);
  assert.equal(standings.length, 10);
  assert.equal(standings[0].rank, 1);
  assert.ok(standings.every(s => typeof s.winRate === 'number' && typeof s.gamesBehind === 'number'));
});

test('OOTP 스타일 경기 타석 시뮬레이션 및 전술 개입(번트, 도루)을 검증한다', () => {
  const { buildDefaultProTeams, buildDefaultProPlayers } = require(path.join(dir, 'data/proClubs.js'));
  const { initInGameMatch, simulateAtBat } = require(path.join(dir, 'store/proSimulation.js'));

  const teams = buildDefaultProTeams();
  const players = buildDefaultProPlayers(teams);
  const home = teams[0];
  const away = teams[1];
  const homePlayers = players.filter(p => p.teamId === home.id);
  const awayPlayers = players.filter(p => p.teamId === away.id);

  const state = initInGameMatch('test_match', '2026-03-28', home, away, homePlayers, awayPlayers);
  assert.equal(state.inning, 1);
  assert.equal(state.outs, 0);

  // 일반 타석 진행
  const next1 = simulateAtBat(state, homePlayers, awayPlayers);
  assert.ok(next1.playLogs.length >= 2);

  // 1루 주자 도루 시도 테스트
  state.bases[0] = true;
  state.runners[0] = '발빠른주자';
  const nextSteal = simulateAtBat(state, homePlayers, awayPlayers, 'steal');
  assert.ok(nextSteal.playLogs.some(l => l.text.includes('도루')));
});

test('고교야구 주말리그 조별 순위표(getWeekendGroupStandings)를 계산한다', () => {
  const { getWeekendGroupStandings } = require(path.join(dir, 'data/weekendLeague.js'));
  const school = HIGH_SCHOOLS_DATA.find(s => s.name === '덕수고') || HIGH_SCHOOLS_DATA[0];
  const { groupName, standings } = getWeekendGroupStandings(school, HIGH_SCHOOLS_DATA, [], 1);
  assert.ok(groupName.length > 0);
  assert.ok(standings.length >= 2);
  assert.ok(standings.some(s => s.isPlayerSchool));
  assert.equal(standings[0].rank, 1);
});

// GM world tests use a separate in-memory database, never the user's browser save.
function gmMemory(initial) {
  let state=structuredClone(initial);
  let fail=false;
  const db={};
  for(const key of ['teams','players','leagueSeasons']) {
    db[key]={
      toArray:async()=>structuredClone(state[key]),
      count:async()=>state[key].length,
      get:async id=>structuredClone(state[key].find(x=>x.id===id)),
      toCollection:()=>({first:async()=>structuredClone(state[key][0])}),
      put:async row=>{ if(fail&&key==='leagueSeasons'){fail=false;throw Error('GM save failed');} const i=state[key].findIndex(x=>x.id===row.id); if(i<0)state[key].push(structuredClone(row));else state[key][i]=structuredClone(row);return row.id;},
      add:async row=>{const id=Math.max(0,...state[key].map(x=>x.id??0))+1;state[key].push(structuredClone({...row,id}));return id;},
      bulkAdd:async rows=>{for(const row of rows)await db[key].add(row);},
    };
  }
  db.transaction=async (...args)=>{const before=structuredClone(state);try{return await args.at(-1)();}catch(e){state=before;throw e;}};
  return {db,snapshot:()=>structuredClone(state),fail:()=>{fail=true;}};
}
const gmWorld=require(path.join(dir,'data/gmWorld.js'));
const gmCareer=()=>normalizePlayer({id:7,name:'연결 선수',gender:'female',age:19,position:'SS',highSchool:'덕수고',status:'HighSchool',overall:55,academics:60,relationships:{...INITIAL_RELATIONSHIPS},careerEndedAt:'2029-03-01',gameDate:{year:2029,month:3,day:1,weekday:4,grade:3},matchRecords:[{matchId:'졸업 경기'}],careerJourney:{met:['mother','father'],completedScenes:[],trainingGrowth:{contact:9},offers:['professional'],ending:{route:'professional',title:'프로',text:'기록',overall:55,appearances:20}}});

test('GM 구단 갱신은 기존 ID·재정·전적·직접 지은 이름을 보존한다',()=>{
  const old=[{id:73,name:'Seoul Tigers',city:'Seoul',budget:123,fanBase:50,wins:9},{id:88,code:'BEARS',name:'내가 지은 구단',city:'서울',budget:456,fanBase:70}];
  const copy=structuredClone(old);
  const out=gmWorld.reconcileProTeams(old);
  assert.deepEqual(old,copy);
  const legacy=out.find(t=>t.id===73);
  assert.equal(legacy.code,'TIGERS');assert.equal(legacy.name,'광주 재규어스');assert.equal(legacy.budget,123);assert.equal(legacy.wins,9);
  assert.equal(out.find(t=>t.id===88).name,'내가 지은 구단');
  assert.equal(new Set(out.map(t=>t.code)).size,10);
  assert.ok(out.filter(t=>![73,88].includes(t.id)).every(t=>t.id===undefined));
});

test('GM 연도와 후보 복사는 졸업·연도 일치 조건을 검사하고 원본을 유지한다',()=>{
  const source=gmCareer(),before=structuredClone(source);
  const result=gmWorld.prepareGMWorld({id:1,year:2026,currentStage:'RegularSeason'},2029,2,source);
  assert.deepEqual(source,before);
  assert.equal(result.season.year,2029);assert.ok(result.season.currentDate.startsWith('2029-'));assert.equal(result.season.sourceCareerId,7);
  assert.equal(result.prospect.id,undefined);assert.equal(result.prospect.teamId,undefined);assert.equal(result.prospect.status,'DraftProspect');
  assert.deepEqual(result.prospect.relationships,source.relationships);assert.deepEqual(result.prospect.matchRecords,source.matchRecords);
  result.prospect.careerJourney.trainingGrowth.contact=0;assert.equal(source.careerJourney.trainingGrowth.contact,9);
  assert.throws(()=>gmWorld.prepareGMWorld({setupCompleted:true},2029,2,source),/이미 시작/);
  assert.throws(()=>gmWorld.prepareGMWorld({},2028,2,source),/연도/);
  assert.throws(()=>gmWorld.prepareGMWorld({},2029,2,{...source,careerEndedAt:undefined}),/졸업/);
  assert.throws(()=>gmWorld.prepareGMWorld({},2025,2),/연도/);
});

test('GM 초기화는 기존 프로·육성·시즌 저장을 보존하고 반복해도 선수를 추가하지 않는다',async()=>{
  const module=require(path.join(dir,'db.js')),previous=module.db;
  const career=gmCareer(),pro={...gmCareer(),id:500,status:'Pro',teamId:73,salary:999};
  const season={id:1,year:2028,currentDate:'2028-05-01',currentStage:'RegularSeason'};
  const mem=gmMemory({teams:[{id:73,name:'Seoul Tigers',city:'Seoul',budget:123,fanBase:50,wins:9}],players:[career,pro],leagueSeasons:[season]});
  module.db=mem.db;
  try{
    await module.initDummyDataIfNeeded();const once=mem.snapshot();await module.initDummyDataIfNeeded();
    assert.deepEqual(mem.snapshot(),once);
    assert.deepEqual(once.players.find(p=>p.id===7),career);assert.deepEqual(once.players.find(p=>p.id===500),pro);
    assert.deepEqual(once.leagueSeasons,[season]);assert.equal(once.teams.length,10);
    assert.equal(new Set(once.players.map(p=>p.id)).size,once.players.length);
  }finally{module.db=previous;}
});

test('GM 후보 연결은 저장 실패 시 롤백하고 재접속·중복 요청에서 한 명만 보존한다',async()=>{
  const module=require(path.join(dir,'db.js')),previous=module.db;
  const {buildDefaultProTeams}=require(path.join(dir,'data/proClubs.js'));
  const {useProLeagueStore:store}=require(path.join(dir,'store/proLeagueStore.js'));
  const source=gmCareer();
  const mem=gmMemory({teams:buildDefaultProTeams(),players:[source],leagueSeasons:[{id:1,year:2026,currentStage:'RegularSeason',setupCompleted:false}]});module.db=mem.db;
  try{
    await store.getState().loadLeague();assert.equal(store.getState().careerCandidates.length,1);
    mem.fail();const before=mem.snapshot();await assert.rejects(store.getState().startWorld(2029,1,7),/GM save failed/);
    assert.deepEqual(mem.snapshot(),before);assert.equal(store.getState().season.setupCompleted,false);assert.equal(store.getState().isLoading,false);
    await store.getState().startWorld(2029,1,7);
    assert.equal(mem.snapshot().players.filter(p=>p.status==='DraftProspect').length,1);
    assert.deepEqual(mem.snapshot().players.find(p=>p.id===7),source);
    await store.getState().loadLeague();assert.equal(store.getState().draftProspects.length,1);assert.equal(store.getState().season.year,2029);
    await assert.rejects(store.getState().startWorld(2029,1,7),/이미 시작/);
    assert.equal(mem.snapshot().players.filter(p=>p.status==='DraftProspect').length,1);
  }finally{module.db=previous;}
});

test('GM 독립 시작은 육성 후보를 자동 이관하지 않고 기존 진행 시즌을 다시 설정하지 않는다',async()=>{
  const module=require(path.join(dir,'db.js')),previous=module.db;
  const {buildDefaultProTeams}=require(path.join(dir,'data/proClubs.js'));
  const {useProLeagueStore:store}=require(path.join(dir,'store/proLeagueStore.js'));
  const teams=buildDefaultProTeams();
  const mem=gmMemory({teams,players:[gmCareer()],leagueSeasons:[{id:1,year:2026,currentStage:'RegularSeason',setupCompleted:false}]});module.db=mem.db;
  try{
    await store.getState().loadLeague();await store.getState().startWorld(2027,2);
    assert.equal(mem.snapshot().players.filter(p=>p.status==='DraftProspect').length,0);assert.equal(store.getState().season.sourceCareerId,undefined);
    assert.equal(store.getState().season.year,2027);assert.equal(store.getState().season.userTeamId,2);
    const old=gmMemory({teams:teams.map((t,i)=>({...t,wins:i===0?1:0})),players:[],leagueSeasons:[{id:1,year:2028,currentDate:'2028-05-01',currentStage:'RegularSeason'}]});module.db=old.db;
    await store.getState().loadLeague();assert.equal(store.getState().season.setupCompleted,true);assert.equal(store.getState().currentDateStr,'2028-05-01');
  }finally{module.db=previous;}
});

test('GM 이름 편집은 ID·기록 보존, 재접속, 원래 이름으로 수정, 저장 실패를 처리한다',async()=>{
  const module=require(path.join(dir,'db.js')),previous=module.db;
  const {buildDefaultProTeams}=require(path.join(dir,'data/proClubs.js'));
  const {useProLeagueStore:store}=require(path.join(dir,'store/proLeagueStore.js'));
  const mem=gmMemory({teams:buildDefaultProTeams(),players:[gmCareer()],leagueSeasons:[{id:1,year:2026,currentStage:'RegularSeason',setupCompleted:false}]});module.db=mem.db;
  try{
    await store.getState().loadLeague();await store.getState().startWorld(2029,1,7);
    const original=mem.snapshot(),pro=store.getState().players[0],candidate=store.getState().draftProspects[0];
    const put=mem.db.teams.put;mem.db.teams.put=async()=>{throw Error('rename save failed');};
    await assert.rejects(store.getState().renameTeam(1,'서울 테스트','테스트','테스트 파크'),/rename save failed/);
    assert.deepEqual(mem.snapshot(),original);assert.equal(store.getState().teams[0].name,original.teams[0].name);assert.equal(store.getState().isLoading,false);mem.db.teams.put=put;
    await store.getState().renameTeam(1,' 서울 트윈즈 ','트윈즈','내 구장');
    await store.getState().renamePlayer(pro.id,' 우리 에이스 ');
    await store.getState().renamePlayer(candidate.id,'연결 후보');
    await store.getState().loadLeague();
    const saved=mem.snapshot();
    assert.equal(store.getState().teams[0].name,'서울 트윈즈');assert.equal(store.getState().teams[0].customName,true);
    assert.deepEqual(saved.teams[0],{...original.teams[0],name:'서울 트윈즈',shortName:'트윈즈',venue:'내 구장',customName:true});
    assert.deepEqual(saved.players.find(p=>p.id===pro.id),{...original.players.find(p=>p.id===pro.id),name:'우리 에이스'});
    assert.equal(saved.players.find(p=>p.id===candidate.id).name,'연결 후보');assert.deepEqual(saved.players.find(p=>p.id===7),gmCareer());
    await assert.rejects(store.getState().renamePlayer(7,'원본 변경'),/GM 선수/);
    await assert.rejects(store.getState().renamePlayer(pro.id,'  '),/선수명/);
    await assert.rejects(store.getState().renameTeam(1,'a'.repeat(41),'약칭','구장'),/구단명/);
    store.setState({inGameMatch:{}});await assert.rejects(store.getState().renamePlayer(pro.id,'경기 중 수정'),/경기/);store.setState({inGameMatch:null});
  }finally{store.setState({inGameMatch:null});module.db=previous;}
});
