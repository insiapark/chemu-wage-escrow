"use client";

import { CHAIN } from "./chain-config";
import type { ChainTransaction } from "./sepolia-gateway";
import type { PreparedWork } from "./work-record";

export interface ChainSession {
  version: 1;
  employer: string;
  employee: string;
  payday: string;
  agreed: boolean;
  prepared: PreparedWork | null;
  history: PreparedWork[];
  transactions: ChainTransaction[];
}
const KEY = `chemu:sepolia:${CHAIN.escrow}:v1`;
const INITIAL: ChainSession = { version: 1, employer: CHAIN.employer, employee: CHAIN.employee, payday: "", agreed: false, prepared: null, history: [], transactions: [] };
let snapshot = INITIAL;
let initialized = false;
let storageWarning = "";
const listeners = new Set<() => void>();
function valid(value: unknown): value is ChainSession {
  const s = value as ChainSession | null;
  return !!s && s.version === 1 && typeof s.employer === "string" && typeof s.employee === "string" && typeof s.payday === "string" && typeof s.agreed === "boolean" && Array.isArray(s.history) && Array.isArray(s.transactions);
}
function emit() { listeners.forEach(listener => listener()); }
export function initializeChainSession() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const parsed: unknown = JSON.parse(raw); if (valid(parsed)) snapshot = parsed; else storageWarning = "저장된 연동 기록 형식이 달라 새 세션을 열었어요."; } }
  catch { storageWarning = "저장된 연동 기록을 읽지 못했어요."; }
  window.addEventListener("storage", event => {
    if (event.key !== KEY || !event.newValue) return;
    try { const parsed: unknown = JSON.parse(event.newValue); if (valid(parsed)) { snapshot = parsed; emit(); } } catch { /* keep current valid session */ }
  });
  emit();
}
export function updateChainSession(update: (current: ChainSession) => ChainSession) {
  snapshot = update(snapshot);
  try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { storageWarning = "브라우저에 기록을 저장하지 못했어요. 새로고침 전에 JSON 기록을 내보내 주세요."; }
  emit();
}
export function trackTransaction(transaction: ChainTransaction) {
  updateChainSession(current => {
    const transactions = [transaction, ...current.transactions.filter(item => item.hash !== transaction.hash)];
    const prepared = current.prepared;
    const history = prepared && transaction.kind === "lock" && transaction.status === "confirmed" && prepared.recordId === transaction.recordId
      ? [prepared, ...current.history.filter(item => item.recordId !== transaction.recordId)] : current.history;
    return { ...current, transactions, history };
  });
}
export const chainSnapshot = () => snapshot;
export const chainServerSnapshot = () => INITIAL;
export const chainStorageWarning = () => storageWarning;
export const chainSubscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
