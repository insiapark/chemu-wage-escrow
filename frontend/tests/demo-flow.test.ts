import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO } from "../src/lib/fixtures";
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
