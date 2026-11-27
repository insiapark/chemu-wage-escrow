import { createPublicClient, http, type Abi, type Address } from "viem";
import { sepolia } from "viem/chains";
import escrowArtifact from "../contracts/DailyWageEscrow.json";
import tokenArtifact from "../contracts/MockKRWt.json";
import deployment from "../contracts/sepolia.json";

export const CHAIN = {
  id: 11155111,
  escrow: deployment.contracts.DailyWageEscrow as Address,
  token: deployment.contracts.MockKRWt as Address,
  deploymentBlock: BigInt(deployment.blockNumber),
  rpc: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  employer: (process.env.NEXT_PUBLIC_DEMO_EMPLOYER || deployment.deployer) as Address,
  employee: (process.env.NEXT_PUBLIC_DEMO_EMPLOYEE || "0xAF571F133831cDC75D1de9d79519E2AE73d9ecc4") as Address,
  domain: { name: "ChemU Daily Wage Escrow", version: "1", chainId: 11155111, verifyingContract: deployment.contracts.DailyWageEscrow as Address },
} as const;
export const escrowAbi = escrowArtifact.abi as Abi;
export const tokenAbi = tokenArtifact.abi as Abi;
export const sepoliaClient = createPublicClient({ chain: sepolia, transport: http(CHAIN.rpc, { timeout: 20_000, retryCount: 1 }) });
