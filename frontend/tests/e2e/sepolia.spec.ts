import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decodeFunctionData, encodeFunctionResult, encodeEventTopics, encodeAbiParameters, parseAbiParameters, hashTypedData, recoverTypedDataAddress, recoverAddress, type Address, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { CHAIN, escrowAbi, tokenAbi } from "../../src/lib/chain-config";
import { workTypedData, type WorkRecord } from "../../src/lib/work-record";
import { contractSignatureAbi } from "../../src/lib/sepolia-gateway";

const mnemonic = "test test test test test test test test test test test junk";
const employer = mnemonicToAccount(mnemonic, { addressIndex: 20 });
const employee = mnemonicToAccount(mnemonic, { addressIndex: 21 });
const hex = (n: bigint | number) => `0x${BigInt(n).toString(16)}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const blockHash = hash(999);

async function fixture(page: Page) {
  let now = BigInt(Math.floor(Date.now() / 1000));
  let available = 0n, tokenBalance = 1_000_000n, employeeBalance = 0n, allowance = 0n, nonce = 3n;
  let delayedReceipts = false;
  let employerDelegated = false, acceptsContractSignature = true;
  const receipts = new Map<Hex, object>();
  const wages = new Map<Hex, { record: WorkRecord; released: boolean; tx: Hex }>();
  const sent: string[] = [];
  const block = () => ({ number: hex(CHAIN.deploymentBlock + 10n), hash: blockHash, parentHash: hash(998), timestamp: hex(now), transactions: [], nonce: "0x0000000000000000", sha3Uncles: hash(0), logsBloom: `0x${"0".repeat(512)}`, transactionsRoot: hash(0), stateRoot: hash(0), receiptsRoot: hash(0), miner: employer.address, difficulty: "0x0", totalDifficulty: "0x0", extraData: "0x", size: "0x0", gasLimit: "0x1c9c380", gasUsed: "0x0", baseFeePerGas: "0x1" });
  async function call(to: string, data: Hex, write = false) {
    const abi = to.toLowerCase() === employer.address.toLowerCase() ? contractSignatureAbi : to.toLowerCase() === CHAIN.token.toLowerCase() ? tokenAbi : escrowAbi;
    const decoded = decodeFunctionData({ abi, data });
    const name = decoded.functionName;
    const args = decoded.args as readonly unknown[] || [];
    let result: unknown;
    if (name === "isValidSignature") {
      const signer = await recoverAddress({ hash: args[0] as Hex, signature: args[1] as Hex });
      result = acceptsContractSignature && signer.toLowerCase() === employer.address.toLowerCase() ? "0x1626ba7e" : "0xffffffff";
    }
    else if (name === "wageToken") result = CHAIN.token;
    else if (name === "decimals") result = 0;
    else if (name === "eip712Domain") result = ["0x0f", CHAIN.domain.name, "1", BigInt(CHAIN.id), CHAIN.escrow, hash(0), []];
    else if (name === "balanceOf") result = String(args[0]).toLowerCase() === employee.address.toLowerCase() ? employeeBalance : tokenBalance;
    else if (name === "allowance") result = allowance;
    else if (name === "availableBalance") result = available;
    else if (name === "nextNonce") result = nonce;
    else if (name === "lockedWages") {
      const wage = wages.get(args[0] as Hex);
      result = wage ? [wage.record.employer, wage.record.employee, wage.record.grossWage, wage.record.payday, wage.released] : ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", 0n, 0n, false];
    } else if (name === "approve") { if (write) allowance = args[1] as bigint; result = true; }
    else if (name === "fund") {
      const amount = args[0] as bigint;
      if (allowance < amount || tokenBalance < amount) throw new Error("Insufficient tokens or allowance");
      if (write) { available += amount; tokenBalance -= amount; allowance -= amount; }
    } else if (name === "confirmAndLock") {
      const record = args[0] as WorkRecord;
      const typed = workTypedData(record);
      for (const [role, signature] of [["employer", args[1]], ["employee", args[2]]] as const) {
        const signer = await recoverTypedDataAddress({ ...typed, signature: signature as Hex });
        if (signer.toLowerCase() !== record[role].toLowerCase()) throw new Error("Invalid signature");
      }
      if (record.nonce !== nonce || record.payday <= now || available < record.grossWage) throw new Error("Invalid nonce, payday or balance");
      result = hashTypedData(typed);
      if (write) { available -= record.grossWage; nonce++; wages.set(result as Hex, { record, released: false, tx: hash(sent.length + 1) }); }
    } else if (name === "release") {
      const wage = wages.get(args[0] as Hex);
      if (!wage || wage.released || now < wage.record.payday) throw new Error("PaydayNotReached or AlreadyReleased");
      if (write) { wage.released = true; employeeBalance += wage.record.grossWage; }
    } else throw new Error(`Unexpected function ${name}`);
    if (write) sent.push(name);
    return { result: encodeFunctionResult({ abi, functionName: name, result }), name };
  }
  async function rpc(method: string, params: unknown[] = []) {
    if (method === "eth_chainId") return hex(CHAIN.id);
    if (method === "eth_blockNumber") return hex(CHAIN.deploymentBlock + 10n);
    if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") return block();
    if (method === "eth_getCode") return employerDelegated && String(params[0]).toLowerCase() === employer.address.toLowerCase() ? "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b" : "0x";
    if (method === "eth_call") { const input = params[0] as { to: string; data: Hex }; return (await call(input.to, input.data)).result; }
    if (method === "eth_getTransactionReceipt") return delayedReceipts ? null : receipts.get(params[0] as Hex) || null;
    if (method === "eth_getLogs") return [...wages.entries()].map(([id, wage]) => ({
      address: CHAIN.escrow, topics: encodeEventTopics({ abi: escrowAbi, eventName: "WageLocked", args: { recordId: id, employer: wage.record.employer, employee: wage.record.employee } }),
      data: encodeAbiParameters(parseAbiParameters("uint256,uint64,bytes32"), [wage.record.grossWage, wage.record.payday, wage.record.workRecordHash]),
      blockNumber: hex(CHAIN.deploymentBlock + 10n), transactionHash: wage.tx, transactionIndex: "0x0", blockHash, logIndex: "0x0", removed: false,
    }));
    throw new Error(`Unexpected RPC ${method}`);
  }
  await page.route(/ethereum-sepolia-rpc\.publicnode\.com/, async route => {
    const raw = route.request().postDataJSON();
    async function respond(request: { id: number; method: string; params: unknown[] }) {
      try { return { jsonrpc: "2.0", id: request.id, result: await rpc(request.method, request.params) }; }
      catch (error) { return { jsonrpc: "2.0", id: request.id, error: { code: -32000, message: error instanceof Error ? error.message : "Fixture RPC failure" } }; }
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(Array.isArray(raw) ? await Promise.all(raw.map(respond)) : await respond(raw)) });
  });
  await page.exposeFunction("fixtureWalletRequest", async (method: string, params: unknown[]) => {
    if (method === "eth_signTypedData_v4") {
      const signer = String(params[0]).toLowerCase() === employer.address.toLowerCase() ? employer : employee;
      return signer.signTypedData(JSON.parse(params[1] as string));
    }
    if (method === "eth_sendTransaction") {
      const input = params[0] as { to: string; data: Hex; from: Address };
      await call(input.to, input.data, true);
      const tx = hash(sent.length);
      receipts.set(tx, { transactionHash: tx, transactionIndex: "0x0", blockHash, blockNumber: hex(CHAIN.deploymentBlock + 10n), from: input.from, to: input.to, cumulativeGasUsed: "0x5208", gasUsed: "0x5208", contractAddress: null, logs: [], logsBloom: `0x${"0".repeat(512)}`, status: "0x1", effectiveGasPrice: "0x1", type: "0x2" });
      return tx;
    }
    return rpc(method, params);
  });
  await page.addInitScript(({ address }) => {
    const w = window as unknown as { ethereum: unknown; fixtureWalletRequest: (method: string, params: unknown[]) => Promise<unknown>; switchFixtureAccount: (address: string) => void; fixtureWalletCalls: string[] };
    w.fixtureWalletCalls = [];
    let active: string = address;
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    w.switchFixtureAccount = next => { active = next; for (const fn of listeners.accountsChanged || []) fn([next]); };
    w.ethereum = { isMetaMask: true, on(event: string, fn: (...args: unknown[]) => void) { (listeners[event] ||= []).push(fn); }, removeListener(event: string, fn: (...args: unknown[]) => void) { listeners[event] = (listeners[event] || []).filter(item => item !== fn); },
      async request({ method, params = [] }: { method: string; params?: unknown[] }) {
        w.fixtureWalletCalls.push(method);
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [active];
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_switchEthereumChain") return null;
        return w.fixtureWalletRequest(method, params);
      },
    };
  }, { address: employer.address });
  return {
    sent,
    delegateEmployer(accepts = true) { employerDelegated = true; acceptsContractSignature = accepts; },
    delayReceipts(value: boolean) { delayedReceipts = value; },
    paydayNow() { now = BigInt(Math.floor(Date.parse("2030-12-10T09:00:00+09:00") / 1000)); },
  };
}
async function setup(page: Page) {
  await page.goto("/sepolia");
  await page.getByRole("button", { name: "지갑 연결", exact: true }).click();
  await expect(page.locator(".wallet-button").filter({ hasText: "해제" })).toBeVisible();
  await page.getByLabel("사장님 지갑", { exact: true }).fill(employer.address);
  await page.getByLabel("알바생 지갑", { exact: true }).fill(employee.address);
}
test("Sepolia UI approves, funds, signs, locks, verifies original and releases with confirmed receipts", async ({ page }) => {
  const chain = await fixture(page); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await setup(page);
  await page.getByRole("button", { name: "토큰 승인하고 충전하기" }).click();
  await expect(page.getByTestId("chain-available")).toHaveText("100,000 KRWt");
  await page.getByRole("checkbox").check();
  await page.getByLabel("급여 시각 · 이 기기의 현지 시간").fill("2030-12-10T09:00");
  await page.getByRole("button", { name: "기록과 급여 시각 확정하기" }).click();
  await page.evaluate(address => (window as unknown as { switchFixtureAccount: (value: string) => void }).switchFixtureAccount(address), employee.address);
  await page.getByRole("button", { name: "알바생 지갑으로 서명하기" }).click();
  await expect(page.getByText("서명 완료", { exact: true })).toBeVisible();
  await page.evaluate(address => (window as unknown as { switchFixtureAccount: (value: string) => void }).switchFixtureAccount(address), employer.address);
  await page.getByRole("button", { name: "사장님 지갑으로 서명하기" }).click();
  await page.getByRole("button", { name: "사장님 지갑으로 확정하고 보관하기" }).click();
  await expect(page.getByRole("button", { name: "보관 거래 확인 완료" })).toBeVisible();
  await expect(page.getByTestId("chain-available")).toHaveText("7,120 KRWt");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "기록 JSON 내보내기" }).click();
  const download = await downloadPromise;
  const json = await readFile((await download.path())!, "utf8");
  await page.getByLabel("내보낸 기록 파일").setInputFiles({ name: "record.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await page.getByRole("button", { name: "파일과 체인 대조하기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "체인에 보관한 원본과 일치해요." })).toBeVisible();
  await page.getByRole("button", { name: "급여일 지급하기", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("체인 시간이 아직");
  chain.paydayNow();
  await page.getByRole("button", { name: "급여일 지급하기", exact: true }).click();
  await expect(page.getByRole("button", { name: "이미 지급됐어요" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "보관 거래 확인 완료" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이미 지급됐어요" })).toBeVisible();
  expect(chain.sent).toEqual(["approve", "fund", "confirmAndLock", "release"]);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/sepolia-mobile.png", fullPage: true });
});
test("submitted approval survives reload and is reconciled without sending it twice", async ({ page }) => {
  const chain = await fixture(page); await setup(page); chain.delayReceipts(true);
  await page.getByRole("button", { name: "토큰 승인하고 충전하기" }).click();
  await expect(page.locator(".chain-tx").first()).toContainText("확인 중");
  await page.reload();
  await expect(page.getByRole("button", { name: "토큰 승인하고 충전하기" })).toBeDisabled();
  chain.delayReceipts(false);
  await page.getByRole("button", { name: "미확인 거래 다시 확인하기" }).click();
  await expect(page.getByRole("button", { name: "토큰 승인하고 충전하기" })).toBeEnabled();
  await page.getByRole("button", { name: "토큰 승인하고 충전하기" }).click();
  await expect(page.getByTestId("chain-available")).toHaveText("100,000 KRWt");
  expect(chain.sent).toEqual(["approve", "fund"]);
});

test("delegated employer signs and locks only when its ERC-1271 check accepts the signature", async ({ page }) => {
  const chain = await fixture(page); await setup(page);
  await page.getByRole("button", { name: "토큰 승인하고 충전하기" }).click();
  await expect(page.getByTestId("chain-available")).toHaveText("100,000 KRWt");
  chain.delegateEmployer(false);
  await page.getByRole("checkbox").check();
  await page.getByLabel("급여 시각 · 이 기기의 현지 시간").fill("2030-12-10T09:00");
  await page.getByRole("button", { name: "기록과 급여 시각 확정하기" }).click();
  await page.getByRole("button", { name: "사장님 지갑으로 서명하기" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("스마트 계정이 이 근무 기록의 서명을 승인하지 않았어요");
  await expect(page.getByRole("button", { name: "서명 완료", exact: true })).toHaveCount(0);
  chain.delegateEmployer();
  await page.getByRole("button", { name: "사장님 지갑으로 서명하기" }).click();
  await expect(page.getByRole("button", { name: "서명 완료", exact: true })).toHaveCount(1);
  await page.evaluate(address => (window as unknown as { switchFixtureAccount: (value: string) => void }).switchFixtureAccount(address), employee.address);
  await page.getByRole("button", { name: "알바생 지갑으로 서명하기" }).click();
  await expect(page.getByRole("button", { name: "서명 완료", exact: true })).toHaveCount(2);
  await page.evaluate(address => (window as unknown as { switchFixtureAccount: (value: string) => void }).switchFixtureAccount(address), employer.address);
  await page.getByRole("button", { name: "사장님 지갑으로 확정하고 보관하기" }).click();
  await expect(page.getByRole("button", { name: "보관 거래 확인 완료" })).toBeVisible();
  expect(chain.sent).toEqual(["approve", "fund", "confirmAndLock"]);
});

test("switching accounts enables signing without a background wallet-client probe", async ({ page }) => {
  await fixture(page); await setup(page);
  await page.getByRole("checkbox").check();
  await page.getByLabel("급여 시각 · 이 기기의 현지 시간").fill("2030-12-10T09:00");
  await page.getByRole("button", { name: "기록과 급여 시각 확정하기" }).click();
  await page.evaluate(address => {
    const w = window as unknown as { fixtureWalletCalls: string[]; switchFixtureAccount: (value: string) => void };
    w.fixtureWalletCalls = [];
    w.switchFixtureAccount(address);
  }, employee.address);
  await expect(page.locator(".wallet-button").filter({ hasText: employee.address.slice(0, 8) })).toBeVisible();
  const sign = page.getByRole("button", { name: "알바생 지갑으로 서명하기" });
  await expect(sign).toBeEnabled();
  const calls = () => page.evaluate(() => (window as unknown as { fixtureWalletCalls: string[] }).fixtureWalletCalls);
  expect(await calls()).not.toContain("eth_chainId");
  await sign.click();
  await expect(page.getByRole("button", { name: "서명 완료", exact: true })).toHaveCount(1);
  expect(await calls()).toContain("eth_chainId");
});
