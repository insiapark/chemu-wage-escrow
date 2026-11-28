import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState, DEMO } from "../src/lib/fixtures";
import { transition } from "../src/lib/domain";
import { MockEscrowGateway } from "../src/lib/gateway";
import { demoStep, isDemoView, secondsUntil } from "../src/lib/demo-steps";
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
test("lock and payday events say who did what: 사장님 확정, 체무 보관, 월급 들어옴", async () => {
  let state = createInitialState();
  const repo = { read: () => state, write: (next: typeof state) => { state = next; } };
  const api = new MockEscrowGateway(repo, 0);
  await api.execute({ type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: true });
  await api.execute({ type: "agree-contract" });
  await api.execute({ type: "check-in", distance: 12 });
  await api.execute({ type: "check-out", distance: 12 });
  await api.signSample("worker");
  await api.signSample("employer");
  await api.lock();
  assert.equal(state.events[0].message, "사장님이 11월 29일 근무를 확정했어요. 체무가 92,880원을 보관했어요");
  await api.execute({ type: "release", now: state.payday });
  assert.equal(state.events[0].message, "월급 984,528원이 들어왔어요");
  for (const event of state.events) assert.doesNotMatch(event.message, /₩|동의|수정|휴게/);
});
test("short funds say exactly how much more to fill", () => {
  const s = createInitialState();
  s.available = 80_000; s.contract.status = "agreed"; s.attendance.status = "pending";
  s.signatures = { worker: {} as never, employer: {} as never };
  assert.throws(() => transition(s, { type: "lock", recordHash: "a".repeat(64), sealedRecord: "{}" }), /12,880원을 더 채우면 돼요/);
});
test("payday timer in a second window does not error after the first window paid", async () => {
  let state = createInitialState();
  const repo = { read: () => state, write: (next: typeof state) => { state = next; } };
  const api = new MockEscrowGateway(repo, 0);
  await api.execute({ type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: true });
  await api.execute({ type: "agree-contract" });
  await api.execute({ type: "check-in", distance: 12 });
  await api.execute({ type: "check-out", distance: 12 });
  await api.signSample("worker");
  await api.signSample("employer");
  await api.lock();
  await assert.rejects(api.releaseDue("2026-12-10T08:59:00+09:00"), /급여일/);
  const [first, second] = await Promise.all([api.releaseDue(state.payday), api.releaseDue(state.payday)]);
  assert.equal(first.received, DEMO.payroll);
  assert.equal(second.received, DEMO.payroll);
  assert.equal(state.receipts.filter(r => r.kind === "release").length, 1);
});
test("presenter step follows the 8-step script from shared state alone", () => {
  let s = createInitialState();
  const seen: string[] = [];
  const mark = () => { const d = demoStep(s); seen.push(`${d.number}:${d.role ?? "-"}:${d.view}${d.done ? ":done" : ""}`); };
  mark();
  s = transition(s, { type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: false }); mark();
  s = transition(s, { type: "request-revision" }); mark();
  s = transition(s, { type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: true }); mark();
  s = transition(s, { type: "agree-contract" }); mark();
  s = transition(s, { type: "check-in", distance: 12 }); mark();
  s = transition(s, { type: "check-out", distance: 12 }); mark();
  s.signatures.worker = {} as never; mark();
  s.signatures.employer = {} as never;
  s = transition(s, { type: "lock", recordHash: "a".repeat(64), sealedRecord: "{}" }); mark();
  s = transition(s, { type: "set-payday", value: "2026-11-29T10:00:20+09:00" }); mark();
  s = transition(s, { type: "release", now: "2026-11-29T10:00:21+09:00" }); mark();
  assert.deepEqual(seen, [
    "1:employer:contract", "2:worker:contract", "3:employer:contract", "4:worker:contract",
    "5:worker:clock", "5:worker:clock", "5:worker:clock", "6:employer:clock",
    "7:-:verify", "8:worker:pay", "8:worker:pay:done",
  ]);
  assert.equal(secondsUntil("2026-11-29T10:00:20+09:00", Date.parse("2026-11-29T10:00:00.500+09:00")), 20);
  assert.equal(secondsUntil("2026-11-29T10:00:20+09:00", Date.parse("2026-11-29T10:05:00+09:00")), 0);
  assert.ok(isDemoView("verify"));
  assert.ok(!isDemoView("admin"));
});
