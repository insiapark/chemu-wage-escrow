"use client";

import { createInitialState } from "./fixtures";
import { MockEscrowGateway } from "./gateway";
import type { DemoState } from "./types";

const STORAGE_KEY = "chemu:demo:v1";
const INITIAL = createInitialState();
let snapshot = INITIAL;
let initialized = false;
let persistenceError = "";
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
export function initializeStore() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === 1 && parsed.participants && parsed.attendance && parsed.contract && Array.isArray(parsed.receipts) && Array.isArray(parsed.events) && Array.isArray(parsed.usedNonces)) snapshot = parsed;
      else persistenceError = "이전 시연 데이터 형식이 달라 새 시연을 열었어요.";
    }
  } catch { persistenceError = "저장한 데이터를 읽지 못했어요. 현재 탭에서는 계속 시연할 수 있어요."; }
  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY) return;
    try { snapshot = event.newValue ? JSON.parse(event.newValue) : createInitialState(); emit(); } catch { /* preserve current session */ }
  });
  emit();
}
export const repository = {
  read: () => snapshot,
  write: (state: DemoState) => {
    snapshot = state;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { persistenceError = "브라우저 저장 공간을 사용할 수 없어 새로고침하면 기록이 사라져요."; }
    emit();
  },
};
export const gateway = new MockEscrowGateway(repository);
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => INITIAL;
export const getPersistenceError = () => persistenceError;
export function resetDemo() { gateway.clearFailure(); repository.write(createInitialState()); }
