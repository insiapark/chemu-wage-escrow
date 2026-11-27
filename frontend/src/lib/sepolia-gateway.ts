import { hashTypedData, isAddressEqual, parseAbiItem, zeroAddress, type Address, type Hex, type PublicClient, type WalletClient, type Abi } from "viem";
import { sepolia } from "viem/chains";
import { CHAIN, escrowAbi, tokenAbi } from "./chain-config";
import { checkWorkSignature, restoreWorkRecord, validatePrepared, workTypedData, type ChainRole, type PreparedWork } from "./work-record";

export type TxKind = "approve" | "fund" | "lock" | "release";
export interface ChainTransaction { hash: Hex; kind: TxKind; status: "pending" | "confirmed" | "reverted" | "replaced"; recordId?: Hex }
export interface LockedWage { employer: Address; employee: Address; amount: bigint; payday: bigint; released: boolean }
export type TxObserver = (transaction: ChainTransaction) => void;
const lockedEvent = parseAbiItem("event WageLocked(bytes32 indexed recordId, address indexed employer, address indexed employee, uint256 amount, uint64 payday, bytes32 workRecordHash)");
export const contractSignatureAbi = [parseAbiItem("function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)")];

// EIP-7702 accounts still sign with their EOA key. The escrow additionally checks
// ERC-1271 when code is present, so require both checks before saving a signature.
async function checkCurrentSignature(client: PublicClient, prepared: PreparedWork, role: ChainRole, signature: Hex) {
  await checkWorkSignature(prepared, role, signature);
  const signer = prepared.record[role];
  const code = await client.getCode({ address: signer });
  if (!code || code === "0x") return;
  let result;
  try {
    result = await client.readContract({ address: signer, abi: contractSignatureAbi, functionName: "isValidSignature", args: [prepared.recordId, signature], account: CHAIN.escrow });
  } catch {
    throw new Error("스마트 계정의 서명 호환성을 확인하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요. 계속 실패하면 해당 계정의 Sepolia 스마트 기능을 끄고 서명해 주세요.");
  }
  if (result !== "0x1626ba7e") throw new Error("현재 스마트 계정이 이 근무 기록의 서명을 승인하지 않았어요. MetaMask에서 해당 계정의 Sepolia 스마트 기능을 끈 뒤 다시 서명해 주세요.");
}

