"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSignTypedData } from "wagmi";
import type { Address } from "viem";
import { ArrowUpRight, Bell, CalendarDays, Check, CheckCheck, ChevronRight, Clock3, Download, FileCheck2, FileText, Home, Info, LockKeyhole, MapPin, Play, RotateCcw, Settings2, ShieldCheck, Store, Upload, Wallet, X } from "lucide-react";
import { DEMO } from "@/lib/fixtures";
import { weeklyAllowance } from "@/lib/domain";
import { monthDay, won } from "@/lib/format";
import { gateway, getPersistenceError, getServerSnapshot, getSnapshot, initializeStore, resetDemo, subscribe } from "@/lib/store";
import { attendanceTypedData, verifyAttendanceSignature } from "@/lib/signatures";
import { exportBundle, verifyBundle } from "@/lib/verification";
import type { DemoState, Role } from "@/lib/types";

type View = "today" | "contract" | "clock" | "vault" | "pay" | "verify";
type Run = (label: string, action: () => Promise<unknown>) => Promise<void>;
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const date = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "numeric" }).format(new Date(value));
const statusLabel = { scheduled: "남은 근무", working: "근무 중", pending: "확정 대기", locked: "보관됨", paid: "입금됨" };

function Button({ children, secondary = false, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button type="button" className={`${secondary ? "button secondary" : "button primary"} ${className}`} {...props}>{children}</button>;
}
function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warning" | "brand" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return <div className="data-row"><span>{label}</span><strong>{value}</strong></div>;
}
function Callout({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`callout ${warning ? "warning" : ""}`}><Info size={18} aria-hidden="true" /><div>{children}</div></div>;
}
function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-head"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={22} /></button></div>{children}
  </dialog>;
}

