import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A fresh browser with no injected wallet. Only historical record queries occur.
const evidence = fileURLToPath(new URL("../../docs/demo-evidence/2026-11-28/", import.meta.url));
const screenshots = resolve(evidence, "screenshots");
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, timezoneId: "Asia/Seoul" });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:3000/sepolia");
  await page.getByTestId("chain-available").filter({ hasText: /[0-9,]+ KRWt/ }).waitFor({ timeout: 90_000 });
  await page.locator("#chain-record-id").fill("0x7f4797e5719cee910cd022637023bdb003c75395110024114921af2e2827c815");
  await page.getByRole("button", { name: "체인 기록 조회하기", exact: true }).click();
  await page.getByRole("button", { name: "이미 지급됐어요", exact: true }).waitFor({ timeout: 90_000 });
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "보관과 지급 확인", exact: true }) }).screenshot({ path: resolve(screenshots, "scheduled-payment-live.png") });
  const proofCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "원본과 체인 지문 대조", exact: true }) });
  for (const nonce of [0, 3]) {
    await page.locator("#chain-proof-file").setInputFiles(resolve(evidence, `chemu-sepolia-${nonce}.json`));
    const verify = page.getByRole("button", { name: "파일과 체인 대조하기", exact: true });
    await verify.waitFor();
    // File reading is asynchronous; wait for the action to become available.
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "파일과 체인 대조하기" && !button.disabled));
    await verify.click();
    await proofCard.getByRole("status").filter({ hasText: "체인에 보관한 원본과 일치해요." }).waitFor({ timeout: 120_000 });
    const expectedLock = nonce === 0 ? "0xb75cfc9f875008de757e6b93dbe8b4c4621e3333c1b96e49140eca805c3c4479" : "0x52bc45f3590b832fc40f57ed04743ee7755e7e5e2816a368bcbaf2a7e274b7df";
    if (await proofCard.getByRole("link", { name: "보관 거래 확인" }).getAttribute("href") !== `https://sepolia.etherscan.io/tx/${expectedLock}`) throw new Error(`Wrong proof displayed for nonce ${nonce}`);
    await proofCard.screenshot({ path: resolve(screenshots, `json-${nonce}-verified-live.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await proofCard.screenshot({ path: resolve(screenshots, "json-3-verified-mobile-live.png") });
  const report = {
    capturedAt: new Date().toISOString(),
    scope: "Fresh Edge browser, live Sepolia RPC, historical record queries only. No connected wallet or transaction submission.",
    recordId: "0x7f4797e5719cee910cd022637023bdb003c75395110024114921af2e2827c815",
    employer: await page.locator("#chain-employer").inputValue(),
    employee: await page.locator("#chain-employee").inputValue(),
    availableAtCapture: await page.getByTestId("chain-available").innerText(),
    verifiedFiles: ["chemu-sepolia-0.json", "chemu-sepolia-3.json"],
    mobileHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    errors,
  };
  await writeFile(resolve(evidence, "browser-capture.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || report.mobileHorizontalOverflow) process.exitCode = 1;
} finally { await browser.close(); }
