import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { sepoliaClient } from "../src/lib/chain-config";
import { verifyAnchoredWork } from "../src/lib/sepolia-gateway";
import { checkWorkSignature, parseWorkBundle, validatePrepared } from "../src/lib/work-record";

// Public, already exported work records only. No wallet client or private key.
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg.startsWith("--") && arg !== "--live")) throw new Error("Usage: npm run evidence:verify -- [record.json ...] [--live]");
  const live = args.includes("--live");
  const files = args.filter(arg => arg !== "--live");
  if (!files.length) {
    const evidence = fileURLToPath(new URL("../../docs/demo-evidence/2026-11-28/", import.meta.url));
    files.push(resolve(evidence, "chemu-sepolia-0.json"), resolve(evidence, "chemu-sepolia-3.json"));
  }
  console.log(live ? "Live Sepolia read-only verification. No transactions will be sent." : "Offline verification: original hash, record ID and both signatures. No chain query.");
  for (const file of files) {
    const bundle = parseWorkBundle(await readFile(file, "utf8"));
    await validatePrepared(bundle);
    for (const role of ["employer", "employee"] as const) {
      const signature = bundle.signatures[role];
      if (!signature) throw new Error(`${file}: missing ${role} signature`);
      await checkWorkSignature(bundle, role, signature);
    }
    console.log(`PASS nonce=${bundle.record.nonce} record=${bundle.recordId}`);
    if (live) {
      const proof = await verifyAnchoredWork(sepoliaClient, bundle);
      const receipt = await sepoliaClient.getTransactionReceipt({ hash: proof.transactionHash });
      if (receipt.status !== "success") throw new Error("Lock transaction verification failed");
      console.log(`  WageLocked=${proof.transactionHash} released=${proof.wage.released}`);
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Evidence verification failed"); process.exitCode = 1; });