export function DemoApp({ initialView = "today" }: { initialView?: View }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>("worker");
  const [view, setView] = useState<View>(initialView);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [distance, setDistance] = useState<number | null>(12);
  const [settings, setSettings] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [failureArmed, setFailureArmed] = useState(false);
  const busy = useRef(false);
  const autoRelease = useRef(false);
  const account = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData();
  const [addresses, setAddresses] = useState({ worker: state.participants.worker as string, employer: state.participants.employer as string });

  useEffect(() => { initializeStore(); setReady(true); }, []);
  useEffect(() => { setAddresses({ ...state.participants }); }, [state.participants]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(timer); }, [notice]);

  const run: Run = async (label, action) => {
    if (busy.current) return;
    busy.current = true; setPending(label); setError("");
    try { await action(); setNotice(label); }
    catch (e) {
      const message = e instanceof Error ? e.message : "처리하지 못했어요. 다시 시도해 주세요.";
      setError(/reject|denied|취소/i.test(message) ? "지갑 서명을 닫았어요. 기록은 그대로예요. 다시 서명할 수 있어요." : message.slice(0, 350));
    } finally { busy.current = false; setPending(""); setFailureArmed(false); }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const current = getSnapshot();
      if (current.attendance.status !== "locked" || Date.now() < Date.parse(current.payday) || busy.current || autoRelease.current) return;
      autoRelease.current = true;
      void run("급여가 연습 계좌에 들어왔어요", () => gateway.execute({ type: "release", now: new Date().toISOString() })).finally(() => { autoRelease.current = false; });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const signWallet = () => run("지갑 서명을 확인했어요", async () => {
    if (!account.address) throw new Error("상단의 지갑 연결을 먼저 눌러 주세요.");
    if (account.address.toLowerCase() !== state.participants[role].toLowerCase()) throw new Error("시연 설정에 적힌 역할별 지갑 주소와 현재 지갑이 달라요. 지갑 계정을 바꿔 주세요.");
    const signature = await signTypedDataAsync(attendanceTypedData(state));
    const value = await verifyAttendanceSignature(state, role, signature, "wallet");
    await gateway.execute({ type: "sign", role, value });
  });

  const navigate = (target: View) => { setView(target); setError(""); };
  const nav = [
    { id: "today" as const, label: "오늘", icon: Home },
    { id: "contract" as const, label: "근로계약", icon: FileText },
    { id: "clock" as const, label: role === "worker" ? "출퇴근" : "근무 확정", icon: Clock3 },
    { id: "vault" as const, label: "보관함", icon: LockKeyhole },
    { id: "pay" as const, label: "급여", icon: Wallet },
    { id: "verify" as const, label: "기록 맞춰 보기", icon: ShieldCheck },
  ];
  const stage = state.contract.status !== "agreed" ? 0 : state.attendance.status === "scheduled" ? 1 : state.attendance.status === "working" ? 2 : state.attendance.status === "pending" ? 3 : state.attendance.status === "locked" ? 4 : 5;
  const currentTitle = nav.find(item => item.id === view)?.label;
  const signature = state.signatures[role];

  return <div className="workspace">
    <a href="#app-content" className="skip-link">본문으로 이동</a>
    <header className="workspace-header">
      <a className="brand" href="/" aria-label="체무 홈"><span className="brand-symbol"><LockKeyhole size={23} strokeWidth={2.2} /></span><span>체무<span className="brand-dot">.</span></span></a>
      <span className="header-caption">일한 만큼, 차곡차곡</span>
      <div className="header-actions"><span className="mode-label">목데이터 시연</span>
        <button className="wallet-button" type="button" disabled={!!pending} onClick={() => {
          if (account.isConnected) disconnect();
          else void run("지갑을 연결했어요", async () => { if (!connectors[0]) throw new Error("브라우저 지갑을 설치하면 실제 서명도 확인할 수 있어요. 연습 서명은 지갑 없이 쓸 수 있어요."); await connectAsync({ connector: connectors[0] }); });
        }}><Wallet size={17} />{account.address ? `${short(account.address)} · 해제` : "지갑 연결"}</button>
        <button type="button" className="icon-button" aria-label="시연 설정" onClick={() => setSettings(true)}><Settings2 size={21} /></button>
      </div>
    </header>

    <div className="workspace-body">
      <aside className="sidebar">
        <div className="sidebar-label">나의 체무</div>
        <div className="role-switch" role="group" aria-label="앱 역할 선택">
          <button type="button" aria-pressed={role === "worker"} onClick={() => { setRole("worker"); setError(""); }}>알바생</button>
          <button type="button" aria-pressed={role === "employer"} onClick={() => { setRole("employer"); setError(""); }}>사장님</button>
        </div>
        <nav aria-label="주 메뉴">{nav.map(item => <button type="button" key={item.id} className={`nav-item ${view === item.id ? "selected" : ""}`} aria-current={view === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><item.icon size={20} /><span>{item.label}</span>{view === item.id && <span className="nav-indicator" />}</button>)}</nav>
        <div className="sidebar-bottom"><div className="tiny-store"><Store size={18} /><span>새싹편의점 연희점<small>함께 확인하는 근무 기록</small></span></div><a href="/reference/wireframe/demo.html" target="_blank" rel="noreferrer"><Play size={16} />기존 1분 시연 보기<ArrowUpRight size={14} /></a><button type="button" onClick={() => setResetting(true)}><RotateCcw size={16} />시연 처음부터 시작</button></div>
      </aside>

      <main id="app-content" className="main-area">
        <div className="page-heading"><div><div className="eyebrow">{role === "worker" ? "A님의 체무" : "사장님의 체무"}</div><h1>{currentTitle}</h1></div><div className="store-chip"><span className="store-icon"><Store size={18} /></span><span>새싹편의점<small>연희점</small></span></div></div>
        <div className="demo-notice"><Info size={16} /><span>시연 버전 · 실제 돈 대신 연습용 돈으로 움직여요</span></div>
        <a className="chain-mode-link" href="/sepolia"><Wallet size={18} />Sepolia 실제 거래 모드 열기<ChevronRight size={16} /></a>
        {!ready ? <div className="loading-card" role="status">내 기록을 불러오고 있어요…</div> : <>
          {getPersistenceError() && <Callout warning>{getPersistenceError()}</Callout>}
          {error && <div className="error-box" role="alert"><Info size={20} /><span>{error}</span><button type="button" className="icon-button" aria-label="오류 안내 닫기" onClick={() => setError("")}><X size={18} /></button></div>}
          {pending && <div className="pending-strip" role="status"><span className="spinner" />처리하고 있어요. 잠시만 기다려 주세요.</div>}

          {view === "today" && <div className="screen-stack">
            <div className="section-caption">11월 29일 일요일 · 시연 날짜 <span>·</span> {role === "worker" ? "오늘도 내 몫이 쌓이는 날" : "우리 가게의 오늘"}</div>
            <section className="money-card">
              <div className="money-card-head"><span>{role === "employer" ? "알바생 몫으로 보관된 돈" : state.received ? "연습 계좌에 들어온 돈" : "오늘까지 보관된 돈"}</span><span className="lock-circle"><LockKeyhole size={20} /></span></div>
              <div className="hero-amount">{won(state.received || state.locked)}</div>
              <p>{state.received ? "11월 급여가 모두 들어왔어요" : "급여일까지 사장님도 꺼낼 수 없어요"}</p>
              <div className="money-divider" /><div className="shift-dots" aria-label={`이번 달 근무 9일 중 ${state.attendance.status === "locked" || state.attendance.status === "paid" ? 9 : 8}일 보관됨`}>{Array.from({ length: 9 }, (_, i) => <span key={i} className={i < 8 || ["locked", "paid"].includes(state.attendance.status) ? "done" : "future"}>{i < 8 || ["locked", "paid"].includes(state.attendance.status) ? <Check size={13} /> : null}</span>)}</div>
              <div className="card-footer-row"><span>이번 달 예상 급여</span><strong>{won(state.payrollAmount)}</strong></div>
              <button type="button" className="text-button on-dark" onClick={() => navigate("pay")}>급여 내역 보기<ChevronRight size={16} /></button>
            </section>
            <div className="section-title"><h2>{role === "worker" ? "오늘 근무" : "오늘 할 일"}</h2><span>{monthDay(DEMO.workDate)}</span></div>
            <section className="card shift-card"><div className="card-topline"><Badge tone={state.attendance.status === "pending" ? "warning" : "brand"}>{statusLabel[state.attendance.status]}</Badge><Clock3 size={20} className="muted" /></div><h2>오후 10:00 ~ 오전 8:00</h2><p>새싹편의점 연희점 · 쉬는 시간 1시간</p><div className="wage-line"><span>오늘 일당</span><strong>{won(state.attendance.wage)}</strong></div>
              {state.contract.status !== "agreed" ? <Button disabled={!!pending} onClick={() => navigate("contract")}>{role === "worker" ? "근로계약 확인하기" : "근로계약 보내기"}</Button> : <Button disabled={!!pending} onClick={() => navigate("clock")}>{role === "employer" ? "근무 기록 확인하기" : state.attendance.status === "scheduled" ? "출근하기" : state.attendance.status === "working" ? "퇴근하기" : "오늘 기록 확인하기"}</Button>}
            </section>
            <button type="button" className="link-card" onClick={() => navigate("contract")}><span className="round-icon"><FileCheck2 size={21} /></span><span><strong>내 근로계약</strong><small>{state.contract.status === "agreed" ? "확정한 계약을 언제든 볼 수 있어요" : "일하기 전에 조건을 함께 확인해요"}</small></span><ChevronRight size={20} /></button>
            {role === "employer" && <button type="button" className="link-card" onClick={() => navigate("vault")}><span className="round-icon"><Wallet size={21} /></span><span><strong>채워 둔 돈 {won(state.available)}</strong><small>근무를 확정하면 일당이 보관돼요</small></span><ChevronRight size={20} /></button>}
            <div className="footnote">이전 근무 8일과 주휴수당 4주가 들어 있는 시연 데이터예요.</div>
          </div>}

          {view === "contract" && <ContractScreen state={state} role={role} run={run} disabled={!!pending} onNext={() => navigate("clock")} />}

          {view === "clock" && <div className="screen-stack">
            <section className="card"><div className="card-topline"><Badge tone={state.attendance.status === "pending" ? "warning" : "good"}>{statusLabel[state.attendance.status]}</Badge><span className="muted">11월 29일 근무</span></div>
              <h2 className="large-title">{state.attendance.status === "scheduled" ? "오늘의 첫 기록을 남겨요" : state.attendance.status === "working" ? "오늘도 수고하고 있어요" : state.attendance.status === "pending" ? "같은 근무 기록을 확인해요" : "오늘 일당을 보관했어요"}</h2>
              {["scheduled", "working"].includes(state.attendance.status) && <img className="hero-illustration" src="/assets/iso/iso_03_clock_in.png" alt="" />}
              <div className="record-rows"><Row label="출근" value={state.attendance.checkIn ? "11월 29일 오후 10:00" : "아직 출근하지 않았어요"} /><Row label="퇴근" value={state.attendance.checkOut ? "11월 30일 오전 8:00" : "아직 퇴근하지 않았어요"} /><Row label="쉬는 시간" value="1시간" /><Row label="일한 시간" value="9시간" /><Row label="오늘 일당" value={won(state.attendance.wage)} /></div>
              {role === "worker" && ["scheduled", "working"].includes(state.attendance.status) && <><div className={`location-pill ${distance === null || distance > 30 ? "outside" : ""}`}><MapPin size={17} />{distance === null ? "위치를 찾지 못했어요" : `가게에서 ${distance}m · ${distance <= 30 ? "출퇴근할 수 있어요" : "30m 안으로 와 주세요"}`}</div><p className="helper">시연 설정에서 위치를 바꿀 수 있어요. 출퇴근 시각은 시연용 고정값이에요.</p><Button disabled={!!pending || state.contract.status !== "agreed" || distance === null || distance > 30} onClick={() => void run(state.attendance.status === "scheduled" ? "출근을 기록했어요" : "퇴근을 기록했어요", () => gateway.execute({ type: state.attendance.status === "scheduled" ? "check-in" : "check-out", distance: distance! }))}>{state.attendance.status === "scheduled" ? "출근 기록하기" : "퇴근 기록하기"}</Button>{state.contract.status !== "agreed" && <Callout warning>근로계약을 먼저 확정해 주세요.</Callout>}</>}
              {role === "employer" && ["scheduled", "working"].includes(state.attendance.status) && <Callout>A님의 퇴근 기록이 생기면 여기에서 근무를 확정할 수 있어요.</Callout>}
            </section>
            {state.attendance.status === "pending" && <section className="card"><h2>두 사람이 같은 기록에 서명해요</h2><p>서명한 기록을 확인하고 일당을 보관해요.</p><div className="signature-row"><span>A님</span><Badge tone={state.signatures.worker ? "good" : "neutral"}>{state.signatures.worker ? `${state.signatures.worker.mode === "sample" ? "연습 " : "지갑 "}서명 완료` : "서명 전"}</Badge></div><div className="signature-row"><span>사장님</span><Badge tone={state.signatures.employer ? "good" : "neutral"}>{state.signatures.employer ? `${state.signatures.employer.mode === "sample" ? "연습 " : "지갑 "}서명 완료` : "서명 전"}</Badge></div><p className="helper">연습 서명도 실제 EIP-712 서명과 주소 복구를 사용해요. 공개된 시연 계정이며 본인 인증을 뜻하지 않아요.</p><div className="button-stack"><Button secondary disabled={!!pending || !!signature} onClick={() => void run("근무 기록에 연습 서명했어요", () => gateway.signSample(role))}>{signature ? "내 서명을 확인했어요" : "내 기록에 연습 서명하기"}</Button><button type="button" className="text-button" disabled={!!pending || !!signature} onClick={() => void signWallet()}>연결한 지갑으로 서명하기</button></div>
              {role === "employer" ? <><Button disabled={!!pending || !state.signatures.worker || !state.signatures.employer} onClick={() => void run("92,880원을 보관했어요", () => gateway.lock())}>확정하고 보관하기</Button><p className="helper">채워 둔 돈 {won(state.available)}에서 일당이 옮겨져요.</p></> : <Callout>서명한 뒤 사장님이 확정하면 일당이 보관돼요.</Callout>}
            </section>}
            {["locked", "paid"].includes(state.attendance.status) && <section className="card result-card"><span className="result-icon"><CheckCheck size={28} /></span><h2>{won(state.attendance.wage)} 보관했어요</h2><p>{state.attendance.status === "paid" ? "보관했던 일당이 급여와 함께 입금됐어요." : "사장님도 급여일 전에는 꺼낼 수 없어요."}</p><Button onClick={() => navigate("verify")}>기록 맞춰 보기</Button></section>}
          </div>}

          {view === "vault" && <VaultScreen state={state} role={role} run={run} disabled={!!pending} />}
          {view === "pay" && <div className="screen-stack"><section className="card payday-card"><Badge tone="brand">{state.received ? "입금 완료" : "11월 급여"}</Badge><img className="hero-illustration" src="/assets/iso/iso_06_payday.png" alt="" /><h2>{state.received ? "연습 계좌에 들어왔어요" : "급여일에 받을 돈"}</h2><div className="pay-amount">{won(state.received || state.payrollAmount)}</div><p>{date(state.payday)}</p>{state.received > 0 && <p className="positive">일한 만큼, 잘 받았어요.</p>}</section><section className="card"><h2>급여는 이렇게 계산했어요</h2><Row label="일당 · 92,880원 × 9일" value={won(835_920)} /><Row label="주휴수당 · 37,152원 × 4주" value={won(148_608)} /><Row label="시연 급여 합계" value={won(state.payrollAmount)} /></section><Callout>보관된 돈 {won(state.locked)} · 입금된 돈 {won(state.received)}<br />이번 시연은 원화 계좌 입금 과정을 모의로 보여 줘요. 세금과 4대보험 공제는 다루지 않아요.</Callout><p className="helper">시연 설정에서 급여일을 20초 뒤로 잡으면, 이 앱이 열린 동안 자동으로 모의 입금해요. 실제 자동 지급 실행기는 컨트랙트 연동 후 연결해요.</p></div>}
          {view === "verify" && <VerificationScreen state={state} />}
        </>}
      </main>

      <aside className="context-panel" aria-label="시연 진행 상황"><div className="context-heading"><span className="eyebrow">함께 쌓이는 기록</span><Badge tone="brand">LIVE DEMO</Badge></div><h2>오늘 일당이<br />내 몫이 되기까지</h2><p className="context-description">두 앱의 기록이 하나로 이어져요.</p><ol className="journey">{[
        ["contract", "근로계약 확인", "조건을 함께 확인하고 확정해요"], ["clock", "출근 기록", "가게 30m 안에서 시작해요"], ["clock", "퇴근과 서명", "같은 기록에 두 사람이 서명해요"], ["clock", "일당 보관", "확정한 날의 일당이 묶여요"], ["pay", "급여일 입금", "정해 둔 시각에 내 몫을 받아요"],
      ].map(([target, title, description], index) => <li key={title} className={stage > index ? "complete" : stage === index ? "current" : ""}><span className="journey-marker">{stage > index ? <Check size={15} /> : index + 1}</span><button type="button" onClick={() => navigate(target as View)}><strong>{title}</strong><small>{description}</small></button></li>)}</ol><div className="context-divider" /><div className="context-subtitle"><h3>방금 남긴 기록</h3><Bell size={17} /></div>{state.events.length ? <ul className="event-list">{state.events.slice(0, 4).map(event => <li key={event.id}><span className="event-dot" /><div>{event.message}<small>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }).format(new Date(event.createdAt))}</small></div></li>)}</ul> : <div className="empty-events"><FileText size={26} /><p>첫 기록을 기다리고 있어요.<br />근로계약부터 확인해 볼까요?</p></div>}<div className="context-note"><ShieldCheck size={20} /><span>같은 브라우저의 두 역할이<br />하나의 시연 데이터를 공유해요.</span></div></aside>
    </div>
    {notice && <div className="toast" role="status"><Check size={18} />{notice}</div>}

    {settings && <Dialog title="시연 설정" onClose={() => setSettings(false)}><p className="helper">여기에서 바꾼 값은 발표용 모의 환경에만 적용돼요.</p><label className="field-label" htmlFor="distance">가게와의 거리</label><select id="distance" value={distance ?? "unknown"} onChange={event => setDistance(event.target.value === "unknown" ? null : Number(event.target.value))}><option value="12">12m · 출퇴근할 수 있어요</option><option value="45">45m · 출퇴근할 수 없어요</option><option value="unknown">위치를 찾지 못함</option></select><div className="settings-section"><h3>급여일 입금 시연</h3><p className="helper">현재: {date(state.payday)}<br />오늘 일당을 보관한 뒤 이 앱이 열린 상태에서 실행해 주세요.</p><Button secondary disabled={!!pending || state.received > 0} onClick={() => void run("급여일을 20초 뒤로 정했어요", () => gateway.execute({ type: "set-payday", value: new Date(Date.now() + 20_000).toISOString() }))}>급여일을 20초 뒤로 정하기</Button></div><div className="settings-section"><h3>시연 다시 시작</h3><Button secondary disabled={!!pending} onClick={() => { setSettings(false); setResetting(true); }}>시연 처음부터 시작</Button></div><div className="settings-section"><h3>오류 재현</h3><Button secondary disabled={failureArmed || !!pending} onClick={() => { gateway.failNext(); setFailureArmed(true); }}>{failureArmed ? "다음 요청이 한 번 실패해요" : "다음 요청 한 번 실패시키기"}</Button></div><div className="settings-section"><h3>실제 지갑으로 서명할 때</h3><p className="helper">EIP-712 규격은 연동 전 초안이에요. 두 주소를 먼저 설정한 뒤 각 지갑으로 서명해 주세요.</p>{(["worker", "employer"] as const).map(item => <label key={item} className="field-label">{item === "worker" ? "알바생 지갑" : "사장님 지갑"}<input value={addresses[item]} onChange={event => setAddresses({ ...addresses, [item]: event.target.value })} spellCheck={false} /></label>)}<Button secondary disabled={!!pending || !!state.signatures.worker || !!state.signatures.employer} onClick={() => void run("지갑 주소를 저장했어요", () => gateway.execute({ type: "set-participants", worker: addresses.worker as Address, employer: addresses.employer as Address }))}>두 지갑 주소 저장하기</Button></div></Dialog>}
    {resetting && <Dialog title="시연을 처음부터 시작할까요?" onClose={() => setResetting(false)}><p>이 브라우저의 계약, 근무 기록, 서명과 모의 거래가 초기화돼요.</p><div className="dialog-actions"><Button secondary onClick={() => setResetting(false)}>닫기</Button><Button disabled={!!pending} onClick={() => { resetDemo(); setRole("worker"); setView("today"); setError(""); setNotice("시연을 처음부터 시작해요"); setResetting(false); }}>처음부터 시작하기</Button></div></Dialog>}
  </div>;
}

