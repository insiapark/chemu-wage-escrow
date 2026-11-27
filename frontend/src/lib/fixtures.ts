import type { DemoState } from "./types";

export const DEMO = {
  workDate: "2026-11-29",
  checkIn: "2026-11-29T22:00:00+09:00",
  checkOut: "2026-11-30T08:00:00+09:00",
  hourlyWage: 10_320,
  dailyWage: 92_880,
  weeklyAllowance: 37_152,
  payroll: 984_528,
  // Eight previous nine-hour shifts + four weekly allowances. The ninth shift is interactive.
  priorLocked: 891_648,
  initialAvailable: 450_000,
} as const;

export function createInitialState(): DemoState {
  return {
    version: 1,
    contract: {
      id: "contract-a-202611", workerName: "A님", storeName: "새싹편의점 연희점",
      hourlyWage: DEMO.hourlyWage, breakMinutes: 60, weeklyHours: 18,
      includesWeeklyAllowance: false, status: "draft", revision: 0,
    },
    attendance: {
      id: "attendance-a-20261129", workDate: DEMO.workDate,
      checkIn: null, checkOut: null, breakMinutes: 60,
      hourlyWage: DEMO.hourlyWage, wage: DEMO.dailyWage, nonce: 0, status: "scheduled",
    },
    available: DEMO.initialAvailable, locked: DEMO.priorLocked, received: 0,
    priorLocked: DEMO.priorLocked, payrollAmount: DEMO.payroll,
    payday: "2026-12-10T09:00:00+09:00", signatures: {}, usedNonces: [],
    participants: {
      worker: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      employer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    },
    receipts: [], events: [], recordHash: null, sealedRecord: null,
  };
}
