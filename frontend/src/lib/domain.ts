import { DEMO } from "./fixtures";
import { monthDay, won } from "./format";
import type { DemoCommand, DemoState } from "./types";

export class DemoError extends Error {
  constructor(message: string) { super(message); this.name = "DemoError"; }
}
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DemoError(message);
}
export function dailyWage(checkIn: string, checkOut: string, breakMinutes: number, hourlyWage: number) {
  const minutes = (Date.parse(checkOut) - Date.parse(checkIn)) / 60_000 - breakMinutes;
  requireCondition(Number.isFinite(minutes) && minutes > 0 && minutes <= 1_440, "근무 시간을 확인해 주세요.");
  requireCondition(Number.isSafeInteger(hourlyWage) && hourlyWage > 0, "시급을 확인해 주세요.");
  return Math.round(minutes / 60 * hourlyWage);
}
export function weeklyAllowance(hours: number, wage: number) {
  return hours >= 15 ? Math.round(Math.min(hours, 40) / 40 * 8 * wage) : 0;
}
export function transition(current: DemoState, command: DemoCommand, timestamp = new Date().toISOString()): DemoState {
  const s = structuredClone(current);
  let message = "";
  const receipt = (kind: "deposit" | "lock" | "release", amount: number) => {
    s.receipts.unshift({ id: `mock:${kind}:${s.receipts.length + 1}`, kind, amount, createdAt: timestamp, mode: "mock" });
  };
  switch (command.type) {
    case "set-participants":
      requireCondition(!s.signatures.worker && !s.signatures.employer && !["locked", "paid"].includes(s.attendance.status), "서명하기 전에 지갑 주소를 설정해 주세요.");
      requireCondition(command.worker.toLowerCase() !== command.employer.toLowerCase(), "두 사람의 지갑 주소가 달라야 해요.");
      s.participants = { worker: command.worker, employer: command.employer };
      message = "시연에서 서명할 두 사람의 지갑 주소를 바꿨어요";
      break;
    case "submit-contract": {
      requireCondition(["draft", "revision-requested"].includes(s.contract.status), "이미 보낸 계약이에요.");
      requireCondition(command.hourlyWage === DEMO.hourlyWage, "이번 시연은 시급 10,320원으로 진행해요.");
      s.contract.hourlyWage = command.hourlyWage;
      s.contract.includesWeeklyAllowance = command.includesWeeklyAllowance;
      s.contract.status = "review";
      s.contract.revision += 1;
      message = s.contract.revision > 1 && command.includesWeeklyAllowance ? "사장님이 계약서에 주휴수당을 넣었어요" : "사장님이 근로계약을 보냈어요";
      break;
    }
    case "request-revision":
      requireCondition(s.contract.status === "review", "확인할 계약이 없어요.");
      s.contract.status = "revision-requested";
      message = "A님이 계약을 고쳐 달라고 요청했어요";
      break;
    case "agree-contract":
      requireCondition(s.contract.status === "review", "확인할 계약이 없어요.");
      requireCondition(s.contract.includesWeeklyAllowance, "주휴수당이 들어간 계약을 받으면 확정할 수 있어요.");
      s.contract.status = "agreed";
      message = "계약이 확정됐어요";
      break;
    case "check-in":
      requireCondition(s.contract.status === "agreed", "근로계약을 먼저 확정해 주세요.");
      requireCondition(s.attendance.status === "scheduled", "이미 출근 기록이 있어요.");
      requireCondition(Number.isFinite(command.distance) && command.distance >= 0 && command.distance <= 30, "가게 30m 안에서 출근할 수 있어요.");
      s.attendance.checkIn = DEMO.checkIn;
      s.attendance.status = "working";
      message = "A님이 오후 10:00에 출근했어요";
      break;
    case "check-out":
      requireCondition(s.attendance.status === "working", "출근 기록을 먼저 남겨 주세요.");
      requireCondition(Number.isFinite(command.distance) && command.distance >= 0 && command.distance <= 30, "가게 30m 안에서 퇴근할 수 있어요.");
      s.attendance.checkOut = DEMO.checkOut;
      s.attendance.wage = dailyWage(s.attendance.checkIn!, DEMO.checkOut, s.attendance.breakMinutes, s.attendance.hourlyWage);
      s.attendance.status = "pending";
      message = "A님이 오전 8:00에 퇴근했어요. 근무를 확정해 주세요";
      break;
    case "deposit":
      requireCondition(Number.isSafeInteger(command.amount) && command.amount > 0 && command.amount <= 10_000_000, "1원부터 1,000만 원까지 정수로 입력해 주세요.");
      s.available += command.amount;
      receipt("deposit", command.amount);
      message = `${won(command.amount)}을 연습 보관함에 채웠어요`;
      break;
    case "sign": {
      requireCondition(s.attendance.status === "pending", "퇴근한 기록에 서명할 수 있어요.");
      requireCondition(!s.usedNonces.includes(s.attendance.nonce), "이미 사용한 확정 서명이에요.");
      const other = s.signatures[command.role === "worker" ? "employer" : "worker"];
      requireCondition(!other || other.payloadDigest === command.value.payloadDigest, "두 사람이 같은 기록에 서명해야 해요.");
      requireCondition(!other || other.address.toLowerCase() !== command.value.address.toLowerCase(), "알바생과 사장님은 서로 다른 지갑으로 서명해 주세요.");
      s.signatures[command.role] = command.value;
      message = `${command.role === "worker" ? "A님" : "사장님"}의 ${command.value.mode === "sample" ? "연습 " : "지갑 "}서명을 확인했어요`;
      break;
    }
    case "lock":
      requireCondition(s.attendance.status === "pending", "확정 대기 중인 근무가 없어요.");
      requireCondition(s.signatures.worker && s.signatures.employer, "두 사람의 근무 기록 서명이 필요해요.");
      requireCondition(!s.usedNonces.includes(s.attendance.nonce), "이미 확정한 근무예요.");
      requireCondition(s.available >= s.attendance.wage, `채워 둔 돈이 모자라요. ${won(s.attendance.wage - s.available)}을 더 채우면 돼요.`);
      requireCondition(/^[0-9a-f]{64}$/.test(command.recordHash), "기록 지문을 다시 만들어 주세요.");
      s.available -= s.attendance.wage;
      s.locked += s.attendance.wage;
      s.attendance.status = "locked";
      s.usedNonces.push(s.attendance.nonce);
      s.recordHash = command.recordHash;
      s.sealedRecord = command.sealedRecord;
      receipt("lock", s.attendance.wage);
      message = `사장님이 ${monthDay(s.attendance.workDate)} 근무를 확정했어요. 체무가 ${won(s.attendance.wage)}을 보관했어요`;
      break;
    case "set-payday":
      requireCondition(s.received === 0, "이미 입금된 시연이에요. 처음부터 시작해 주세요.");
      requireCondition(Number.isFinite(Date.parse(command.value)), "급여일 시각을 확인해 주세요.");
      s.payday = command.value;
      message = "발표용 급여 시각을 바꿨어요";
      break;
    case "release":
      requireCondition(s.attendance.status === "locked", "오늘 일당을 먼저 보관해 주세요.");
      requireCondition(Number.isFinite(Date.parse(command.now)) && Date.parse(command.now) >= Date.parse(s.payday), "아직 급여일이 아니에요. 보관된 돈은 그대로 남아요.");
      requireCondition(s.locked > 0 && s.received === 0, "이미 입금된 급여예요.");
      s.received = s.locked;
      s.locked = 0;
      s.attendance.status = "paid";
      receipt("release", s.received);
      message = `월급 ${won(s.received)}이 들어왔어요`;
      break;
  }
  s.events.unshift({ id: `event:${s.events.length + 1}`, message, createdAt: timestamp });
  return s;
}
