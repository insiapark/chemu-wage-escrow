import { expect, test, type Page } from "@playwright/test";
import { mnemonicToAccount } from "viem/accounts";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name, exact: true }).click();
const role = (page: Page, name: "알바생" | "사장님") => page.getByRole("group", { name: "앱 역할 선택" }).getByRole("button", { name, exact: true }).click();
async function contract(page: Page) {
  await role(page, "사장님"); await nav(page, "근로계약");
  await page.getByRole("button", { name: "근로계약 보내기", exact: true }).click();
  await role(page, "알바생");
  await expect(page.getByText("주휴수당 주 37,152원이 빠져 있어요", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "수정 요청하기" }).click();
  await role(page, "사장님");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "고친 계약 보내기" }).click();
  await role(page, "알바생");
  await page.getByRole("button", { name: "계약에 동의하기" }).click();
  await expect(page.getByText("동의 완료", { exact: true })).toBeVisible();
}
async function lock(page: Page) {
  await contract(page); await nav(page, "출퇴근");
  await page.getByRole("button", { name: "출근 기록하기" }).click();
  await page.getByRole("button", { name: "퇴근 기록하기" }).click();
  await page.getByRole("button", { name: "내 기록에 연습 서명하기" }).click();
  await expect(page.getByText("연습 서명 완료", { exact: true })).toBeVisible();
  await role(page, "사장님");
  await page.getByRole("button", { name: "내 기록에 연습 서명하기" }).click();
  await expect(page.getByRole("button", { name: "확정하고 보관하기" })).toBeEnabled();
  await page.getByRole("button", { name: "확정하고 보관하기" }).click();
  await expect(page.getByRole("heading", { name: "₩92,880 보관했어요" })).toBeVisible();
}

test.beforeEach(async ({ page }) => { await page.goto("/"); await expect(page.getByRole("heading", { name: "오늘", exact: true })).toBeVisible(); });

test("contract, shared attendance, two signatures, lock, verification, persistence, payday", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await lock(page);
  const second = await context.newPage(); await second.goto("/");
  await expect(second.locator(".hero-amount")).toHaveText("₩984,528");
  await second.close();
  await page.reload(); await nav(page, "기록 대조");
  await page.getByRole("button", { name: "현재 기록 불러오기" }).click();
  await page.getByRole("button", { name: "기록 대조하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "보관한 기록과 일치해요" })).toBeVisible();
  const original = await page.getByLabel("기록 JSON").inputValue();
  await page.getByLabel("기록 JSON").fill(original.replace('"wage": 92880', '"wage": 1'));
  await page.getByRole("button", { name: "기록 대조하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "파일의 기록과 지문이 달라요" })).toBeVisible();
  await page.getByRole("button", { name: "시연 설정" }).click();
  await page.getByRole("button", { name: "급여일을 20초 뒤로 정하기" }).click();
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await nav(page, "급여");
  await expect(page.getByRole("heading", { name: "연습 계좌에 들어왔어요" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".pay-amount")).toHaveText("₩984,528");
  expect(errors).toEqual([]);
});

test("outside location blocks attendance, request failure can be retried", async ({ page }) => {
  await contract(page); await nav(page, "출퇴근");
  await page.getByRole("button", { name: "시연 설정" }).click();
  await page.getByLabel("가게와의 거리").selectOption("45");
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await expect(page.getByRole("button", { name: "출근 기록하기" })).toBeDisabled();
  await page.getByRole("button", { name: "시연 설정" }).click();
  await page.getByLabel("가게와의 거리").selectOption("12");
  await page.getByRole("button", { name: "다음 요청 한 번 실패시키기" }).click();
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await page.getByRole("button", { name: "출근 기록하기" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("기록과 보관된 돈은 그대로");
  await expect(page.getByRole("button", { name: "출근 기록하기" })).toBeEnabled();
  await page.getByRole("button", { name: "출근 기록하기" }).click();
  await expect(page.getByRole("button", { name: "퇴근 기록하기" })).toBeVisible();
});

test("mobile navigation fits and reset requires confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".hero-amount")).toBeVisible();
  await expect(page.locator(".shift-card .badge")).toHaveCSS("font-size", "13px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-home.png", fullPage: true });
  await role(page, "사장님"); await nav(page, "보관함");
  await page.getByLabel("채울 금액").fill("100000");
  await page.getByRole("button", { name: "연습 보관함 채우기" }).click();
  await expect(page.getByText("₩550,000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "시연 설정" }).click();
  await page.getByRole("button", { name: "시연 처음부터 시작", exact: true }).click();
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await expect(page.getByText("₩550,000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "시연 설정" }).click();
  await page.getByRole("button", { name: "시연 처음부터 시작", exact: true }).click();
  await page.getByRole("button", { name: "처음부터 시작하기", exact: true }).click();
  await expect(page.locator(".hero-amount")).toHaveText("₩891,648");
});

test("desktop reference screenshot", async ({ page }) => {
  await expect(page.locator(".hero-amount")).toHaveText("₩891,648");
  await page.screenshot({ path: "test-results/desktop-home.png", fullPage: true });
});

test("injected wallet signs the same EIP-712 record and handles user rejection", async ({ page }) => {
  const signer = mnemonicToAccount("test test test test test test test test test test test junk");
  await page.exposeFunction("signFixtureTypedData", async (text: string) => signer.signTypedData(JSON.parse(text)));
  await page.addInitScript(({ address }) => {
    const target = window as unknown as {
      ethereum: unknown;
      signFixtureTypedData: (text: string) => Promise<string>;
      rejectNextSignature: boolean;
    };
    target.rejectNextSignature = true;
    target.ethereum = {
      isMetaMask: true,
      on() {}, removeListener() {},
      async request({ method, params }: { method: string; params?: string[] }) {
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_switchEthereumChain") return null;
        if (method === "eth_signTypedData_v4") {
          if (target.rejectNextSignature) { target.rejectNextSignature = false; throw Object.assign(new Error("User rejected request"), { code: 4001 }); }
          return target.signFixtureTypedData(params![1]);
        }
        throw Object.assign(new Error(`Unsupported fixture method: ${method}`), { code: -32601 });
      },
    };
  }, { address: signer.address });
  await page.reload();
  await contract(page); await nav(page, "출퇴근");
  await page.getByRole("button", { name: "출근 기록하기" }).click();
  await page.getByRole("button", { name: "퇴근 기록하기" }).click();
  await page.getByRole("button", { name: "지갑 연결", exact: true }).click();
  await expect(page.getByRole("button", { name: /0xf39F.*해제/ })).toBeVisible();
  await page.getByRole("button", { name: "연결한 지갑으로 서명하기" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("지갑 서명을 닫았어요");
  await page.getByRole("button", { name: "연결한 지갑으로 서명하기" }).click();
  await expect(page.getByText("지갑 서명 완료", { exact: true })).toBeVisible();
  await role(page, "사장님");
  await page.getByRole("button", { name: "내 기록에 연습 서명하기" }).click();
  await page.getByRole("button", { name: "확정하고 보관하기" }).click();
  await expect(page.getByRole("heading", { name: "₩92,880 보관했어요" })).toBeVisible();
});
