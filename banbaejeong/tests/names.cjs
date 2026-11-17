// 배정 결과에서 학생 이름이 절대 말줄임(...)되지 않고, 자리가 모자라면 옆의 태그·배지가 아래 줄로 내려가는지 검사한다.
// 실제 Supabase는 쓰지 않는다(가상 전송 계층).
const { chromium } = require('playwright'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const LONG_NAMES = ['김철수', '박영희', '최민준', '남궁민수', '황보지민', '제갈승현', '독고영수', '선우민지',
  '김하늘별', '이서준호', '박서연우', '최지우진', '강태양빛', '윤가온누리', '임한별이', '한결음표', '서로사랑', '문예쁨이'];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'bbj-names-'));
  const errors = [];
  const results = [];
  try {
    for (const viewport of [{ width: 1920, height: 1080, tag: '1920' }, { width: 1280, height: 900, tag: '1280' }, { width: 412, height: 900, tag: '412' }]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        sessionStorage.setItem('banbaejeong.cloud', '2026');
        window.fakeServer = { state: {}, revision: 1 };
        window.__bbjTransport = (p, body, cb) => setTimeout(() => {
          if (p === 'banbaejeong_save') { fakeServer.state = JSON.parse(JSON.stringify(body.p_state)); fakeServer.revision++; }
          cb(null, { state: fakeServer.state, revision: fakeServer.revision });
        }, 5);
      });
      await page.goto(process.env.BBJ_URL || 'http://127.0.0.1:4188/banbaejeong/');
      await page.waitForFunction(() => window.__bbj && __bbj.cloud.entered());
      await page.evaluate((names) => {
        const s = __bbj.state();
        s.students = []; s.classes = []; s.classCount = 6; s.nextId = 61;
        s.tags = ['학습', '생활', '폭력', '특수', '다문화'].map((name) => ({ name, weight: 2, max: null }));
        for (let i = 0; i < 60; i++) {
          const tags = ['학습', '생활', '폭력', '특수', '다문화'].slice(0, i % 5), w = {};
          tags.forEach((t) => { w[t] = 3; });
          s.students.push({ id: i + 1, name: names[i % names.length], no: i + 1, gender: i % 2 ? '여' : '남', g4: (i % 6) + 1 + '반', g5: (i % 5) + 1 + '반', tags, w, fixed: null });
        }
        for (let k = 0; k < 6; k++) s.classes.push({ name: (k + 1) + '반', total: 10, special: false });
        s.useY3 = false; s.pairs = []; s.requiredGroups = []; s.wishGroups = [];
        s.result = { assign: s.students.map((_, i) => i % 6), ids: s.students.map((x) => x.id), moves: 0, ms: 1, at: Date.now() };
        s.resultLayout = 'sex';
        __bbj.renderAll();
      }, LONG_NAMES);
      await page.locator('[data-tab=result]').click();
      for (const layout of ['one', 'two', 'sex']) {
        await page.locator(`[data-layout=${layout}]`).click();
        await page.waitForTimeout(80);
        const m = await page.evaluate(() => {
          const names = [...document.querySelectorAll('.chiplist .stu button.nm')];
          const clipped = names.filter((el) => el.scrollWidth > el.clientWidth + 1);
          const ellipsis = names.filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1);
          const outside = [];
          document.querySelectorAll('.chiplist .stu').forEach((stu) => {
            const sr = stu.getBoundingClientRect();
            stu.querySelectorAll('button.nm').forEach((el) => {
              const r = el.getBoundingClientRect();
              if (r.right > sr.right + 1 || r.left < sr.left - 1) outside.push(el.textContent);
            });
          });
          const stuOverflow = [...document.querySelectorAll('.chiplist .stu')].filter((el) => el.scrollWidth > el.clientWidth + 1).length;
          const colOverflow = [...document.querySelectorAll('#classCards .col')].filter((el) => el.scrollWidth > el.clientWidth + 1).length;
          const pageOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
          return {
            names: names.length, namesVisible: names.map((el) => el.textContent),
            clipped: clipped.map((el) => el.textContent), ellipsis: ellipsis.length,
            outside, stuOverflow, colOverflow, pageOverflow,
            worst: names.length ? Math.max(...names.map((el) => el.scrollWidth - el.clientWidth)) : 0,
          };
        });
        results.push({ viewport: viewport.tag, layout, ...m });
        assert.equal(m.names > 0, true, `${viewport.tag}/${layout}: 결과 카드에 학생이 없습니다`);
        assert.deepEqual(m.clipped, [], `${viewport.tag}/${layout}: 학생 이름이 잘렸습니다`);
        assert.equal(m.ellipsis, 0, `${viewport.tag}/${layout}: 이름에 말줄임이 남아 있습니다`);
        assert.deepEqual(m.outside, [], `${viewport.tag}/${layout}: 이름이 카드 밖으로 나갔습니다`);
        assert.equal(m.stuOverflow, 0, `${viewport.tag}/${layout}: 학생 카드가 가로로 넘칩니다`);
        assert.equal(m.colOverflow, 0, `${viewport.tag}/${layout}: 반 칸이 가로로 넘칩니다`);
        assert.equal(m.pageOverflow, false, `${viewport.tag}/${layout}: 페이지가 가로로 넘칩니다`);
        // 이름은 이름 그대로, 전부 보여야 한다.
        for (const nm of m.namesVisible) assert.ok(LONG_NAMES.includes(nm), `${viewport.tag}/${layout}: 이름이 변형되었습니다: ${nm}`);
        if (layout === 'sex') await page.screenshot({ path: path.join(artifacts, `names-${viewport.tag}-${layout}.png`) });
      }
      // 이름을 눌러 정보 수정 창이 그대로 열리는지(이름이 두 줄이 되어도 클릭 대상이 유지됨).
      const firstChipName = await page.locator('.chiplist .stu button.nm').first().innerText();
      await page.locator('.chiplist .stu button.nm').first().click();
      assert.equal(await page.locator('#addStuName').isVisible(), true, '이름 클릭으로 수정 창이 열리지 않습니다');
      assert.equal(await page.locator('#addStuName').inputValue(), firstChipName, '수정 창에 누른 학생 이름이 들어오지 않습니다');
      await page.click('#addStuCancel');
      await context.close();
    }
    assert.deepEqual(errors, []);
    const worstAll = Math.max(...results.map((r) => r.worst));
    console.log(`PASS Chromium: 배정 결과 이름 잘림 없음 — 3가지 보기 × 1920/1280/412px 9조합, 이름 ${results[0].names}개/조합, 최대 초과폭 ${worstAll}px, 이름 클릭 수정 창 정상. Screenshots: ${artifacts}`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
