"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { createWalletClient, custom, isAddress, type Address, type Hex, type EIP1193Provider } from "viem";
import { sepolia } from "viem/chains";
import { Check, Download, ExternalLink, FileText, Info, LockKeyhole, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { CHAIN, sepoliaClient } from "@/lib/chain-config";
import { chainErrorMessage } from "@/lib/chain-errors";
import { chainServerSnapshot, chainSnapshot, chainStorageWarning, chainSubscribe, initializeChainSession, trackTransaction, updateChainSession } from "@/lib/chain-session";
import { checkDeployment, readBalances, readLockedWage, SepoliaEscrowGateway, verifyAnchoredWork, type LockedWage } from "@/lib/sepolia-gateway";
import { DEMO } from "@/lib/fixtures";
import { exportWorkBundle, parseWorkBundle, prepareWork, validateParticipants, type PreparedWork } from "@/lib/work-record";

const money = (value?: bigint) => value === undefined ? "확인 전" : `${value.toLocaleString("ko-KR")} KRWt`;
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
const date = (seconds: bigint) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).format(new Date(Number(seconds) * 1000));
const localTime = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const documentedRecord = "0x4da2a43c54d5ec9f5eaa7c596e0dc87e850cf1eecfd98c3551b2698619b92efc";
const kindName = { approve: "토큰 사용 승인", fund: "보관함 충전", lock: "일당 보관", release: "급여 지급" };
const statusName = { pending: "확인 중", confirmed: "확인 완료", reverted: "실패", replaced: "교체됨" };