export async function checkDeployment(client: PublicClient) {
  if (await client.getChainId() !== CHAIN.id) throw new Error("Sepolia 네트워크에서만 실행할 수 있어요.");
  const [token, decimals, domain] = await Promise.all([
    client.readContract({ address: CHAIN.escrow, abi: escrowAbi, functionName: "wageToken" }),
    client.readContract({ address: CHAIN.token, abi: tokenAbi, functionName: "decimals" }),
    client.readContract({ address: CHAIN.escrow, abi: escrowAbi, functionName: "eip712Domain" }),
  ]);
  const d = domain as readonly [Hex, string, string, bigint, Address, Hex, bigint[]];
  if (!isAddressEqual(token as Address, CHAIN.token) || Number(decimals) !== 0 || d[1] !== CHAIN.domain.name || d[2] !== "1" || Number(d[3]) !== CHAIN.id || !isAddressEqual(d[4], CHAIN.escrow)) throw new Error("배포 주소나 서명 규격이 전달받은 컨트랙트와 달라요.");
}
export async function readBalances(client: PublicClient, employer: Address, employee: Address) {
  await checkDeployment(client);
  const [available, employerToken, employeeToken, nonce] = await Promise.all([
    client.readContract({ address: CHAIN.escrow, abi: escrowAbi, functionName: "availableBalance", args: [employer] }),
    client.readContract({ address: CHAIN.token, abi: tokenAbi, functionName: "balanceOf", args: [employer] }),
    client.readContract({ address: CHAIN.token, abi: tokenAbi, functionName: "balanceOf", args: [employee] }),
    client.readContract({ address: CHAIN.escrow, abi: escrowAbi, functionName: "nextNonce", args: [employer, employee] }),
  ]);
  return { available: available as bigint, employerToken: employerToken as bigint, employeeToken: employeeToken as bigint, nonce: nonce as bigint };
}
export async function readLockedWage(client: PublicClient, recordId: Hex): Promise<LockedWage> {
  const value = await client.readContract({ address: CHAIN.escrow, abi: escrowAbi, functionName: "lockedWages", args: [recordId] }) as readonly [Address, Address, bigint, bigint, boolean];
  if (isAddressEqual(value[0], zeroAddress)) throw new Error("이 컨트랙트에 보관된 기록이 없어요.");
  return { employer: value[0], employee: value[1], amount: value[2], payday: value[3], released: value[4] };
}
export async function verifyAnchoredWork(client: PublicClient, prepared: PreparedWork) {
  const record = await validatePrepared(prepared);
  await checkDeployment(client);
  const wage = await readLockedWage(client, prepared.recordId);
  if (!isAddressEqual(wage.employer, record.employer) || !isAddressEqual(wage.employee, record.employee) || wage.amount !== record.grossWage || wage.payday !== record.payday) throw new Error("파일의 지급 조건과 체인에 보관된 조건이 달라요.");
  const head = await client.getBlockNumber();
  for (let from = CHAIN.deploymentBlock; from <= head; from += 5_000n) {
    const logs = await client.getLogs({ address: CHAIN.escrow, event: lockedEvent, args: { recordId: prepared.recordId }, fromBlock: from, toBlock: from + 4_999n < head ? from + 4_999n : head });
    if (logs.length) {
      const event = logs[0];
      if (event.args.workRecordHash !== record.workRecordHash) throw new Error("원본 기록의 SHA-256과 체인에 남긴 지문이 달라요.");
      for (const role of ["employer", "employee"] as const) {
        if (!prepared.signatures[role]) throw new Error("파일에 두 사람의 서명이 필요해요.");
        await checkWorkSignature(prepared, role, prepared.signatures[role]!);
      }
      return { wage, transactionHash: event.transactionHash, blockNumber: event.blockNumber };
    }
  }
  throw new Error("보관 이벤트를 찾지 못했어요. RPC 상태를 확인해 주세요.");
}