function ContractScreen({ state, role, run, disabled, onNext }: { state: DemoState; role: Role; run: Run; disabled: boolean; onNext: () => void }) {
  const [allowance, setAllowance] = useState(state.contract.includesWeeklyAllowance);
  useEffect(() => { setAllowance(state.contract.includesWeeklyAllowance); }, [state.contract.includesWeeklyAllowance]);
  const c = state.contract;
  const editable = c.status === "draft" || c.status === "revision-requested";
  const missing = !c.includesWeeklyAllowance;
  const weekly = weeklyAllowance(c.weeklyHours, c.hourlyWage);
  // Titles follow worker 05, 06, 07, 56, 57 and owner 01, 03, 04 of the v79 screen design.
  const badge = c.status === "draft" ? "작성 전" : c.status === "revision-requested" ? "고쳐 달라고 함" : c.status === "agreed" ? "계약 확정됨" : missing ? "확인이 필요해요" : "확정 대기";
  const title = role === "employer"
    ? c.status === "draft" ? "A님 근로계약서를 등록해 주세요" : c.status === "revision-requested" ? "A님이 계약을 고쳐 달라고 요청했어요" : c.status === "review" ? "A님에게 근로계약을 보냈어요" : "A님 계약을 확정했어요"
    : c.status === "draft" ? "계약서를 기다리고 있어요" : c.status === "revision-requested" ? "사장님에게 고쳐 달라고 요청했어요" : c.status === "agreed" ? "계약이 확정됐어요" : missing ? `주휴수당 한 주 ${won(weekly)}이 빠져 있어요` : c.revision > 1 ? "사장님이 계약서에 주휴수당을 넣었어요" : "계약을 확인하고 확정해 주세요";
  const resend = c.status === "revision-requested";
  return <div className="screen-stack"><section className="card"><div className="card-topline"><Badge tone={c.status === "agreed" ? "good" : c.status === "review" && missing ? "warning" : "brand"}>{badge}</Badge><FileText size={20} className="muted" /></div><h2 className="large-title">{title}</h2><p>A님 · 새싹편의점 연희점</p><div className="record-rows"><Row label="시급" value={won(c.hourlyWage)} /><Row label="근무 시간" value="오후 10:00 ~ 오전 8:00" /><Row label="쉬는 시간" value="1시간" /><Row label="일한 시간" value="하루 9시간 · 주 18시간" /><Row label="주휴수당" value={c.includesWeeklyAllowance ? `한 주 ${won(weekly)}` : "계약에 빠져 있어요"} /><Row label="급여일" value="매달 10일" /></div>
      {role === "employer" && resend && <Callout warning><strong>A님이 주휴수당을 넣어 달라고 했어요</strong><br />A님은 주 18시간이라 한 주 {won(weekly)}이에요.</Callout>}
      {role === "employer" && editable && <><label className="checkbox-row"><input type="checkbox" checked={allowance} onChange={event => setAllowance(event.target.checked)} />주휴수당 한 주 {won(weekly)} 넣기</label>{!resend && <p className="helper">주휴수당을 빼고 보내면 A님 화면에 빠진 금액이 보여요.</p>}<Button disabled={disabled} onClick={() => void run(resend ? allowance ? "주휴수당을 넣어 다시 보냈어요" : "계약을 다시 보냈어요" : "근로계약을 보냈어요", () => gateway.execute({ type: "submit-contract", hourlyWage: DEMO.hourlyWage, includesWeeklyAllowance: allowance }))}>{resend ? allowance ? "주휴수당 넣고 다시 보내기" : "다시 보내기" : "근로계약 보내기"}</Button></>}
      {role === "employer" && c.status === "review" && <Callout>A님이 계약을 확정하면 바로 알려 드려요. 알바생 화면에서 이어 볼 수 있어요.</Callout>}
      {role === "worker" && c.status === "draft" && <Callout>사장님이 계약서를 보내면 확인하고 확정할 수 있어요.</Callout>}
      {role === "worker" && c.status === "revision-requested" && <Callout>사장님이 계약을 고치면 확정할 수 있어요.</Callout>}
      {role === "worker" && c.status === "review" && (missing ? <><Callout warning><strong>고쳐 달라고 요청하면 체무가 사장님에게 주휴수당을 넣어 달라고 대신 전해요</strong><br />주휴수당은 한 주 15시간 이상 일하고 빠짐없이 나오면 받는 돈이에요.</Callout><Button disabled={disabled} onClick={() => void run("사장님에게 고쳐 달라고 요청했어요", () => gateway.execute({ type: "request-revision" }))}>고쳐 달라고 요청하기</Button></> : <><Callout><strong>이제 계약을 확정할 수 있어요</strong><br />빠짐없이 나온 주마다 체무가 주휴수당 {won(weekly)}을 따로 보관해요.</Callout><Button disabled={disabled} onClick={() => void run("계약이 확정됐어요", () => gateway.execute({ type: "agree-contract" }))}>계약 확정하기</Button></>)}
      {c.status === "agreed" && <><Callout>{role === "worker" ? "오늘 근무부터 일당이 보관돼요. 가게 30m 안에서 출근할 수 있어요." : "A님이 퇴근하면 근무 확정 화면에서 이어 볼 수 있어요."}</Callout><Button onClick={onNext}>{role === "worker" ? "출퇴근 화면 보기" : "근무 확정 화면 보기"}</Button></>}
    </section><p className="footnote">계약 등록과 확정은 이 브라우저에 저장되는 시연용 기록이에요.</p></div>;
}