export function SepoliaApp() {
  const session = useSyncExternalStore(chainSubscribe, chainSnapshot, chainServerSnapshot);
  const account = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [balances, setBalances] = useState<Awaited<ReturnType<typeof readBalances>> | null>(null);
  const [amount, setAmount] = useState("100000");
  const [lookup, setLookup] = useState(documentedRecord);
  const [wage, setWage] = useState<LockedWage | null>(null);
  const [wageId, setWageId] = useState("");
  const [fileText, setFileText] = useState("");
  const [proof, setProof] = useState<Awaited<ReturnType<typeof verifyAnchoredWork>> | null>(null);
  const busy = useRef(false);
  const refreshing = useRef(0);
  const hasUnconfirmed = session.transactions.some(item => item.status === "pending");
  const frozen = !!session.prepared;
  const locked = !!session.prepared && session.history.some(item => item.recordId === session.prepared?.recordId);
  const run = async (label: string, action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true; setPending(label); setError(""); setNotice("");
    try { await action(); setNotice(label); }
    catch (e) {
      setError(chainErrorMessage(e));
    } finally { busy.current = false; setPending(""); }
  };
  const gateway = async () => {
    if (!account.isConnected || !account.connector) throw new Error("브라우저 지갑을 먼저 연결해 주세요.");
    if (hasUnconfirmed) throw new Error("전송한 거래의 확인이 끝나지 않았어요. 체인 상태를 새로 확인해 주세요.");
    const provider = await account.connector.getProvider();
    if (!provider) throw new Error("MetaMask를 설치한 브라우저 프로필에서 지갑을 연결해 주세요.");
    // Resolve the current provider on demand instead of waiting for a cached
    // wallet-client query after every account switch. Gateway checks stay fresh.
    const wallet = createWalletClient({ chain: sepolia, transport: custom(provider as EIP1193Provider, { retryCount: 0 }) });
    return new SepoliaEscrowGateway(sepoliaClient, wallet, trackTransaction);
  };
  const refreshBalances = async () => {
    const id = ++refreshing.current;
    const current = chainSnapshot();
    validateParticipants(current.employer, current.employee);
    const value = await readBalances(sepoliaClient, current.employer as Address, current.employee as Address);
    if (id === refreshing.current && current.employer === chainSnapshot().employer && current.employee === chainSnapshot().employee) setBalances(value);
  };
  const refreshTransactions = async () => {
    for (const item of chainSnapshot().transactions.filter(item => item.status === "pending")) {
      try {
        const receipt = await sepoliaClient.getTransactionReceipt({ hash: item.hash });
        trackTransaction({ ...item, status: receipt.status === "success" ? "confirmed" : "reverted" });
      } catch { /* Keep unknown outcomes pending. Never silently retry a submitted write. */ }
    }
  };
  const queryWage = async (id: string) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) throw new Error("올바른 기록 ID를 입력해 주세요.");
    setWage(null); setWageId("");
    await checkDeployment(sepoliaClient);
    const value = await readLockedWage(sepoliaClient, id as Hex);
    setWage(value); setWageId(id);
  };
  useEffect(() => {
    initializeChainSession(); setReady(true);
    if (!chainSnapshot().payday) updateChainSession(current => ({ ...current, payday: localTime(new Date(Date.now() + 10 * 60_000)) }));
    void refreshBalances().catch(e => setError(e instanceof Error ? e.message : "체인 잔액을 불러오지 못했어요."));
    void refreshTransactions().then(async () => {
      const latest = chainSnapshot().history[0];
      if (latest) { setLookup(latest.recordId); await queryWage(latest.recordId); }
    }).catch(e => setError(e instanceof Error ? e.message : "저장된 보관 기록을 확인하지 못했어요."));
  }, []);

  const prepare = () => run("서명할 기록을 준비했어요", async () => {
    const current = chainSnapshot();
    if (!current.agreed) throw new Error("시연 계약과 근무 기록을 먼저 확인해 주세요.");
    const value = await readBalances(sepoliaClient, current.employer as Address, current.employee as Address);
    const payday = new Date(current.payday).toISOString();
    const block = await sepoliaClient.getBlock();
    if (Math.floor(Date.parse(payday) / 1000) < Number(block.timestamp) + 60) throw new Error("두 사람의 서명과 거래 시간을 위해 급여 시각을 체인 시간보다 1분 이상 뒤로 정해 주세요.");
    const prepared = await prepareWork({
      schema: "chemu-work-record-v1", employer: current.employer as Address, employee: current.employee as Address,
      contract: { hourlyWage: DEMO.hourlyWage, weeklyHours: 18, includesWeeklyAllowance: true },
      attendance: { workDate: DEMO.workDate, checkIn: DEMO.checkIn, checkOut: DEMO.checkOut, breakMinutes: 60 },
      grossWage: DEMO.dailyWage, payday,
    }, value.nonce);
    updateChainSession(s => ({ ...s, prepared })); setBalances(value);
  });
  const sign = (role: "employer" | "employee") => run("지갑 서명을 확인했어요", async () => {
    const prepared = chainSnapshot().prepared;
    if (!prepared) throw new Error("근무 기록을 먼저 준비해 주세요.");
    const signature = await (await gateway()).sign(prepared, role);
    updateChainSession(s => {
      if (s.prepared?.recordId !== prepared.recordId) throw new Error("서명 중에 기록이 바뀌었어요. 다시 확인해 주세요.");
      return { ...s, prepared: { ...s.prepared, signatures: { ...s.prepared.signatures, [role]: signature } } };
    });
  });
  const download = (prepared: PreparedWork) => {
    const blob = new Blob([JSON.stringify(exportWorkBundle(prepared), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `chemu-sepolia-${prepared.record.nonce}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="workspace chain-workspace">
    <a href="#chain-main" className="skip-link">본문으로 이동</a>
    <header className="workspace-header"><a className="brand" href="/" aria-label="체무 홈"><span className="brand-symbol"><LockKeyhole size={23} /></span><span>체무<span className="brand-dot">.</span></span></a><span className="header-caption">Sepolia에서 실제로 보관해요</span><div className="header-actions"><a className="wallet-button" href="/">목데이터 모드</a><button type="button" className="wallet-button" disabled={!!pending} onClick={() => {
      if (account.isConnected) disconnect();
      else void run("지갑을 연결했어요", async () => { if (!connectors[0]) throw new Error("브라우저 지갑을 설치해 주세요."); await connectAsync({ connector: connectors[0] }); });
    }}><Wallet size={17} />{account.address ? `${short(account.address)} · 해제` : "지갑 연결"}</button></div></header>

    <main id="chain-main" className="chain-main">
      <div className="page-heading"><div><div className="eyebrow">테스트넷 전용 · 실제 토큰 거래</div><h1>하루 일당을 보관해요</h1></div><span className="badge brand">Sepolia</span></div>
      <div className="callout warning"><Info size={18} /><div>여기서는 지갑 승인을 거쳐 실제 Sepolia 거래를 전송해요. 계약과 출퇴근은 준비된 시연 기록이며, 오늘 일당 92,880 KRWt 한 건을 연결해요.</div></div>
      {!ready ? <p role="status">연동 기록을 불러오고 있어요…</p> : <>
        {chainStorageWarning() && <div className="error-box" role="alert">{chainStorageWarning()}</div>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {notice && <div className="callout" role="status"><Check size={18} />{notice}</div>}
        {pending && <div className="pending-strip" role="status"><span className="spinner" />{pending} · 지갑과 거래 확인을 기다리고 있어요.</div>}
        {account.isConnected && account.chainId !== CHAIN.id && <div className="callout warning"><Info size={18} /><div>연결한 지갑이 Sepolia가 아니에요.<button className="text-button" type="button" disabled={!!pending} onClick={() => void run("Sepolia로 바꿨어요", async () => { await switchChainAsync({ chainId: CHAIN.id }); })}>Sepolia로 바꾸기</button></div></div>}
        {hasUnconfirmed && <div className="callout warning"><Info size={18} /><div>확인 중인 거래가 있어 새 거래를 막아 두었어요. 새로고침 후에도 거래 내역에서 이어서 확인할 수 있어요.</div></div>}

        <div className="chain-columns"><div className="screen-stack">
          <section className="card"><div className="card-topline"><h2>두 사람의 지갑</h2><button type="button" className="text-button" disabled={!!pending} onClick={() => void run("체인 상태를 확인했어요", async () => { await refreshTransactions(); await refreshBalances(); if (lookup) await queryWage(lookup); })}><RefreshCw size={16} />새로 확인</button></div>
            {(["employer", "employee"] as const).map(role => <div className="chain-address-field" key={role}><label className="field-label" htmlFor={`chain-${role}`}>{role === "employer" ? "사장님 지갑" : "알바생 지갑"}</label><input id={`chain-${role}`} value={session[role]} disabled={frozen || !!pending} spellCheck={false} onChange={event => { setBalances(null); updateChainSession(s => ({ ...s, [role]: event.target.value })); }} /><button type="button" className="text-button" disabled={frozen || !!pending || !account.address} onClick={() => { setBalances(null); updateChainSession(s => ({ ...s, [role]: account.address! })); }}>연결한 지갑을 {role === "employer" ? "사장님" : "알바생"}으로 쓰기</button></div>)}
            <div className="chain-balances"><div><span>사장님이 채워 둔 돈</span><strong data-testid="chain-available">{money(balances?.available)}</strong></div><div><span>사장님 지갑의 토큰</span><strong>{money(balances?.employerToken)}</strong></div><div><span>알바생 지갑의 토큰</span><strong>{money(balances?.employeeToken)}</strong></div></div><p className="helper">금액은 체인에서 조회해요. 목데이터의 누계나 연습 서명은 가져오지 않아요.</p>
          </section>
          <section className="card"><h2>보관함 채우기</h2><p>사장님 지갑의 KRWt를 보관함으로 옮겨요.</p><label className="field-label" htmlFor="chain-amount">충전할 KRWt</label><input id="chain-amount" inputMode="numeric" type="number" min="1" max="10000000" step="1" value={amount} onChange={event => setAmount(event.target.value)} /><button type="button" className="button primary" disabled={!!pending || hasUnconfirmed || !account.isConnected} onClick={() => void run("보관함 충전을 확인했어요", async () => { validateParticipants(session.employer, session.employee); if (!/^\d+$/.test(amount)) throw new Error("양의 정수 금액을 입력해 주세요."); await (await gateway()).fund(session.employer as Address, BigInt(amount)); await refreshBalances(); })}>토큰 승인하고 충전하기</button><p className="helper">필요하면 토큰 사용 승인과 충전, 두 번의 지갑 확인이 열려요. KRWt가 없으면 발행 담당자에게 받아 주세요. 이 v0에는 채워 둔 돈을 꺼내는 함수가 없어요.</p></section>
          <section className="card"><div className="card-topline"><h2>근무 기록과 급여 시각</h2><span className="badge brand">일당 92,880 KRWt</span></div><p>11월 29일 오후 10:00 ~ 30일 오전 8:00<br />휴게 1시간 · 시급 10,320원 · 일한 시간 9시간</p><label className="checkbox-row"><input type="checkbox" checked={session.agreed} disabled={frozen || !!pending} onChange={event => updateChainSession(s => ({ ...s, agreed: event.target.checked }))} />주휴수당이 포함된 시연 계약과 위 근무 기록을 확인했어요</label><label className="field-label" htmlFor="chain-payday">급여 시각 · 이 기기의 현지 시간</label><input id="chain-payday" type="datetime-local" value={session.payday} disabled={frozen || !!pending} onChange={event => updateChainSession(s => ({ ...s, payday: event.target.value }))} /><button className="text-button" type="button" disabled={frozen || !!pending} onClick={() => updateChainSession(s => ({ ...s, payday: localTime(new Date(Date.now() + 10 * 60_000)) }))}>지금부터 10분 뒤로 정하기</button><p className="helper">두 사람의 서명 전에 정해요. 보관한 뒤에는 급여 시각을 바꿀 수 없어요.</p>
            {!session.prepared ? <button className="button primary" type="button" disabled={!!pending || !session.agreed} onClick={() => void prepare()}>기록과 급여 시각 확정하기</button> : <><div className="callout"><ShieldCheck size={18} /><div>원본 기록의 지문과 체인 nonce를 담았어요. 두 사람은 아래 같은 기록에 서명해요.</div></div><details className="chain-details"><summary>서명할 기록과 지문 보기</summary><dl><dt>nonce</dt><dd>{session.prepared.record.nonce}</dd><dt>급여 시각</dt><dd>{date(BigInt(session.prepared.record.payday))}</dd><dt>원본 SHA-256</dt><dd><code>{session.prepared.record.workRecordHash}</code></dd><dt>지급에 쓸 기록 ID</dt><dd><code>{session.prepared.recordId}</code></dd></dl></details>
              {(["employee", "employer"] as const).map(role => <div className="chain-signature" key={role}><span>{role === "employee" ? "알바생" : "사장님"}<small>{short(session.prepared!.record[role])}</small></span><button type="button" className="button secondary" disabled={!!pending || hasUnconfirmed || !account.isConnected || !!session.prepared?.signatures[role] || locked} onClick={() => void sign(role)}>{session.prepared?.signatures[role] ? "서명 완료" : `${role === "employee" ? "알바생" : "사장님"} 지갑으로 서명하기`}</button></div>)}
              <button className="button primary" type="button" disabled={!!pending || hasUnconfirmed || !account.isConnected || locked || !session.prepared.signatures.employer || !session.prepared.signatures.employee} onClick={() => void run("일당 보관을 확인했어요", async () => { const prepared = chainSnapshot().prepared!; await (await gateway()).lock(prepared); setLookup(prepared.recordId); await queryWage(prepared.recordId); await refreshBalances(); })}>{locked ? "보관 거래 확인 완료" : "사장님 지갑으로 확정하고 보관하기"}</button>
              <div className="button-pair"><button className="button secondary" type="button" onClick={() => download(session.prepared!)}><Download size={17} />기록 JSON 내보내기</button><button className="button secondary" type="button" disabled={!!pending || hasUnconfirmed} onClick={() => { updateChainSession(s => ({ ...s, prepared: null })); setNotice("새 기록을 준비할 수 있어요. 이전 거래와 보관 기록은 그대로 남아요."); }}>{locked ? "다음 기록 준비하기" : "서명 지우고 다시 준비하기"}</button></div></>}
          </section>
        </div><div className="screen-stack">
          <section className="card"><h2>보관과 지급 확인</h2><p>기록 ID로 체인에 보관된 돈을 확인해요.</p><label className="field-label" htmlFor="chain-record-id">기록 ID</label><input id="chain-record-id" value={lookup} spellCheck={false} onChange={event => { setLookup(event.target.value); setWage(null); setWageId(""); }} /><button className="button secondary" type="button" disabled={!!pending} onClick={() => void run("보관 기록을 확인했어요", () => queryWage(lookup))}>체인 기록 조회하기</button>{wage && <div className="chain-wage-result" role="status"><span className={`badge ${wage.released ? "good" : "brand"}`}>{wage.released ? "지급 완료" : "보관 중"}</span><strong>{money(wage.amount)}</strong><p>받는 지갑 {short(wage.employee)}<br />급여 시각 {date(wage.payday)}</p><button className="button primary" type="button" disabled={!!pending || hasUnconfirmed || !account.isConnected || wage.released || lookup !== wageId} onClick={() => void run("급여 지급을 확인했어요", async () => { await (await gateway()).release(wageId as Hex); await queryWage(wageId); await refreshBalances(); })}>{wage.released ? "이미 지급됐어요" : "급여일 지급하기"}</button></div>}<p className="helper">지급은 누구나 호출할 수 있고 토큰은 기록의 알바생에게만 가요. 자동 지급은 별도 실행기를 켜 두어야 해요. 앱이 열린 것만으로 거래를 보내지는 않아요.</p></section>
          <section className="card"><h2>원본과 체인 지문 대조</h2><p>JSON 원본의 SHA-256, 두 사람 서명, 지급 조건을 보관 이벤트와 함께 확인해요.</p><label className="field-label" htmlFor="chain-proof-file">내보낸 기록 파일</label><input id="chain-proof-file" type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; setProof(null); if (!file) return; if (file.size > 1_000_000) { setError("1MB 이하의 파일을 선택해 주세요."); return; } void file.text().then(setFileText).catch(() => setError("파일을 읽지 못했어요.")); }} /><button className="button secondary" type="button" disabled={!!pending || !fileText} onClick={() => void run("체인 지문과 원본을 대조했어요", async () => { setProof(null); setProof(await verifyAnchoredWork(sepoliaClient, parseWorkBundle(fileText))); })}>파일과 체인 대조하기</button>{proof && <div className="callout" role="status"><ShieldCheck size={20} /><div>체인에 보관한 원본과 일치해요.<br /><a href={`https://sepolia.etherscan.io/tx/${proof.transactionHash}`} target="_blank" rel="noreferrer">보관 거래 확인</a></div></div>}</section>
          <section className="card"><div className="card-topline"><h2>실제 거래 내역</h2><span className="badge">Sepolia</span></div>{session.transactions.length ? session.transactions.map(tx => <div className="chain-tx" key={tx.hash}><div><strong>{kindName[tx.kind]}</strong><span className={`badge ${tx.status === "confirmed" ? "good" : "warning"}`}>{statusName[tx.status]}</span></div><a href={`https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noreferrer"><code>{short(tx.hash)}</code><ExternalLink size={14} /></a></div>) : <p className="empty-text">이 브라우저에서 전송한 거래가 없어요.</p>}<button type="button" className="text-button" disabled={!!pending} onClick={() => void run("거래 결과를 다시 확인했어요", async () => { await refreshTransactions(); await refreshBalances(); })}>미확인 거래 다시 확인하기</button></section>
          {session.history.length > 0 && <section className="card"><h2>보관한 원본 기록</h2>{session.history.map(item => <div className="chain-history" key={item.recordId}><span><FileText size={17} />{short(item.recordId)}</span><button className="text-button" type="button" onClick={() => download(item)}>JSON 저장</button><button className="text-button" type="button" disabled={!!pending} onClick={() => { setLookup(item.recordId); void run("보관 기록을 확인했어요", () => queryWage(item.recordId)); }}>조회</button></div>)}</section>}
          <details className="card chain-details"><summary>연동된 컨트랙트 확인</summary><p>KRWt 소수점은 0이며 금액에 10¹⁸을 곱하지 않아요.</p><dl><dt>KRWt</dt><dd><a href={`https://sepolia.etherscan.io/address/${CHAIN.token}`} target="_blank" rel="noreferrer"><code>{CHAIN.token}</code></a></dd><dt>보관함</dt><dd><a href={`https://sepolia.etherscan.io/address/${CHAIN.escrow}`} target="_blank" rel="noreferrer"><code>{CHAIN.escrow}</code></a></dd></dl></details>
        </div></div>
      </>}
    </main>
  </div>;
}
