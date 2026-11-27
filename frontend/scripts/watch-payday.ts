import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { CHAIN, sepoliaClient } from "../src/lib/chain-config";
import { checkDeployment, readLockedWage, SepoliaEscrowGateway } from "../src/lib/sepolia-gateway";

async function main() {
// Default is read-only. Sending requires BOTH --send and a server-side relayer key.
const send = process.argv.includes("--send");
const once = process.argv.includes("--once");
const records = process.argv.flatMap((item, index) => item === "--record" ? [process.argv[index + 1]] : []);
if (!records.length || records.some(id => !/^0x[0-9a-fA-F]{64}$/.test(id || ""))) throw new Error("Use --record 0x<recordId> (repeat for multiple wages). Default is read-only; --send opts into Sepolia transactions.");
await checkDeployment(sepoliaClient);
let gateway: SepoliaEscrowGateway | undefined;
if (send) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Set RELAYER_PRIVATE_KEY in the process environment before using --send. Never use a NEXT_PUBLIC_ variable.");
  const wallet = createWalletClient({ chain: sepolia, transport: http(CHAIN.rpc), account: privateKeyToAccount(key as Hex) });
  gateway = new SepoliaEscrowGateway(sepoliaClient, wallet, transaction => console.log(transaction.kind, transaction.hash, transaction.status));
}
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
const remaining = new Set(records as Hex[]);
console.log(send ? "Sepolia release sending enabled." : "Read-only mode: no transactions will be sent.");
let failures = 0;
do {
  try {
    const block = await sepoliaClient.getBlock();
    for (const recordId of remaining) {
      const wage = await readLockedWage(sepoliaClient, recordId);
      if (wage.released) { console.log(recordId, "already released"); remaining.delete(recordId); continue; }
      if (block.timestamp < wage.payday) { console.log(recordId, "seconds remaining:", String(wage.payday - block.timestamp)); continue; }
      if (!gateway) { console.log(recordId, "ready to release (read-only)"); if (once) remaining.delete(recordId); continue; }
      // If a request fails after submission, exit rather than blindly resending an uncertain transaction.
      await gateway.release(recordId);
      console.log(recordId, "released to", wage.employee, String(wage.amount), "KRWt"); remaining.delete(recordId);
    }
    failures = 0;
  } catch (error) {
    const value = error as { shortMessage?: string; message?: string };
    console.error(value.shortMessage || value.message || "Release check failed");
    if (send || ++failures >= 3) { process.exitCode = 1; break; }
  }
  if (once || stopping || !remaining.size) break;
  await new Promise(resolve => setTimeout(resolve, 10_000));
} while (!stopping);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Release watcher failed to start"); process.exitCode = 1; });
