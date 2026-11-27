import assert from "node:assert/strict";
import { test } from "node:test";
import { hashTypedData, encodeFunctionResult, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { CHAIN, escrowAbi } from "../src/lib/chain-config";
import { chainErrorMessage } from "../src/lib/chain-errors";
import { DEMO } from "../src/lib/fixtures";
import { prepareWork, validatePrepared, checkWorkSignature, workTypedData, restoreWorkRecord, parseWorkBundle, exportWorkBundle, type OriginalWorkRecord } from "../src/lib/work-record";
import { checkDeployment, SepoliaEscrowGateway, verifyAnchoredWork, type ChainTransaction } from "../src/lib/sepolia-gateway";

const mnemonic = "test test test test test test test test test test test junk";
const employer = mnemonicToAccount(mnemonic, { addressIndex: 20 });
const employee = mnemonicToAccount(mnemonic, { addressIndex: 21 });
const original: OriginalWorkRecord = {
  schema: "chemu-work-record-v1", employer: employer.address, employee: employee.address,
  contract: { hourlyWage: 10320, weeklyHours: 18, includesWeeklyAllowance: true },
  attendance: { workDate: DEMO.workDate, checkIn: DEMO.checkIn, checkOut: DEMO.checkOut, breakMinutes: 60 },
  grossWage: 92880, payday: "2030-12-10T09:00:00+09:00",
};
const txHash = `0x${"a".repeat(64)}` as Hex;

async function signed() {
  const p = await prepareWork(structuredClone(original), 3n);
  const typed = workTypedData(restoreWorkRecord(p.record));
  p.signatures.employer = await employer.signTypedData(typed);
  p.signatures.employee = await employee.signTypedData(typed);
  return p;
}
function fixture() {
  let active = employer.address as Address;
  let allowance = 0n;
  let balance = 1_000_000n;
  let available = 0n;
  let nonce = 3n;
  let status: "success" | "reverted" = "success";
  let code: Hex | undefined;
  let contractSignature: Hex | Error = "0xffffffff";
  const signatureChecks: { args: readonly unknown[]; account: unknown }[] = [];
  let rejected = false;
  const calls: string[] = [];
  const observed: ChainTransaction[] = [];
  let latest: { functionName: string; args: unknown[]; account: unknown };
  const publicPort = {
    getChainId: async () => CHAIN.id,
    getCode: async ({ address }: { address: Address }) => address.toLowerCase() === employer.address.toLowerCase() ? code : undefined,
    getBlock: async () => ({ timestamp: 1_700_000_000n }),
    getBlockNumber: async () => CHAIN.deploymentBlock + 10n,
    readContract: async ({ functionName, args = [], account }: { functionName: string; args?: readonly unknown[]; account?: unknown }) => {
      if (functionName === "isValidSignature") {
        signatureChecks.push({ args, account });
        if (contractSignature instanceof Error) throw contractSignature;
        return contractSignature;
      }
      if (functionName === "wageToken") return CHAIN.token;
      if (functionName === "decimals") return 0;
      if (functionName === "eip712Domain") return ["0x0f", CHAIN.domain.name, "1", BigInt(CHAIN.id), CHAIN.escrow, `0x${"0".repeat(64)}`, []];
      if (functionName === "balanceOf") return balance;
      if (functionName === "allowance") return allowance;
      if (functionName === "nextNonce") return nonce;
      if (functionName === "availableBalance") return available;
      if (functionName === "lockedWages") return [employer.address, employee.address, 92880n, BigInt(Date.parse(original.payday) / 1000), false];
      throw new Error(`Unexpected read ${functionName}`);
    },
    simulateContract: async (request: { functionName: string; args: unknown[]; account: unknown }) => { calls.push(`simulate:${request.functionName}`); return { request }; },
    waitForTransactionReceipt: async () => {
      if (status === "success") {
        if (latest.functionName === "approve") allowance = latest.args[1] as bigint;
        if (latest.functionName === "fund") { balance -= latest.args[0] as bigint; available += latest.args[0] as bigint; }
      }
      return { status, transactionHash: txHash };
    },
  };
  const walletPort = {
    getChainId: async () => CHAIN.id,
    getAddresses: async () => [active],
    writeContract: async (request: typeof latest) => { if (rejected) throw new Error("User rejected request"); latest = request; calls.push(`write:${request.functionName}`); return txHash; },
    signTypedData: async () => { if (rejected) throw new Error("User rejected request"); const p = await prepareWork(original, nonce); return (active === employer.address ? employer : employee).signTypedData(workTypedData(restoreWorkRecord(p.record))); },
  };
  const client = publicPort as unknown as PublicClient;
  const wallet = walletPort as unknown as WalletClient;
  return {
    client, wallet, api: new SepoliaEscrowGateway(client, wallet, tx => observed.push(tx)), calls, observed, signatureChecks,
    ports: { publicPort, walletPort },
    setActive(value: Address) { active = value; }, setCode(value: Hex) { code = value; },
    setContractSignature(value: Hex | Error) { contractSignature = value; },
    setAllowance(value: bigint) { allowance = value; }, setBalance(value: bigint) { balance = value; }, setNonce(value: bigint) { nonce = value; },
    failReceipt() { status = "reverted"; }, rejectWallet() { rejected = true; }, latest: () => latest,
  };
}

test("WorkRecord matches delivered ABI, includes payday/hash and separates hash from signatures", async () => {
  const p = await signed();
  const r = await validatePrepared(p);
  assert.equal(r.grossWage, 92880n);
  assert.equal(r.nonce, 3n);
  assert.notEqual(p.recordId, p.record.workRecordHash);
  assert.equal(p.recordId, hashTypedData(workTypedData(r)));
  const abi = escrowAbi.find(item => item.type === "function" && item.name === "confirmAndLock");
  assert.ok(abi && "inputs" in abi && "components" in abi.inputs[0]);
  assert.deepEqual(abi.inputs[0].components.map(i => i.name), ["employer", "employee", "grossWage", "payday", "workRecordHash", "nonce"]);
  const before = p.record.workRecordHash;
  p.signatures = {};
  assert.equal((await validatePrepared(p)).workRecordHash, before);
});
test("tampering original, payday, nonce, signature or record ID is detected", async () => {
  const p = await signed();
  const changed = structuredClone(p); changed.original.grossWage = 1;
  await assert.rejects(validatePrepared(changed));
  const payday = structuredClone(p); payday.record.payday = String(BigInt(p.record.payday) + 1n);
  await assert.rejects(validatePrepared(payday));
  const nonce = structuredClone(p); nonce.record.nonce = "4"; nonce.recordId = hashTypedData(workTypedData(restoreWorkRecord(nonce.record)));
  await assert.rejects(checkWorkSignature(nonce, "employer", p.signatures.employer!));
  await assert.rejects(checkWorkSignature(p, "employer", p.signatures.employee!));
  assert.equal(parseWorkBundle(JSON.stringify(exportWorkBundle(p))).recordId, p.recordId);
});
test("fund awaits approval before funding with zero-decimal amounts", async () => {
  const f = fixture(); await f.api.fund(employer.address, 92880n);
  assert.deepEqual(f.calls, ["simulate:approve", "write:approve", "simulate:fund", "write:fund"]);
  assert.deepEqual(f.observed.map(t => t.status), ["pending", "confirmed", "pending", "confirmed"]);
  assert.deepEqual(f.latest().args, [92880n]);
});
test("existing allowance avoids redundant approval; insufficient tokens avoid writes", async () => {
  const f = fixture(); f.setAllowance(100_000n); await f.api.fund(employer.address, 92880n);
  assert.deepEqual(f.calls, ["simulate:fund", "write:fund"]);
  const insufficient = fixture(); insufficient.setBalance(1n);
  await assert.rejects(insufficient.api.fund(employer.address, 92880n), /모자라요/);
  assert.equal(insufficient.calls.length, 0);
});
test("wrong wallet and network are blocked", async () => {
  const f = fixture(); f.setActive(employee.address);
  await assert.rejects(f.api.fund(employer.address, 1n), /계정으로/);
  f.ports.walletPort.getChainId = async () => 1 as 11155111;
  await assert.rejects(f.api.fund(employer.address, 1n), /Sepolia/);
});

const delegatedCode = "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b";
test("delegated account accepts a matching EOA signature only after ERC-1271 validation", async () => {
  const f = fixture(); const p = await signed(); f.setCode(delegatedCode); f.setContractSignature("0x1626ba7e");
  const signature = await f.api.sign(p, "employer");
  assert.equal(signature, p.signatures.employer);
  assert.deepEqual(f.signatureChecks, [{ args: [p.recordId, signature], account: CHAIN.escrow }]);
  assert.equal(f.calls.length, 0);
});

test("delegated account rejecting a signature cannot create a signed record", async () => {
  const f = fixture(); f.setCode(delegatedCode);
  await assert.rejects(f.api.sign(await signed(), "employer"), /승인하지 않았/);
  assert.equal(f.calls.length, 0);
});

test("ERC-1271 read failures do not accept a delegated account signature", async () => {
  const f = fixture(); f.setCode(delegatedCode); f.setContractSignature(new Error("RPC unavailable"));
  await assert.rejects(f.api.sign(await signed(), "employer"), /확인하지 못했/);
  assert.equal(f.calls.length, 0);
});

test("smart account accepting ERC-1271 cannot bypass the expected EOA signer", async () => {
  const f = fixture(); const p = await signed(); f.setCode(delegatedCode); f.setContractSignature("0x1626ba7e");
  f.ports.walletPort.signTypedData = async () => p.signatures.employee!;
  await assert.rejects(f.api.sign(p, "employer"), /서명한 지갑이 달라/);
  assert.equal(f.signatureChecks.length, 0);
});

test("lock rechecks smart account validation after delegation changes", async () => {
  const f = fixture(); const p = await signed();
  await f.api.sign(p, "employer");
  f.setCode(delegatedCode);
  await assert.rejects(f.api.lock(p), /승인하지 않았/);
  assert.equal(f.calls.length, 0);
  f.setContractSignature("0x1626ba7e");
  await f.api.lock(p);
  assert.equal(f.latest().functionName, "confirmAndLock");
});
test("nonce changes and wallet rejection cannot create a signed record", async () => {
  const f = fixture(); const p = await signed(); f.setNonce(4n);
  await assert.rejects(f.api.sign(p, "employer"), /nonce/);
  const rejected = fixture(); rejected.rejectWallet();
  await assert.rejects(rejected.api.sign(p, "employer"), /rejected/);
});
test("lock passes actual tuple and two signatures and only succeeds after receipt", async () => {
  const f = fixture(); const p = await signed(); await f.api.lock(p);
  assert.equal(f.latest().functionName, "confirmAndLock");
  assert.deepEqual(f.latest().args, [restoreWorkRecord(p.record), p.signatures.employer, p.signatures.employee]);
  assert.equal(f.observed.at(-1)?.status, "confirmed");
  const failed = fixture(); failed.failReceipt();
  await assert.rejects(failed.api.lock(p), /실패/);
  assert.equal(failed.observed.at(-1)?.status, "reverted");
});
test("missing signature blocks lock and cancellation never reports confirmation", async () => {
  const f = fixture(); const p = await signed(); delete p.signatures.employee;
  await assert.rejects(f.api.lock(p), /두 사람/);
  assert.equal(f.calls.length, 0);
  const rejected = fixture(); rejected.rejectWallet();
  await assert.rejects(rejected.api.lock(await signed()), /rejected/);
  assert.equal(rejected.observed.length, 0);
});
test("release uses chain time; local relayer signing account is retained", async () => {
  const f = fixture(); const p = await signed();
  await assert.rejects(f.api.release(p.recordId), /체인 시간/);
  f.ports.publicPort.getBlock = async () => ({ timestamp: BigInt(Date.parse(original.payday) / 1000) });
  Object.assign(f.ports.walletPort, { account: employer });
  await f.api.release(p.recordId);
  assert.equal(f.latest().functionName, "release");
  assert.deepEqual(f.latest().args, [p.recordId]);
  assert.equal(f.latest().account, employer);
});
test("anchoring checks original hash against an actual WageLocked event", async () => {
  const f = fixture(); const p = await signed();
  Object.assign(f.ports.publicPort, { getLogs: async () => [{ args: { workRecordHash: p.record.workRecordHash }, transactionHash: txHash, blockNumber: CHAIN.deploymentBlock }] });
  const proof = await verifyAnchoredWork(f.client, p);
  assert.equal(proof.transactionHash, txHash);
  Object.assign(f.ports.publicPort, { getLogs: async () => [{ args: { workRecordHash: `0x${"0".repeat(64)}` }, transactionHash: txHash }] });
  await assert.rejects(verifyAnchoredWork(f.client, p), /지문이 달라/);
});
test("deployment mismatch blocks integration", async () => {
  const f = fixture(); f.ports.publicPort.getChainId = async () => 1 as 11155111;
  await assert.rejects(checkDeployment(f.client), /Sepolia/);
});

test("nested contract errors retain an actionable reason", () => {
  assert.match(chainErrorMessage({ shortMessage: "Execution reverted", cause: { data: { errorName: "InsufficientAvailableBalance" } } }), /보관함을 먼저/);
  assert.match(chainErrorMessage({ cause: { data: { errorName: "InvalidNonce" } } }), /기록을 다시 준비/);
  assert.match(chainErrorMessage(new Error("Timed out waiting for receipt")), /다시 전송하기 전에/);
});
