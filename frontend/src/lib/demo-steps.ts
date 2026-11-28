import { createInitialState } from "./fixtures";
import type { DemoState, Role } from "./types";

export type DemoView = "today" | "contract" | "clock" | "vault" | "pay" | "verify";
export const DEMO_VIEWS: readonly DemoView[] = ["today", "contract", "clock", "vault", "pay", "verify"];
export const DEMO_STEP_COUNT = 8;
export interface DemoStep {
  number: number;
  /** Role whose screen the presenter shows; null keeps the current role. */
  role: Role | null;
  view: DemoView;
  task: string;
  done: boolean;
}

const DEFAULT_PAYDAY = createInitialState().payday;

/** Where the 8-step presentation script currently is, derived only from the shared demo state. */
export function demoStep(state: DemoState): DemoStep {
  const c = state.contract;
  const a = state.attendance.status;
  const step = (number: number, role: Role | null, view: DemoView, task: string, done = false): DemoStep => ({ number, role, view, task, done });
  if (c.status === "draft") return step(1, "employer", "contract", "주휴수당을 빼고 근로계약 보내기");
  if (c.status === "review" && !c.includesWeeklyAllowance) return step(2, "worker", "contract", "빠진 주휴수당을 보고 고쳐 달라고 요청하기");
  if (c.status === "revision-requested") return step(3, "employer", "contract", "주휴수당 넣고 다시 보내기");
  if (c.status === "review") return step(4, "worker", "contract", "계약 확정하기");
  if (a === "scheduled") return step(5, "worker", "clock", "가게 30m 안에서 출근하기");
  if (a === "working") return step(5, "worker", "clock", "퇴근 기록하기");
  if (a === "pending" && !state.signatures.worker) return step(5, "worker", "clock", "퇴근 기록에 서명하기");
  if (a === "pending") return step(6, "employer", "clock", "같은 기록에 서명하고 확정하기");
  if (a === "locked" && state.payday === DEFAULT_PAYDAY) return step(7, null, "verify", "기록을 불러와 맞춰 보고 일당 한 글자 고치기");
  if (a === "locked") return step(8, "worker", "pay", "급여일이 되면 누르지 않아도 들어와요");
  return step(8, "worker", "pay", "월급이 들어왔어요. 처음부터 다시 할 수 있어요", true);
}

/** Whole seconds until payday, never negative. */
export function secondsUntil(payday: string, now: number) {
  return Math.max(0, Math.ceil((Date.parse(payday) - now) / 1000));
}

export function isDemoView(value: unknown): value is DemoView {
  return typeof value === "string" && (DEMO_VIEWS as readonly string[]).includes(value);
}
