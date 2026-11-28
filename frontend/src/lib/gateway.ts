import { isAddress } from "viem";
import { DemoError, transition } from "./domain";
import { sampleSignature, verifyAttendanceSignature } from "./signatures";
import { attendanceDocument, canonicalJson, sha256 } from "./verification";
import type { DemoCommand, DemoState, Role } from "./types";

export interface StateRepository {
  read(): DemoState;
  write(state: DemoState): void;
}
export interface EscrowGateway {
  execute(command: DemoCommand): Promise<DemoState>;
  signSample(role: Role): Promise<DemoState>;
  lock(): Promise<DemoState>;
  releaseDue(now: string): Promise<DemoState>;
}

/** Replace this boundary with HTTP/viem implementations after agreeing ABI and persistence. */
export class MockEscrowGateway implements EscrowGateway {
  private queue: Promise<unknown> = Promise.resolve();
  private failure: string | null = null;
  constructor(private repository: StateRepository, private delayMs = 200) {}
  failNext(message = "연결이 잠시 끊겼어요. 기록과 보관된 돈은 그대로예요. 다시 시도해 주세요.") { this.failure = message; }
  clearFailure() { this.failure = null; }
  private run(operation: (state: DemoState) => Promise<DemoCommand | null> | DemoCommand | null) {
    const work = this.queue.then(async () => {
      if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
      if (this.failure) { const message = this.failure; this.failure = null; throw new DemoError(message); }
      const state = this.repository.read();
      const command = await operation(state);
      if (!command) return state;
      if (command.type === "sign") {
        const verified = await verifyAttendanceSignature(state, command.role, command.value.signature, command.value.mode);
        if (verified.payloadDigest !== command.value.payloadDigest) throw new DemoError("서명한 뒤에 기록이 달라졌어요. 다시 서명해 주세요.");
        command.value = verified;
      }
      if (command.type === "set-participants" && (!isAddress(command.worker) || !isAddress(command.employer))) throw new DemoError("올바른 지갑 주소를 입력해 주세요.");
      if (command.type === "lock") {
        for (const role of ["worker", "employer"] as const) {
          const signature = state.signatures[role];
          if (!signature) throw new DemoError("두 사람의 근무 기록 서명이 필요해요.");
          await verifyAttendanceSignature(state, role, signature.signature, signature.mode);
        }
        const expected = canonicalJson(attendanceDocument(state));
        if (command.sealedRecord !== expected || command.recordHash !== await sha256(expected)) throw new DemoError("확정할 기록과 지문이 달라요.");
      }
      const next = transition(state, command);
      this.repository.write(next);
      return next;
    });
    this.queue = work.catch(() => {});
    return work;
  }
  execute(command: DemoCommand) { return this.run(() => command); }
  /** Payday timer entry point. Another window of the same browser may already have paid; that is not an error. */
  releaseDue(now: string) { return this.run(state => state.attendance.status === "paid" ? null : { type: "release", now }); }
  signSample(role: Role) { return this.run(async state => ({ type: "sign", role, value: await sampleSignature(state, role) })); }
  lock() {
    return this.run(async state => {
      const sealedRecord = canonicalJson(attendanceDocument(state));
      return { type: "lock", sealedRecord, recordHash: await sha256(sealedRecord) };
    });
  }
}
