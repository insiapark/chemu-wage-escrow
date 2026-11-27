import type { Address, Hex } from "viem";

export type Role = "worker" | "employer";
export type SignatureMode = "sample" | "wallet";
export type AttendanceStatus = "scheduled" | "working" | "pending" | "locked" | "paid";
export interface Contract {
  id: string;
  workerName: string;
  storeName: string;
  hourlyWage: number;
  breakMinutes: number;
  weeklyHours: number;
  includesWeeklyAllowance: boolean;
  status: "draft" | "review" | "revision-requested" | "agreed";
  revision: number;
}
export interface AttendanceRecord {
  id: string;
  workDate: string;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number;
  hourlyWage: number;
  wage: number;
  nonce: number;
  status: AttendanceStatus;
}
export interface SignedAttendance {
  worker: Address;
  employer: Address;
  workDate: bigint;
  checkIn: bigint;
  checkOut: bigint;
  wage: bigint;
  nonce: bigint;
}
export interface AttendanceSignature {
  address: Address;
  signature: Hex;
  payloadDigest: Hex;
  mode: SignatureMode;
}
export interface Receipt {
  id: string;
  kind: "deposit" | "lock" | "release";
  amount: number;
  createdAt: string;
  mode: "mock";
}
export interface AuditEvent {
  id: string;
  message: string;
  createdAt: string;
}
export interface DemoState {
  version: 1;
  contract: Contract;
  attendance: AttendanceRecord;
  available: number;
  locked: number;
  received: number;
  priorLocked: number;
  payrollAmount: number;
  payday: string;
  signatures: Partial<Record<Role, AttendanceSignature>>;
  participants: Record<Role, Address>;
  usedNonces: number[];
  receipts: Receipt[];
  events: AuditEvent[];
  recordHash: string | null;
  sealedRecord: string | null;
}
export interface VerificationBundle {
  format: "chemu-attendance-v1";
  record: Record<string, unknown>;
  sha256: string;
  anchoring: "browser-local-mock";
}
export type DemoCommand =
  | { type: "submit-contract"; hourlyWage: number; includesWeeklyAllowance: boolean }
  | { type: "request-revision" }
  | { type: "agree-contract" }
  | { type: "check-in"; distance: number }
  | { type: "check-out"; distance: number }
  | { type: "deposit"; amount: number }
  | { type: "sign"; role: Role; value: AttendanceSignature }
  | { type: "lock"; recordHash: string; sealedRecord: string }
  | { type: "release"; now: string }
  | { type: "set-payday"; value: string }
  | { type: "set-participants"; worker: Address; employer: Address };