function VaultScreen({ state, role, run, disabled }: { state: DemoState; role: Role; run: Run; disabled: boolean }) {
  const [amount, setAmount] = useState("100000");
  return <div className="screen-stack"><section className="card"><div className="card-topline"><h2>두 돈을 나눠서 봐요</h2><LockKeyhole size={20} /></div>{role === "employer" && <div className="balance-block"><span>채워 둔 돈</span><strong>{won(state.available)}</strong><p>아직 알바생 몫으로 보관하기 전의 돈이에요.</p></div>}<div className="balance-block purple"><span>알바생 몫으로 보관된 돈</span><strong>{won(state.locked)}</strong><p>급여일 전에는 사장님도 꺼낼 수 없어요.</p></div></section>{role === "employer" ? <section className="card"><h2>보관함 채우기</h2><p>모의 충전으로 일당 보관을 준비해요.</p><label className="field-label" htmlFor="deposit-amount">채울 금액</label><div className="amount-input"><input id="deposit-amount" type="number" min="1" max="10000000" step="1" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} /><span>원</span></div><div className="amount-presets">{[100_000, 300_000, 500_000].map(n => <button type="button" key={n} onClick={() => setAmount(String(n))}>{n / 10_000}만 원</button>)}</div><Button disabled={disabled || !amount} onClick={() => void run("연습 보관함을 채웠어요", () => gateway.execute({ type: "deposit", amount: Number(amount) }))}>연습 보관함 채우기</Button><p className="helper">실제 계좌 출금이나 토큰 승인은 발생하지 않아요.</p></section> : <Callout>사장님이 근무를 확정하면 그날 일당이 이 보관함에 쌓여요.</Callout>}<section className="card"><h2>모의 거래 내역</h2>{state.receipts.length ? state.receipts.map(receipt => <div className="receipt-row" key={receipt.id}><span className="round-icon"><Check size={20} /></span><div><strong>{receipt.kind === "deposit" ? "보관함 채우기" : receipt.kind === "lock" ? "일당 보관" : "급여일 입금"}</strong><small>{receipt.id} · 모의 거래</small></div><b>{won(receipt.amount)}</b></div>) : <p className="empty-text">아직 모의 거래가 없어요.</p>}</section></div>;
}

