import { hashTypedData, isAddressEqual, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { DemoError } from "./domain";
import type { AttendanceSignature, DemoState, Role } from "./types";

// Public Hardhat development mnemonic. These are disposable demo identities, never funded wallets.
const DEVELOPMENT_MNEMONIC = "test test test test test test test test test test test junk";
export const attendanceTypes = {
  Attendance: [
    { name: "worker", type: "address" }, { name: "employer", type: "address" },
    { name: "workDate", type: "uint256" }, { name: "checkIn", type: "uint256" },
    { name: "checkOut", type: "uint256" }, { name: "wage", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export function attendanceTypedData(state: DemoState) {
  const a = state.attendance;
  if (!a.checkIn || !a.checkOut) throw new DemoError("퇴근한 뒤에 근무 기록에 서명할 수 있어요.");
  return {
    domain: {
      name: "ChemuAttendance", version: "1",
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111),
      verifyingContract: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
    },
    types: attendanceTypes,
    primaryType: "Attendance" as const,
    message: {
      ...state.participants,
      workDate: BigInt(a.workDate.replaceAll("-", "")),
      checkIn: BigInt(Math.floor(Date.parse(a.checkIn) / 1000)),
      checkOut: BigInt(Math.floor(Date.parse(a.checkOut) / 1000)),
      wage: BigInt(a.wage), nonce: BigInt(a.nonce),
    },
  };
}

export async function verifyAttendanceSignature(state: DemoState, role: Role, signature: Hex, mode: "sample" | "wallet"): Promise<AttendanceSignature> {
  const typed = attendanceTypedData(state);
  const recovered = await recoverTypedDataAddress({ ...typed, signature });
  if (!isAddressEqual(recovered, state.participants[role])) throw new DemoError("이 역할에 설정된 지갑과 서명한 지갑이 달라요. 시연 설정에서 주소를 확인해 주세요.");
  return { address: recovered, signature, mode, payloadDigest: hashTypedData(typed) };
}

export async function sampleSignature(state: DemoState, role: Role) {
  const account = mnemonicToAccount(DEVELOPMENT_MNEMONIC, { addressIndex: role === "worker" ? 0 : 1 });
  if (!isAddressEqual(account.address, state.participants[role])) throw new DemoError("지갑 주소를 바꾼 경우 실제 지갑으로 서명해 주세요. 연습 서명은 기본 시연 주소에서만 쓸 수 있어요.");
  const signature = await account.signTypedData(attendanceTypedData(state));
  return verifyAttendanceSignature(state, role, signature, "sample");
}
