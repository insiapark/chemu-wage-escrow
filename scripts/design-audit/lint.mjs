// usage: node lint.mjs <dump json> [owner]
// Checks screen copy dumped by textdump.mjs against the 체무 copy rules.
import fs from 'fs';
const [file, mode] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
const banned = ['해당', '진행', '관련', '하실 수 있습니다', '확인 부탁', '취소', '디지털 원화', '락업', '베스팅', '예치', '컨트랙트', '토큰', '반드시', '즉시', '불이익', '혹시', '앞으로'];
if (mode === 'owner') banned.push('보관함 잔액', '잔액');
const prefer = [['가게 근처', '가게 30m 안'], ['지급', '입금'], ['체불', '(화면에서는 "안 들어온 돈")']];
const formal = /(습니다|십시오|하시겠|되었|처리됩|바랍니다)/;
const okButtons = new Set(['확인', '다음', '닫기', '다음에', '오늘', '기록', '급여', '나', '알바생', '보관함', '전체', '전체 보기', '자세히 보기', '모두 읽음', '이번 달', '최근 3개월', '전체 기간', '11월', '올해', '1', '2', '3']);
const amounts = new Set(['0', '10,320', '10,500', '92,880', '87,720', '5,160', '37,152', '74,304', '148,608', '459,240', '533,544', '835,920', '984,528', '979,368', '743,040', '891,648', '42,000', '126,000', '168,000', '588,000', '1,092,000', '924,000', '504,000', '84,000', '450,000', '222,912', '357,120', '227,088', '672,912', '445,824', '185,760', '41,280', '206,400', '247,680', '718,272', '268,272', '619,200', '123,840', '2,019,624', '866,880', '165,120', '1,032,000', '3,048,528', '103,200', '371,520', '1,600,000', '1,090,000', '756,000', '478,848', '626,424']);
const report = [];
const unknownAmt = new Map();
for (const it of items) {
  const lines = it.text.split('\n');
  const issues = [];
  for (const raw of lines) {
    const isBtn = raw.includes('[버튼] ');
    const line = raw.replace(/\[(버튼|제목|시트|대화창)\] /g, '');
    for (const b of banned) if (line.includes(b)) issues.push(`금지어 "${b}": ${line}`);
    for (const [w, p] of prefer) if (line.includes(w)) issues.push(`바꿀 말 "${w}" → ${p}: ${line}`);
    if (/[—–]/.test(line)) issues.push(`대시: ${line}`);
    if (formal.test(line)) issues.push(`격식체/피동: ${line}`);
    if (/[\u{1F300}-\u{1FAFF}]/u.test(line)) issues.push(`이모지: ${line}`);
    if (isBtn) {
      const t = line.trim();
      const first = t.split(/ (?=[가-힣A-Za-z0-9₩]+[요다]\b)/)[0];
      const ok = /기$/.test(t) || /기$/.test(first) || okButtons.has(t) || /^\d+$/.test(t) ||
        /^(확인 필요|보관 중|보관됨|확정 대기|출퇴근)( \d+)?$/.test(t) || /(있어요|중이에요)$/.test(t) || /^(출근|퇴근)하기 /.test(t);
      if (!ok) issues.push(`버튼 문법: "${t}"`);
    }
    for (const m of line.matchAll(/₩\s?(\d{1,3}(?:,\d{3})*)|(\d{1,3}(?:,\d{3})+)원/g)) {
      const v = m[1] || m[2];
      if (!amounts.has(v)) { issues.push(`확인할 금액 ${v}: ${line}`); unknownAmt.set(v, (unknownAmt.get(v) || 0) + 1); }
    }
  }
  if (issues.length) report.push(`## ${String(it.i).padStart(2, '0')} ${it.label}\n` + issues.map(s => '- ' + s).join('\n'));
}
console.log(report.join('\n\n') || '문제 없음');
if (unknownAmt.size) console.log('\n확인할 금액 모음: ' + [...unknownAmt].map(([k, v]) => `${k}(${v})`).join(', '));