function VerificationScreen({ state }: { state: DemoState }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyBundle>> | null>(null);
  const [checking, setChecking] = useState(false);
  const readText = (value: string) => { setText(value); setResult(null); setError(""); };
  const check = async () => { setChecking(true); setError(""); setResult(null); try { setResult(await verifyBundle(text, state.recordHash)); } catch (e) { setError(e instanceof Error ? e.message : "파일을 읽지 못했어요."); } finally { setChecking(false); } };
  const download = () => { const blob = new Blob([JSON.stringify(exportBundle(state), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "chemu-attendance-20261129.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <div className="screen-stack"><section className="card"><div className="card-topline"><Badge tone="brand">기록 맞춰 보기</Badge><ShieldCheck size={22} /></div><h2 className="large-title">확정한 기록과 맞춰 봐요</h2><p>체무는 기록을 저장할 때 기록 글자로 계산한 값을 함께 남겨요. 글자 하나만 바뀌어도 값이 달라져요.</p><div className="trusted-hash"><span>확정할 때 저장한 값 · SHA-256</span><code>{state.recordHash || "근무를 확정하면 저장한 값이 생겨요."}</code></div><div className="button-pair"><Button secondary disabled={!state.recordHash} onClick={() => readText(JSON.stringify(exportBundle(state), null, 2))}><FileText size={17} />현재 기록 불러오기</Button><Button secondary disabled={!state.recordHash} onClick={download}><Download size={17} />기록 파일 받기</Button></div><label className="upload-label"><Upload size={18} />기록 파일 고르기<input type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError("1MB 이하의 기록 파일을 선택해 주세요."); return; } void file.text().then(readText).catch(() => setError("파일을 읽지 못했어요. 다시 선택해 주세요.")); }} /></label><label className="field-label" htmlFor="record-json">기록 JSON</label><textarea id="record-json" value={text} onChange={event => readText(event.target.value)} rows={9} spellCheck={false} placeholder="기록을 불러오거나 JSON 파일을 선택해 주세요." /><Button disabled={!text || checking} onClick={() => void check()}>{checking ? "값을 계산하고 있어요" : "이 기록 맞춰 보기"}</Button></section>{error && <div className="error-box" role="alert">{error}</div>}{result && <section className={`card verification-result ${result.fileMatches && result.referenceMatches === true ? "matched" : "mismatch"}`} role="status"><ShieldCheck size={30} /><h2>{!result.fileMatches ? "저장한 기록과 달라요" : result.referenceMatches === false ? "확정할 때 저장한 기록과 달라요" : result.referenceMatches === null ? "파일 안의 값은 같아요" : "확정한 기록과 같아요"}</h2><p>{!result.fileMatches ? "파일 안의 글자가 바뀌어 지금 계산한 값이 달라요." : result.referenceMatches === false ? "파일 안의 값까지 다시 계산해 넣어도 확정할 때 저장한 값과 달라요." : result.referenceMatches === null ? "이 브라우저에 확정할 때 저장한 값이 없어 원래 기록인지는 알 수 없어요." : "확정할 때 저장한 값과 이 브라우저에서 계산한 값이 같아요."}</p><code>{result.computedHash}</code></section>}<Callout warning>확정할 때 저장한 값은 이 브라우저에만 있어요. 시연용이라 법적 진위 확인은 하지 않아요.</Callout></div>;
}
