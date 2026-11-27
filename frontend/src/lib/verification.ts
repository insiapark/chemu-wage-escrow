import type { DemoState, VerificationBundle } from "./types";
import { DemoError } from "./domain";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
export async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
}
export function attendanceDocument(state: DemoState) {
  return {
    schema: "chemu-attendance-v1", contractId: state.contract.id, contractRevision: state.contract.revision,
    worker: state.participants.worker, employer: state.participants.employer,
    attendance: {
      id: state.attendance.id, workDate: state.attendance.workDate,
      checkIn: state.attendance.checkIn, checkOut: state.attendance.checkOut,
      breakMinutes: state.attendance.breakMinutes, hourlyWage: state.attendance.hourlyWage,
      wage: state.attendance.wage, nonce: state.attendance.nonce,
    },
    signatures: state.signatures,
  };
}
export function exportBundle(state: DemoState): VerificationBundle {
  if (!state.sealedRecord || !state.recordHash) throw new DemoError("근무를 확정한 뒤에 기록을 내보낼 수 있어요.");
  return { format: "chemu-attendance-v1", record: JSON.parse(state.sealedRecord), sha256: state.recordHash, anchoring: "browser-local-mock" };
}
export async function verifyBundle(text: string, trustedHash: string | null) {
  if (text.length > 1_000_000) throw new DemoError("1MB 이하의 기록 파일을 선택해 주세요.");
  let bundle: VerificationBundle;
  try { bundle = JSON.parse(text); } catch { throw new DemoError("JSON 기록 파일을 선택해 주세요."); }
  if (!bundle || bundle.format !== "chemu-attendance-v1" || !bundle.record || typeof bundle.record !== "object" || Array.isArray(bundle.record) || typeof bundle.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(bundle.sha256)) {
    throw new DemoError("체무에서 내보낸 기록 형식이 아니에요.");
  }
  const computedHash = await sha256(canonicalJson(bundle.record));
  return {
    computedHash, declaredHash: bundle.sha256,
    fileMatches: computedHash === bundle.sha256,
    referenceMatches: trustedHash ? computedHash === trustedHash : null,
  };
}
