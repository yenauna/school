// 배정 결과 카드 끌어 옮기기 검사: PC(이름 글자 위 마우스)와 모바일(412px, hasTouch) 실제 터치 입력.
// Run a local static server, then: node banbaejeong/tests/drag.cjs
// Requires Playwright and Chromium; all Supabase calls use an isolated fake server.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const artifacts = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'bbj-drag-'));
const URL = process.env.BBJ_URL || 'http://127.0.0.1:4173/banbaejeong/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const STATE = `({
  students: Array.from({length:12},(_,i)=>({id:i+1,name:'끌학생'+(i+1),no:i+1,g4:'',g5:(i%3+1)+'반',gender:i%2?'여':'남',tags:[],w:{},fixed:null})),
  classes: [{name:'가반',total:4,male:2,female:2,special:false},{name:'나반',total:4,male:2,female:2,special:false},{name:'다반',total:4,male:2,female:2,special:false}],
  pairs: [], pairModes: [], wishGroups: [], requiredGroups: [], tags: ['특수','학습','생활','학부모'].map(name=>({name,weight:99,max:1})),
  deduct: 0, useY3: false, nextId: 13, resultLayout: 'sex', resultSort: 'gender', scoreGap: 2,
  result: {assign:[0,0,0,0,1,1,1,1,2,2,2,2], ids:[1,2,3,4,5,6,7,8,9,10,11,12], at: Date.now(), moves: 0}
})`;

async function unlock(page) {
  await page.addInitScript(() => {
    window.fakeServer = { state: {}, revision: 1, calls: [] };
    window.__bbjTransport = (p, body, cb) => {
      window.fakeServer.calls.push({ path: p, body });
      setTimeout(() => {
        if (body.p_passcode !== '2026') return cb({ code: 'PASSCODE_MISMATCH' });
        if (p === 'banbaejeong_save') { window.fakeServer.state = JSON.parse(JSON.stringify(body.p_state)); window.fakeServer.revision++; }
        cb(null, { state: window.fakeServer.state, revision: window.fakeServer.revision });
      }, 5);
    };
  });
  await page.goto(URL);
  await page.fill('#lockPass', '2026');
  await page.click('#lockEnter');
  await page.waitForFunction(() => window.__bbj && __bbj.cloud.entered());
}

async function installState(page) {
  await page.evaluate(src => {
    const st = eval(src);
    Object.keys(st).forEach(k => { __bbj.state()[k] = st[k]; });
    __bbj.renderAll();
  }, STATE);
  await page.locator('.tab[data-tab="result"]').click();
  await page.waitForSelector('.stu');
}

const box = async (locator) => { const b = await locator.boundingBox(); assert.ok(b, 'element has a box'); return b; };
const center = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function mouseDrag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
    await sleep(8);
  }
}

async function touchStart(client, point) {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
}
async function touchMove(client, from, to, steps = 8) {
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
    });
    await sleep(16);
  }
}
async function touchEnd(client) {
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const errors = [];
  try {
    /* ---------------- PC: 마우스, 이름 글자 위에서도 끌린다 ---------------- */
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    await unlock(page);
    await installState(page);

    // 카드에는 data-k가 붙어 있고 브라우저 기본 드래그는 꺼져 있다(포인터로 직접 끈다).
    assert.equal(await page.locator('.stu[data-id="1"]').getAttribute('draggable'), 'false');
    assert.equal(await page.evaluate(() => !!window.PointerEvent), true);

    // (1) 이름 글자(<button class="nm">) 위에서 마우스로 끌기 → 반 이동
    const nameBox = await box(page.locator('.stu[data-id="1"] .nm'));
    const target = await box(page.locator('.col[data-k="1"] .colhead'));
    await mouseDrag(page, center(nameBox), center(target));
    assert.equal(await page.locator('.stu.drag-ghost').count(), 1, '고스트 칩이 떠 있어야 한다');
    assert.match(await page.locator('.stu.drag-ghost').innerText(), /끌학생1/);
    assert.equal(await page.locator('.col[data-k="1"].drop-on').count(), 1, '손가락 아래 반이 하이라이트되어야 한다');
    assert.equal(await page.evaluate(() => __bbj.cloud.pollBlocked()), true, '끄는 동안 1초 자동 새로고침은 쉬어야 한다');
    await page.mouse.up();
    assert.equal(await page.evaluate(() => __bbj.state().result.assign[0]), 1);
    assert.equal(await page.locator('.stu.drag-ghost,.col.drop-on,body.stu-drag-active').count(), 0, '끝나면 고스트·하이라이트가 사라져야 한다');
    await page.screenshot({ path: path.join(artifacts, 'pc-name-drag.png') });

    // (2) 이름을 짧게 클릭 → 학생 정보 수정 창(이동 없음)
    await page.locator('.stu[data-id="2"] .nm').click();
    assert.equal(await page.locator('#addStudentModal').isVisible(), true);
    assert.equal(await page.inputValue('#addStuName'), '끌학생2');
    assert.equal(await page.evaluate(() => __bbj.state().result.assign[1]), 0);
    await page.click('#addStuCancel');

    // (3) 6px 미만으로 흔들다 놓으면 여전히 클릭으로 본다
    const nm2 = await box(page.locator('.stu[data-id="3"] .nm'));
    await page.mouse.move(nm2.x + 10, nm2.y + 8);
    await page.mouse.down();
    await page.mouse.move(nm2.x + 13, nm2.y + 9);
    await page.mouse.up();
    assert.equal(await page.locator('#addStudentModal').isVisible(), true);
    assert.equal(await page.evaluate(() => __bbj.state().result.assign[2]), 0);
    await page.click('#addStuCancel');

    // (4) 이름이 아닌 카드 여백에서 끌어도 같은 방식으로 옮긴다
    const cardBox = await box(page.locator('.stu[data-id="4"]'));
    const target2 = await box(page.locator('.col[data-k="2"] .colhead'));
    await mouseDrag(page, { x: cardBox.x + cardBox.width - 6, y: cardBox.y + cardBox.height - 5 }, center(target2));
    await page.mouse.up();
    assert.equal(await page.evaluate(() => __bbj.state().result.assign[3]), 2);

    // (5) 같은 반 위에 놓으면 아무 일도 없다
    await page.evaluate(() => { const st = __bbj.state(); st.result.assign[0] = 0; __bbj.renderAll(); });
    await mouseDrag(page, center(await box(page.locator('.stu[data-id="1"] .nm'))), center(await box(page.locator('.col[data-k="0"] .colhead'))));
    await page.mouse.up();
    assert.equal(await page.evaluate(() => __bbj.state().result.assign[0]), 0);

    // (6) 고정 학생은 끌리지 않고 안내만 나온다
    await page.evaluate(() => { const st = __bbj.state(); st.students[0].fixed = 0; __bbj.renderAll(); });
    await sleep(50);
    await mouseDrag(page, center(await box(page.locator('.stu[data-id="1"] .nm'))), center(await box(page.locator('.col[data-k="1"] .colhead'))));
    await page.mouse.up();
    assert.equal(await page.evaluate(() => __bbj.state().result.assign[0]), 0);
    assert.match(await page.locator('#toast').innerText(), /고정 학생은 이름을 눌러 고정 반을 바꾼 뒤 옮기세요\./);
    assert.equal(await page.locator('.stu.drag-ghost').count(), 0);
    await page.evaluate(() => { const st = __bbj.state(); st.students[0].fixed = null; __bbj.renderAll(); });

    // (7) 필수 희망 조합은 마우스로 끌어도 함께 옮길지 묻는다
    await page.evaluate(() => { const st = __bbj.state(); st.requiredGroups = [[5, 6]]; st.result.assign = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]; __bbj.renderAll(); });
    await sleep(50);
    await mouseDrag(page, center(await box(page.locator('.stu[data-id="5"] .nm'))), center(await box(page.locator('.col[data-k="0"] .colhead'))));
    await page.mouse.up();
    assert.equal(await page.locator('#comboMoveModal').isVisible(), true);
    assert.match(await page.locator('#comboMoveText').innerText(), /^필수 조합 끌학생6 학생도 함께 옮기겠습니까\?/);
    await page.click('#comboMoveYes');
    assert.deepEqual(await page.evaluate(() => __bbj.state().result.assign.slice(4, 6)), [0, 0]);

    // (8) 수정 창의 `현재 배정 반`으로도 옮길 수 있다(터치가 어려운 화면의 백업)
    await page.evaluate(() => { const st = __bbj.state(); st.requiredGroups = []; __bbj.renderAll(); });
    await sleep(50);
    await page.locator('.stu[data-id="7"] .nm').click();
    assert.equal(await page.locator('#addStuNowWrap').isVisible(), true);
    assert.equal(await page.inputValue('#addStuNowClass'), '1');
    await page.selectOption('#addStuNowClass', '2');
    await page.click('#addStuApply');
    assert.equal(await page.evaluate(() => __bbj.state().result.assign[6]), 2);
    await page.screenshot({ path: path.join(artifacts, 'pc-quick-move.png') });

    /* ---------------- 모바일: 412px, hasTouch 실제 터치 ---------------- */
    const mobile = await browser.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true, isMobile: true });
    mobile.on('pageerror', e => errors.push(e.message));
    await unlock(mobile);
    await installState(mobile);
    const client = await mobile.context().newCDPSession(mobile);

    // (9) 200ms 길게 누른 뒤 손가락으로 끌기 → 다른 반 카드 위에 놓으면 이동
    const chip = await box(mobile.locator('.stu[data-id="1"]'));
    const drop = await box(mobile.locator('.col[data-k="1"] .colhead'));
    const scrollBefore = await mobile.evaluate(() => window.scrollY);
    await touchStart(client, center(chip));
    await sleep(260);
    assert.equal(await mobile.locator('.stu[data-id="1"].dragging').count(), 1, '길게 누르면 카드가 들려야 한다');
    assert.equal(await mobile.locator('body.stu-drag-active').count(), 1);
    await touchMove(client, center(chip), center(drop));
    assert.equal(await mobile.locator('.stu.drag-ghost').count(), 1);
    assert.match(await mobile.locator('.stu.drag-ghost').innerText(), /끌학생1/);
    assert.equal(await mobile.locator('.col[data-k="1"].drop-on').count(), 1);
    assert.equal(await mobile.evaluate(() => __bbj.cloud.pollBlocked()), true, '끄는 동안 새로고침을 건너뛴다');
    assert.equal(await mobile.evaluate(() => window.scrollY), scrollBefore, '끄는 동안 화면이 따라 흐르지 않는다');
    await mobile.screenshot({ path: path.join(artifacts, 'mobile-touch-drag.png') });
    await touchEnd(client);
    assert.equal(await mobile.evaluate(() => __bbj.state().result.assign[0]), 1);
    assert.equal(await mobile.locator('.stu.drag-ghost,.col.drop-on,body.stu-drag-active').count(), 0);
    assert.equal(await mobile.locator('#addStudentModal').isVisible(), false, '끌고 난 뒤 클릭으로 수정 창이 열리지 않는다');

    // (10) 손가락으로 짧게 탭하면 그대로 학생 정보 수정 창
    await mobile.locator('.stu[data-id="2"] .nm').tap();
    assert.equal(await mobile.locator('#addStudentModal').isVisible(), true);
    assert.equal(await mobile.evaluate(() => __bbj.state().result.assign[1]), 0);
    await mobile.locator('#addStuCancel').tap();

    // (11) 세로로 먼저 쓸면 카드가 아니라 화면이 움직인다
    const scrollY0 = await mobile.evaluate(() => window.scrollY);
    const chip2 = await box(mobile.locator('.stu[data-id="9"]'));
    await touchStart(client, center(chip2));
    await touchMove(client, center(chip2), { x: center(chip2).x, y: center(chip2).y - 120 });
    await touchEnd(client);
    await sleep(120);
    const scrolled = await mobile.evaluate(() => window.scrollY);
    assert.ok(scrolled > scrollY0, '세로 쓸기는 스크롤이어야 한다(' + scrollY0 + '→' + scrolled + ')');
    assert.equal(await mobile.evaluate(() => __bbj.state().result.assign[8]), 2);
    assert.equal(await mobile.locator('.stu.drag-ghost').count(), 0);

    // (12) 손가락으로 고정 학생을 끌면 잠금 안내만 나온다
    await mobile.evaluate(() => { const st = __bbj.state(); st.students[2].fixed = 0; __bbj.renderAll(); });
    await mobile.evaluate(() => window.scrollTo(0, 0));
    await sleep(60);
    const locked = await box(mobile.locator('.stu[data-id="3"]'));
    const drop2 = await box(mobile.locator('.col[data-k="1"] .colhead'));
    await touchStart(client, center(locked));
    await sleep(260);
    await touchMove(client, center(locked), center(drop2));
    await touchEnd(client);
    assert.equal(await mobile.evaluate(() => __bbj.state().result.assign[2]), 0);
    assert.match(await mobile.locator('#toast').innerText(), /고정 학생은 이름을 눌러 고정 반을 바꾼 뒤 옮기세요\./);
    assert.equal(await mobile.locator('.stu.drag-ghost').count(), 0);
    await mobile.evaluate(() => { const st = __bbj.state(); st.students[2].fixed = null; __bbj.renderAll(); });

    // (13) 손가락으로 필수 조합 학생을 옮기면 함께 옮길지 묻고, [예]로 둘 다 이동
    await mobile.evaluate(() => { const st = __bbj.state(); st.requiredGroups = [[1, 2]]; st.result.assign = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]; __bbj.renderAll(); });
    await mobile.evaluate(() => window.scrollTo(0, 0));
    await sleep(60);
    const c1 = await box(mobile.locator('.stu[data-id="1"]'));
    const d1 = await box(mobile.locator('.col[data-k="1"] .colhead'));
    await touchStart(client, center(c1));
    await sleep(260);
    await touchMove(client, center(c1), center(d1));
    await touchEnd(client);
    assert.equal(await mobile.locator('#comboMoveModal').isVisible(), true);
    assert.match(await mobile.locator('#comboMoveText').innerText(), /^필수 조합 끌학생2 학생도 함께 옮기겠습니까\?/);
    await mobile.screenshot({ path: path.join(artifacts, 'mobile-combo-dialog.png') });
    await mobile.locator('#comboMoveNo').tap();
    assert.deepEqual(await mobile.evaluate(() => __bbj.state().result.assign.slice(0, 2)), [0, 0], '아니오는 아무것도 옮기지 않는다');
    await touchStart(client, center(await box(mobile.locator('.stu[data-id="1"]'))));
    await sleep(260);
    await touchMove(client, center(await box(mobile.locator('.stu[data-id="1"]'))), center(await box(mobile.locator('.col[data-k="1"] .colhead'))));
    await touchEnd(client);
    assert.equal(await mobile.locator('#comboMoveModal').isVisible(), true);
    await mobile.locator('#comboMoveYes').tap();
    assert.deepEqual(await mobile.evaluate(() => __bbj.state().result.assign.slice(0, 2)), [1, 1], '예는 조합 학생까지 함께 옮긴다');

    // (14) 옆으로 확실히 끄는 손짓은 길게 누르지 않아도 바로 들린다(태블릿: 반 카드가 옆으로 놓임)
    const land = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    land.on('pageerror', e => errors.push(e.message));
    await unlock(land);
    await installState(land);
    const lclient = await land.context().newCDPSession(land);
    const c4 = await box(land.locator('.stu[data-id="4"] .nm'));
    const d4 = await box(land.locator('.col[data-k="1"] .colhead'));
    await touchStart(lclient, center(c4));
    await touchMove(lclient, center(c4), center(d4), 8);
    assert.equal(await land.locator('.stu[data-id="4"].dragging').count(), 1);
    assert.equal(await land.locator('.col[data-k="1"].drop-on').count(), 1);
    await land.screenshot({ path: path.join(artifacts, 'landscape-touch-drag.png') });
    await touchEnd(lclient);
    assert.equal(await land.evaluate(() => __bbj.state().result.assign[3]), 1);

    // (15) 모바일에서도 수정 창의 `현재 배정 반`으로 옮길 수 있다
    await mobile.locator('.stu[data-id="9"] .nm').tap();
    await mobile.selectOption('#addStuNowClass', '0');
    await mobile.locator('#addStuApply').tap();
    assert.equal(await mobile.evaluate(() => __bbj.state().result.assign[8]), 0);
    await mobile.screenshot({ path: path.join(artifacts, 'mobile-quick-move.png') });

    // (16) 손가락이 화면 위·아래 가장자리(70px)에 닿으면 목록이 스스로 굴러 보이지 않는 반에도 놓을 수 있다
    await mobile.evaluate(() => {
      const st = __bbj.state();
      st.students = Array.from({ length: 36 }, (_, i) => ({ id: i + 1, name: '끌학생' + (i + 1), no: i % 6 + 1, g4: '', g5: (i % 6 + 1) + '반', gender: i % 2 ? '여' : '남', tags: [], w: {}, fixed: null }));
      st.classes = Array.from({ length: 6 }, (_, i) => ({ name: '반' + (i + 1), total: 6, male: 3, female: 3, special: false }));
      st.requiredGroups = []; st.nextId = 37; st.result = { assign: st.students.map((_, i) => Math.floor(i / 6)), ids: st.students.map((_, i) => i + 1), moves: 0 };
      __bbj.renderAll();
    });
    await mobile.evaluate(() => window.scrollTo(0, 0));
    await sleep(80);
    const c6 = center(await box(mobile.locator('.stu[data-id="1"]')));
    await touchStart(client, c6);
    await sleep(240);
    await touchMove(client, c6, { x: c6.x, y: 886 }, 6);       /* 아래 가장자리 */
    const scrollMid = await mobile.evaluate(() => window.scrollY);
    await sleep(700);
    const scrollLater = await mobile.evaluate(() => window.scrollY);
    assert.ok(scrollLater > scrollMid + 20, '끌고 있는 동안 아래 가장자리에서 화면이 굴러야 한다(' + scrollMid + '→' + scrollLater + ')');
    assert.equal(await mobile.locator('.stu[data-id="1"].dragging').count(), 1, '굴러도 카드는 그대로 들려 있어야 한다');
    const visible = await mobile.locator('.col[data-k]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { k: Number(e.dataset.k), top: r.top, bottom: r.bottom, mid: r.left + r.width / 2 }; }).filter(r => r.top > 60 && r.bottom < 880));
    assert.ok(visible.length, '굴러간 뒤 화면 안에 다른 반 카드가 보여야 한다');
    const pick = visible[0];
    const deeper = await mobile.evaluate(() => window.scrollY);
    assert.ok(deeper > 100, '아래 쪽 반까지 굴러간다(' + deeper + ')');
    await touchMove(client, { x: c6.x, y: 880 }, { x: pick.mid, y: (pick.top + pick.bottom) / 2 }, 6);
    assert.equal(await mobile.locator('.col[data-k="' + pick.k + '"].drop-on').count(), 1);
    await mobile.screenshot({ path: path.join(artifacts, 'mobile-edge-autoscroll.png') });
    await touchEnd(client);
    assert.equal(await mobile.evaluate(() => __bbj.state().result.assign[0]), pick.k);
    assert.equal(await mobile.locator('.drag-ghost,.col.drop-on').count(), 0);
    // 끌기가 끝나면 자동 스크롤 타이머(rAF)도 멈춘다: 가만히 있어도 화면이 더 굴러가지 않는다
    const restY = await mobile.evaluate(() => window.scrollY);
    await sleep(500);
    assert.equal(await mobile.evaluate(() => window.scrollY), restY, '드래그가 끝나면 자동 스크롤이 멈춰야 한다');

    // (17) 위 가장자리로 끌면 위로 굴러간다
    const upChip = await mobile.locator('.stu[data-id="' + (pick.k * 6 + 1) + '"]').boundingBox();
    if (upChip && upChip.y > 80 && upChip.y < 860) {
      const from = center(upChip);
      await touchStart(client, from);
      await sleep(240);
      await touchMove(client, from, { x: from.x, y: 8 }, 6);    /* 위 가장자리 */
      const upA = await mobile.evaluate(() => window.scrollY);
      await sleep(600);
      const upB = await mobile.evaluate(() => window.scrollY);
      assert.ok(upB < upA - 20, '위 가장자리에서는 화면이 위로 굴러야 한다(' + upA + '→' + upB + ')');
      await touchEnd(client);
      assert.equal(await mobile.locator('.drag-ghost').count(), 0);
    }

    assert.deepEqual(errors, []);
    console.log('PASS Chromium: PC 이름 글자 위 마우스 드래그와 클릭 구분(6px), 카드 여백 드래그, 고정 학생 잠금·필수 조합 확인, 수정 창 빠른 반 이동, 모바일 412px 터치 롱프레스·가로 드래그·세로 스크롤 구분, 드래그 중 폴링 건너뛰기와 고스트·drop-on 표시, 터치 고정 잠금과 조합 팝업. Screenshots: ' + artifacts);
  } catch (err) {
    console.error('FAIL', err && err.stack || err);
    console.error('Screenshots:', artifacts);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
