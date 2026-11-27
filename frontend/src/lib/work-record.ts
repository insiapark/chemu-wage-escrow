import { hashTypedData, isAddress, isAddressEqual, recoverTypedDataAddress, zeroAddress, type Address, type Hex } from "viem";
import { CHAIN } from "./chain-config";
import { dailyWage } from "./domain";
import { canonicalJson, sha256 } from "./verification";

export const workRecordTypes = { WorkRecord: [
  { name: "employer", type: "address" }, { name: "employee", type: "address" },
  { name: "grossWage", type: "uint256" }, { name: "payday", type: "uint64" },
  { name: "workRecordHash", type: "bytes32" }, { name: "nonce", type: "uint256" },
] } as const;
export interface OriginalWorkRecord {
  schema: "chemu-work-record-v1";
  employer: Address;
  employee: Address;
  contract: { hourlyWage: number; weeklyHours: number; includesWeeklyAllowance: boolean };
  attendance: { workDate: string; checkIn: string; checkOut: string; breakMinutes: number };
  grossWage: number;
  payday: string;
}
export interface WorkRecord {
  employer: Address; employee: Address; grossWage: bigint; payday: bigint; workRecordHash: Hex; nonce: bigint;
}
export type StoredWorkRecord = Omit<WorkRecord, "grossWage" | "payday" | "nonce"> & { grossWage: string; payday: string; nonce: string };
export type ChainRole = "employer" | "employee";
export interface PreparedWork {
  original: OriginalWorkRecord;
  record: StoredWorkRecord;
  signatures: Partial<Record<ChainRole, Hex>>;
  recordId: Hex;
}
export interface WorkBundle extends PreparedWork {
  format: "chemu-sepolia-work-v1";
  chainId: number;
  escrow: Address;
}
export function validateParticipants(employer: string, employee: string) {
  if (!isAddress(employer) || !isAddress(employee) || isAddressEqual(employer, zeroAddress) || isAddressEqual(employee, zeroAddress)) throw new Error("두 사람의 올바른 지갑 주소를 입력해 주세요.");
  if (isAddressEqual(employer, employee)) throw new Error("사장님과 알바생 지갑은 서로 달라야 해요.");
}
export function restoreWorkRecord(record: StoredWorkRecord): WorkRecord {
  return { ...record, grossWage: BigInt(record.grossWage), payday: BigInt(record.payday), nonce: BigInt(record.nonce) };
}
export function workTypedData(record: WorkRecord) {
  return { domain: CHAIN.domain, types: workRecordTypes, primaryType: "WorkRecord" as const, message: record };
}
export async function prepareWork(original: OriginalWorkRecord, nonce: bigint): Promise<PreparedWork> {
  validateParticipants(original.employer, original.employee);
  if (!original.contract.includesWeeklyAllowance) throw new Error("주휴수당이 포함된 계약에 동의한 뒤 준비해 주세요.");
  const wage = dailyWage(original.attendance.checkIn, original.attendance.checkOut, original.attendance.breakMinutes, original.contract.hourlyWage);
  if (wage !== original.grossWage) throw new Error("근무 시간으로 계산한 일당과 보관 금액이 달라요.");
  const seconds = Math.floor(Date.parse(original.payday) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 0 || nonce < 0n) throw new Error("급여일이나 nonce를 확인해 주세요.");
  // Signatures are deliberately excluded: hash original -> sign hash -> submit both signatures.
  const record: WorkRecord = {
    employer: original.employer, employee: original.employee, grossWage: BigInt(wage),
    payday: BigInt(seconds), nonce, workRecordHash: `0x${await sha256(canonicalJson(original))}`,
  };
  return {
    original, record: { ...record, grossWage: String(record.grossWage), payday: String(record.payday), nonce: String(nonce) },
    recordId: hashTypedData(workTypedData(record)), signatures: {},
  };
}
export async function validatePrepared(prepared: PreparedWork) {
  const rebuilt = await prepareWork(prepared.original, BigInt(prepared.record.nonce));
  if (canonicalJson(rebuilt.record) !== canonicalJson(prepared.record) || rebuilt.recordId !== prepared.recordId) throw new Error("서명할 원본 기록이 달라졌어요. 근무 기록을 다시 준비해 주세요.");
  return restoreWorkRecord(prepared.record);
}
export async function checkWorkSignature(prepared: PreparedWork, role: ChainRole, signature: Hex) {
  const record = await validatePrepared(prepared);
  const recovered = await recoverTypedDataAddress({ ...workTypedData(record), signature });
  if (!isAddressEqual(recovered, record[role])) throw new Error("선택한 역할의 지갑과 서명한 지갑이 달라요.");
  return signature;
}
export function exportWorkBundle(prepared: PreparedWork): WorkBundle {
  return { ...prepared, format: "chemu-sepolia-work-v1", chainId: CHAIN.id, escrow: CHAIN.escrow };
}
export function parseWorkBundle(text: string): WorkBundle {
  if (text.length > 1_000_000) throw new Error("1MB 이하의 기록 파일을 선택해 주세요.");
  const bundle = JSON.parse(text) as WorkBundle;
  if (!bundle || bundle.format !== "chemu-sepolia-work-v1" || bundle.chainId !== CHAIN.id || typeof bundle.escrow !== "string" || !isAddressEqual(bundle.escrow, CHAIN.escrow) || !bundle.record || !bundle.original || !bundle.signatures || !/^0x[0-9a-fA-F]{64}$/.test(bundle.recordId)) throw new Error("이 Sepolia 컨트랙트의 근무 기록 파일이 아니에요.");
  return bundle;
}
