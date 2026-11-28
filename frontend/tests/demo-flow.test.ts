import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState, DEMO } from "../src/lib/fixtures";
import { transition } from "../src/lib/domain";
import { monthDay, monthDayWeekday, won } from "../src/lib/format";

test("money is written as 92,880원, never with the won sign", () => {
  assert.equal(won(DEMO.dailyWage), "92,880원");
  assert.equal(won(DEMO.weeklyAllowance), "37,152원");
  assert.equal(won(DEMO.payroll), "984,528원");
  assert.equal(won(0), "0원");
  assert.doesNotMatch(won(DEMO.payroll), /₩/);
});
test("demo dates follow the screen format in Seoul time", () => {
  assert.equal(monthDay(DEMO.workDate), "11월 29일");
  assert.equal(monthDayWeekday(DEMO.workDate), "11월 29일 일요일");
});
test("contract events use the design words: 고쳐 달라고 요청, 계약 확정", () => {
  let s = createInitialState();
  s = transition(s, { type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: false });
  s = transition(s, { type: "request-revision" });
  s = transition(s, { type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: true });
  s = transition(s, { type: "agree-contract" });
  assert.deepEqual(s.events.map(e => e.message).reverse(), [
    "사장님이 근로계약을 보냈어요",
    "A님이 계약을 고쳐 달라고 요청했어요",
    "사장님이 계약서에 주휴수당을 넣었어요",
    "계약이 확정됐어요",
  ]);
  assert.throws(() => transition(createInitialState(), { type: "check-in", distance: 12 }), /근로계약을 먼저 확정해 주세요/);
});