export class SepoliaEscrowGateway {
  constructor(private client: PublicClient, private wallet: WalletClient, private observe: TxObserver = () => {}) {}
  private async account(expected?: Address) {
    if (await this.wallet.getChainId() !== CHAIN.id) throw new Error("지갑을 Sepolia로 바꿔 주세요.");
    const [address] = await this.wallet.getAddresses();
    if (!address) throw new Error("브라우저 지갑을 먼저 연결해 주세요.");
    if (expected && !isAddressEqual(address, expected)) throw new Error("현재 지갑을 이 작업을 맡은 사람의 계정으로 바꿔 주세요.");
    await checkDeployment(this.client);
    return address;
  }
  private async send(kind: TxKind, address: Address, abi: Abi, functionName: string, args: readonly unknown[], account: Address, recordId?: Hex) {
    const { request } = await this.client.simulateContract({ address, abi, functionName, args, account });
    const signingAccount = this.wallet.account?.type === "local" ? this.wallet.account : account;
    const hash = await this.wallet.writeContract({ ...request, account: signingAccount, chain: sepolia });
    this.observe({ hash, kind, status: "pending", recordId });
    let replaced = false;
    const receipt = await this.client.waitForTransactionReceipt({
      hash, confirmations: 1, timeout: 120_000,
      onReplaced: replacement => {
        replaced = replacement.reason !== "repriced";
        this.observe({ hash, kind, status: "replaced", recordId });
        this.observe({ hash: replacement.transactionReceipt.transactionHash, kind, status: replaced ? "replaced" : "pending", recordId });
      },
    });
    if (replaced) throw new Error("거래가 다른 거래로 교체됐어요. 체인 상태를 다시 확인해 주세요.");
    this.observe({ hash: receipt.transactionHash, kind, status: receipt.status === "success" ? "confirmed" : "reverted", recordId });
    if (receipt.status !== "success") throw new Error("거래가 실패했어요. 잔액과 기록을 새로 확인해 주세요.");
    return receipt;
  }
  async fund(employer: Address, amount: bigint) {
    if (amount <= 0n || amount > 10_000_000n) throw new Error("1원부터 1,000만 원까지 입력해 주세요.");
    const account = await this.account(employer);
    const [balance, allowance] = await Promise.all([
      this.client.readContract({ address: CHAIN.token, abi: tokenAbi, functionName: "balanceOf", args: [employer] }) as Promise<bigint>,
      this.client.readContract({ address: CHAIN.token, abi: tokenAbi, functionName: "allowance", args: [employer, CHAIN.escrow] }) as Promise<bigint>,
    ]);
    if (balance < amount) throw new Error("사장님 지갑의 KRWt가 모자라요. 발행 담당자에게 테스트 토큰을 받아 주세요.");
    if (allowance < amount) await this.send("approve", CHAIN.token, tokenAbi, "approve", [CHAIN.escrow, amount], account);
    // Recheck wallet account/network after the approval confirmation.
    await this.account(employer);
    return this.send("fund", CHAIN.escrow, escrowAbi, "fund", [amount], account);
  }
  async sign(prepared: PreparedWork, role: ChainRole) {
    const record = await validatePrepared(prepared);
    const account = await this.account(record[role]);
    const [nonce, block] = await Promise.all([
      this.client.readContract({ address: CHAIN.escrow, abi: escrowAbi, functionName: "nextNonce", args: [record.employer, record.employee] }),
      this.client.getBlock(),
    ]);
    if (nonce !== record.nonce) throw new Error("다른 근무가 먼저 확정돼 nonce가 바뀌었어요. 기록을 다시 준비해 주세요.");
    if (record.payday <= block.timestamp) throw new Error("급여 시각이 지났어요. 새 시각으로 기록을 준비해 주세요.");
    const signingAccount = this.wallet.account?.type === "local" ? this.wallet.account : account;
    const signature = await this.wallet.signTypedData({ account: signingAccount, ...workTypedData(record) });
    await checkCurrentSignature(this.client, prepared, role, signature);
    return signature;
  }
  async lock(prepared: PreparedWork) {
    const record = await validatePrepared(prepared);
    for (const role of ["employer", "employee"] as const) {
      if (!prepared.signatures[role]) throw new Error("같은 기록에 두 사람의 지갑 서명이 필요해요.");
      await checkCurrentSignature(this.client, prepared, role, prepared.signatures[role]!);
    }
    const account = await this.account(record.employer);
    const receipt = await this.send("lock", CHAIN.escrow, escrowAbi, "confirmAndLock", [record, prepared.signatures.employer, prepared.signatures.employee], account, prepared.recordId);
    const wage = await readLockedWage(this.client, prepared.recordId);
    if (wage.amount !== record.grossWage || !isAddressEqual(wage.employee, record.employee) || hashTypedData(workTypedData(record)) !== prepared.recordId) throw new Error("보관 거래 뒤 조회한 지급 조건이 달라요.");
    return receipt;
  }
  async release(recordId: Hex) {
    const account = await this.account();
    const wage = await readLockedWage(this.client, recordId);
    if (wage.released) throw new Error("이미 지급된 기록이에요.");
    if ((await this.client.getBlock()).timestamp < wage.payday) throw new Error("체인 시간이 아직 급여일에 도달하지 않았어요.");
    return this.send("release", CHAIN.escrow, escrowAbi, "release", [recordId], account, recordId);
  }
}
