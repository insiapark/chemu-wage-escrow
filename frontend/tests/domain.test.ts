import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState, DEMO } from "../src/lib/fixtures";
import { dailyWage, transition, weeklyAllowance } from "../src/lib/domain";
import { MockEscrowGateway } from "../src/lib/gateway";
import { sampleSignature } from "../src/lib/signatures";
import { canonicalJson, exportBundle, sha256, verifyBundle } from "../src/lib/verification";

function setup(available = DEMO.initialAvailable as number) {
  let state = createInitialState();
  state.available = available;
  const repo = { read: () => state, write: (next: typeof state) => { state = next; } };
  return { repo, api: new MockEscrowGateway(repo, 0) };
}
async function pending(api: MockEscrowGateway) {
  await api.execute({ type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: true });
  await api.execute({ type: "agree-contract" });
  await api.execute({ type: "check-in", distance: 12 });
  await api.execute({ type: "check-out", distance: 12 });
}
async function signed(api: MockEscrowGateway) {
  await pending(api);
  await api.signSample("worker");
  await api.signSample("employer");
}

test("fixture reconciles nine shifts, four weekly allowances, and today's increment", () => {
  assert.equal(dailyWage(DEMO.checkIn, DEMO.checkOut, 60, DEMO.hourlyWage), 92_880);
  assert.equal(weeklyAllowance(18, DEMO.hourlyWage), 37_152);
  assert.equal(weeklyAllowance(14, DEMO.hourlyWage), 0);
  assert.equal(9 * DEMO.dailyWage + 4 * DEMO.weeklyAllowance, DEMO.payroll);
  assert.equal(DEMO.priorLocked + DEMO.dailyWage, DEMO.payroll);
});
test("contract revision is necessary before agreement when allowance is missing", async () => {
  const { api, repo } = setup();
  await api.execute({ type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: false });
  await assert.rejects(api.execute({ type: "agree-contract" }), /주휴수당/);
  await api.execute({ type: "request-revision" });
  await api.execute({ type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: true });
  await api.execute({ type: "agree-contract" });
  assert.equal(repo.read().contract.revision, 2);
});
test("check-in requires an agreed contract and a finite distance within 30m", () => {
  let s = createInitialState();
  assert.throws(() => transition(s, { type: "check-in", distance: 12 }), /근로계약/);
  s = transition(s, { type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: true });
  s = transition(s, { type: "agree-contract" });
  for (const distance of [31, -1, NaN, Infinity]) assert.throws(() => transition(s, { type: "check-in", distance }), /30m/);
  const next = transition(s, { type: "check-in", distance: 30 });
  assert.equal(next.attendance.status, "working");
  assert.equal(s.attendance.status, "scheduled");
});
test("complete signed flow locks exactly once and releases only at payday", async () => {
  const { api, repo } = setup();
  await signed(api);
  await api.lock();
  assert.equal(repo.read().available, 357_120);
  assert.equal(repo.read().locked, DEMO.payroll);
  assert.deepEqual(repo.read().usedNonces, [0]);
  await assert.rejects(api.lock(), /확정 대기/);
  await assert.rejects(api.execute({ type: "release", now: "2026-12-10T08:59:59+09:00" }), /급여일/);
  await api.execute({ type: "release", now: "2026-12-10T09:00:00+09:00" });
  assert.equal(repo.read().received, DEMO.payroll);
  assert.equal(repo.read().locked, 0);
  await assert.rejects(api.execute({ type: "release", now: "2026-12-10T09:00:01+09:00" }));
});
test("insufficient funds leave record and money unchanged; deposit enables retry", async () => {
  const { api, repo } = setup(0);
  await signed(api);
  const before = structuredClone(repo.read());
  await assert.rejects(api.lock(), /모자라요/);
  assert.deepEqual(repo.read(), before);
  await api.execute({ type: "deposit", amount: 100_000 });
  await api.lock();
  assert.equal(repo.read().available, 7_120);
});
test("unsigned or altered records cannot be confirmed", async () => {
  const { api, repo } = setup();
  await pending(api);
  await assert.rejects(api.lock(), /두 사람/);
  await api.signSample("worker");
  await api.signSample("employer");
  repo.write({ ...repo.read(), attendance: { ...repo.read().attendance, wage: 1 } });
  await assert.rejects(api.lock(), /서명한 지갑/);
});
test("role substitution and fabricated signature digests are rejected", async () => {
  const { api, repo } = setup();
  await pending(api);
  const value = await sampleSignature(repo.read(), "worker");
  await assert.rejects(api.execute({ type: "sign", role: "employer", value }), /서명한 지갑/);
  await assert.rejects(api.execute({ type: "sign", role: "worker", value: { ...value, payloadDigest: `0x${"0".repeat(64)}` } }), /기록이 달라/);
});
test("concurrent confirmations cannot double debit the mock balance", async () => {
  const { api, repo } = setup();
  await signed(api);
  const results = await Promise.allSettled([api.lock(), api.lock()]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(repo.read().receipts.filter(r => r.kind === "lock").length, 1);
});
test("failed requests preserve state and the next retry succeeds", async () => {
  const { api, repo } = setup();
  const before = structuredClone(repo.read());
  api.failNext();
  await assert.rejects(api.execute({ type: "deposit", amount: 100_000 }), /다시 시도/);
  assert.deepEqual(repo.read(), before);
  await api.execute({ type: "deposit", amount: 100_000 });
  assert.equal(repo.read().available, 550_000);
});
test("deposits reject invalid numbers", async () => {
  const { api } = setup();
  for (const amount of [0, -1, 0.5, NaN, Infinity, 10_000_001]) await assert.rejects(api.execute({ type: "deposit", amount }));
});
test("separate reference hash detects changes even when file hash is rewritten", async () => {
  const { api, repo } = setup();
  await signed(api);
  await api.lock();
  const bundle = exportBundle(repo.read());
  let result = await verifyBundle(JSON.stringify(bundle), repo.read().recordHash);
  assert.equal(result.referenceMatches, true);
  (bundle.record.attendance as Record<string, unknown>).wage = 1;
  result = await verifyBundle(JSON.stringify(bundle), repo.read().recordHash);
  assert.equal(result.fileMatches, false);
  bundle.sha256 = await sha256(canonicalJson(bundle.record));
  result = await verifyBundle(JSON.stringify(bundle), repo.read().recordHash);
  assert.equal(result.fileMatches, true);
  assert.equal(result.referenceMatches, false);
  result = await verifyBundle(JSON.stringify(bundle), null);
  assert.equal(result.referenceMatches, null);
});
test("verification rejects malformed and oversized files", async () => {
  for (const file of ["null", "{", "{}", " ".repeat(1_000_001)]) await assert.rejects(verifyBundle(file, null));
});
