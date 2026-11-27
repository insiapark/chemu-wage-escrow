"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { sepolia } from "wagmi/chains";

// Mock and Sepolia routes share the connector; only Sepolia's explicit actions send transactions.
const config = createConfig({ chains: [sepolia], connectors: [injected()], transports: { [sepolia.id]: http() }, ssr: true });
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <WagmiProvider config={config}><QueryClientProvider client={client}>{children}</QueryClientProvider></WagmiProvider>;
}
