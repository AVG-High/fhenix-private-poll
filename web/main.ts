import './style.css';
import {
  createPublicClient, createWalletClient, custom, getAddress, isAddress,
  formatEther, type Abi, type Address, type Hex, type EIP1193Provider,
} from 'viem';
import { arbitrumSepolia, sepolia, baseSepolia } from 'viem/chains';
import pollArtifact from './generated/PrivatePoll.json';
import verification from './generated/verification.json';

type Provider = EIP1193Provider & { on?: (event: string, listener: (...args: unknown[]) => void) => void };
declare global { interface Window { ethereum?: Provider } }
type Network = typeof arbitrumSepolia | typeof sepolia | typeof baseSepolia;
type PublicEvent = { at: string; action: string; chainId: number; contract?: Address; tx?: Hex; status?: string };
type PollState = { turnout: number; deadline: bigint; quorum: number; voted: boolean; reveal: boolean; finalized: boolean; yes: number; no: number; encrypted: Hex; timestamp: bigint };
const abi = pollArtifact.abi as Abi;
const bytecode = pollArtifact.bytecode as Hex;
const artifact = pollArtifact as unknown as { deployedBytecode?: Hex; immutableReferences?: Record<string, { start: number; length: number }[]> };
const networks: Network[] = [arbitrumSepolia, sepolia, baseSepolia];
const storageKey = 'private-poll-public-evidence-v1';
let account: Address | undefined;
let contract: Address | undefined;
let network: Network = arbitrumSepolia;
let busy = false;
let session = 0;
let state: PollState | undefined;
let events: PublicEvent[] = [];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<div class="shell">
  <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">◈</span>Private Poll <small>FHENIX BUILDER LAB</small></div><span class="pill green">TESTNET ONLY</span></header>
  <section class="hero">
    <div><p class="eyebrow">CONFIDENTIAL COMPUTING / 001</p><h1>의견은 비공개로.<br>기여는 확인 가능하게.</h1><p>CoFHE로 만드는 작은 비공개 투표 실험.<br>직접 배포하고, 선택을 암호화하고, 마감 후 최종 집계만 공개합니다.</p></div>
    <div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit second"></div><div class="cipher-card"><span>ENCRYPTED</span><b>01•</b><i></i></div><div class="lock">◇</div></div>
  </section>
  <section class="status-strip" aria-label="검증 상태">
    <div class="status-cell"><p class="eyebrow">LOCAL VERIFICATION</p><strong id="local-status"><span class="dot"></span>로컬 검증 확인 중</strong></div>
    <div class="status-cell"><p class="eyebrow">PUBLIC TESTNET</p><strong id="chain-status"><span class="dot pending"></span>온체인 배포 미확인</strong></div>
    <div class="status-cell"><p class="eyebrow">AIR DROP</p><strong>에어드롭 · 보상 자격 보장 없음</strong></div>
  </section>
  <div class="layout">
    <main>
      <section class="panel"><div class="panel-heading"><span class="step">01</span><h2>테스트넷 연결</h2></div>
        <p class="sub">이미 보유한 브라우저 지갑을 연결하세요. 각 트랜잭션은 지갑에서 확인합니다.</p>
        <label for="network">사용할 테스트넷</label><select id="network"><option value="421614">Arbitrum Sepolia · 권장</option><option value="11155111">Ethereum Sepolia</option><option value="84532">Base Sepolia</option></select>
        <div class="button-row"><button class="btn" id="connect">브라우저 지갑 연결</button><button class="btn secondary" id="switch">선택한 테스트넷으로 전환</button></div>
        <div id="wallet-status" class="wallet-status">지갑 미연결 · 개인키 또는 시드 문구를 입력할 필요가 없습니다.</div>
        <div id="no-wallet" class="notice hidden">현재 브라우저에서 지갑을 찾지 못했습니다. 기존 지갑 확장 프로그램이 설치된 브라우저로 이 로컬 주소를 여세요.</div>
      </section>
      <section class="panel"><div class="panel-heading"><span class="step">02</span><h2>새 투표 배포</h2></div>
        <p class="sub">실제로 의견을 받을 사람들과 질문을 먼저 공유하세요. 질문은 이 콘솔에 저장되지 않으며, 배포된 주소 하나가 찬반 투표 하나입니다.</p>
        <div class="fields"><div><label for="hours">마감까지 남은 시간</label><select id="hours"><option value="24">24시간</option><option value="72">3일</option><option value="168">7일</option><option value="1">1시간 · 짧은 시연</option></select></div><div><label for="quorum">최소 참여 주소 수</label><input id="quorum" type="number" min="3" max="100000" step="1" value="3" /></div></div>
        <div class="notice">마감과 최소 참여 수는 배포 후 바꿀 수 없습니다. 최소 참여 수를 채우지 못하면 결과를 공개할 수 없습니다.</div>
        <div class="button-row"><button class="btn" id="deploy">투표 컨트랙트 배포</button></div>
        <div class="divider"></div>
        <div class="inline-label"><label for="address">기존 투표 불러오기</label><span class="small">동일 빌드만 허용</span></div><input id="address" class="address-input" placeholder="0x… 컨트랙트 주소" autocomplete="off" spellcheck="false" />
        <div class="button-row"><button class="btn secondary" id="load">주소 검증 후 불러오기</button><button class="btn secondary" id="refresh">상태 새로고침</button></div>
      </section>
      <section class="panel"><div class="panel-heading"><span class="step">03</span><h2>암호화 투표와 집계</h2></div>
        <p class="sub">주소당 한 번 투표할 수 있습니다. 개별 선택은 암호화되며, 주소와 참여 여부는 공개됩니다.</p>
        <div id="contract" class="contract-address mono">투표를 배포하거나 불러오면 주소가 표시됩니다.</div>
        <div class="stats"><div class="stat"><small>참여 주소</small><strong id="turnout">—</strong></div><div class="stat"><small>최소 참여 수</small><strong id="minimum">—</strong></div><div class="stat"><small>내 참여</small><strong id="my-vote" style="font-size:18px;padding-top:6px">—</strong></div></div>
        <p id="deadline" class="status-note">마감 시각 미확인</p><div class="divider"></div>
        <div class="vote-choices"><button class="vote" id="vote-yes">찬성 <span>암호화 투표 ↗</span></button><button class="vote" id="vote-no">반대 <span>암호화 투표 ↗</span></button></div>
        <p class="status-note">첫 암호화에는 공개키와 암호화 모듈 다운로드 시간이 필요합니다.</p>
        <div class="divider"></div><label>마감 후 · 최소 참여 수 충족 시</label>
        <div class="button-row"><button class="btn secondary" id="reveal">1. 최종 집계 공개 허용</button><button class="btn secondary" id="publish">2. 복호화 후 결과 게시</button></div>
        <div id="result" class="result hidden"></div>
        <div class="notice">이 프로토타입은 비밀선거를 완전히 보장하지 않습니다. 여러 주소를 한 사람이 만들 수 있고, 다른 참여자의 선택을 알면 집계로 남은 선택을 추론할 수 있습니다. 만장일치 결과에서는 각 참여자의 선택이 드러납니다. 테스트용 질문에 사용하세요.</div>
        <div class="call-preview"><b>NEXT WALLET REQUEST</b><span id="call-preview">버튼을 누르면 대상 체인·주소·함수가 여기에 표시됩니다. 모든 쓰기는 테스트넷 가스가 필요합니다.</span></div>
      </section>
    </main>
    <aside>
      <section class="panel overview"><p class="eyebrow" style="color:#a8c08d">BUILD SOMETHING REAL</p><h2>한 번의 실제 실험</h2><p class="sub" style="margin:8px 0 23px">활동 수보다 검증할 수 있는 결과물.</p>
        <ol class="journey"><li id="step-build"><span class="node">1</span><div><strong>로컬 동작 검증</strong><p>컨트랙트 테스트와 배포용 빌드</p></div></li><li id="step-deploy"><span class="node">2</span><div><strong>공개 테스트넷 배포</strong><p>내 지갑으로 컨트랙트 생성</p></div></li><li id="step-vote"><span class="node">3</span><div><strong>참여자에게 주소 공유</strong><p>실제 사용자의 암호화된 찬반 의견</p></div></li><li id="step-result"><span class="node">4</span><div><strong>최종 결과와 증빙 기록</strong><p>마감 후 서명된 합계만 공개</p></div></li></ol>
        <div class="overview-footer">지원 네트워크에서의 실제 배포·CoFHE 서비스 응답은 지갑 연결 후 확인됩니다. 로컬 성공은 실제 테스트넷 성공을 뜻하지 않습니다.</div>
      </section>
      <section class="panel"><div class="activity-title"><h2>공개 활동 기록</h2><button class="link-button" id="export">JSON 내보내기 ↓</button></div><p class="sub" style="margin:8px 0 0">체인 · 주소 · 트랜잭션만 저장합니다.</p><ul id="events" class="events"></ul><p id="events-empty" class="empty">아직 확인된 트랜잭션이 없습니다.</p><button id="clear" class="link-button">이 브라우저의 공개 기록 지우기</button></section>
    </aside>
  </div>
  <div id="message" class="live-message" role="status" aria-live="polite">준비되었습니다. 테스트넷 지갑을 연결하면 시작할 수 있습니다.</div>
  <footer class="foot"><span>PRIVATE POLL · CoFHE SDK 0.7.1<br>로컬 개인 개발 콘솔 · Fhenix 공식 서비스가 아닙니다.</span><span>자동 반복 트랜잭션 없음 · 시드 문구 저장 없음<br>메인넷 전송 및 토큰 승인 기능 없음</span></footer>
</div>`;

function el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
function message(value: string, error = false) { el('message').textContent = value; el('message').classList.toggle('error', error); }
function short(value: string) { return `${value.slice(0, 8)}…${value.slice(-6)}`; }
function provider(): Provider { if (!window.ethereum) throw new Error('브라우저 지갑을 찾지 못했습니다. 지갑 확장 프로그램이 있는 브라우저에서 여세요.'); return window.ethereum; }
function clients() {
  const transport = custom(provider());
  return { publicClient: createPublicClient({ chain: network, transport }), walletClient: createWalletClient({ chain: network, transport, account }) };
}
function displayError(error: unknown) {
  const candidate = error as { shortMessage?: string; message?: string };
  return candidate.shortMessage ?? candidate.message ?? String(error);
}
function invalidate() {
  session += 1; account = undefined; state = undefined;
  el('wallet-status').textContent = '지갑 계정 또는 체인이 변경되었습니다. 다시 연결한 뒤 상태를 확인하세요.';
  paint();
}
async function walletGuard(expectedSession = session, expectedAccount = account) {
  if (!expectedAccount || !account) throw new Error('먼저 지갑을 연결하세요.');
  const [ids, chainHex] = await Promise.all([
    provider().request({ method: 'eth_accounts' }), provider().request({ method: 'eth_chainId' }),
  ]);
  if (session !== expectedSession || !ids[0] || ids[0].toLowerCase() !== expectedAccount.toLowerCase() || account.toLowerCase() !== expectedAccount.toLowerCase()) throw new Error('지갑 계정이 변경되어 작업을 중지했습니다. 다시 연결하세요.');
  if (Number(chainHex) !== network.id || ![421614, 11155111, 84532].includes(Number(chainHex))) throw new Error(`지갑 네트워크를 ${network.name} (${network.id})로 전환하세요.`);
  return expectedAccount;
}
function maskImmutables(code: Hex): string {
  const bytes = code.toLowerCase().slice(2).split('');
  for (const refs of Object.values(artifact.immutableReferences ?? {})) for (const { start, length } of refs) bytes.fill('0', start * 2, (start + length) * 2);
  return bytes.join('');
}
async function verifyContract(address: Address) {
  const { publicClient } = clients();
  const code = await publicClient.getBytecode({ address });
  if (!code || code === '0x') throw new Error('선택한 테스트넷에 컨트랙트 코드가 없습니다.');
  if (!artifact.deployedBytecode || artifact.deployedBytecode === '0x') throw new Error('배포 코드 검증 자료가 없습니다. npm run prepare:wallet을 실행하세요.');
  if (maskImmutables(code) !== maskImmutables(artifact.deployedBytecode)) throw new Error('이 프로젝트와 다른 컨트랙트 코드입니다. 동일한 빌드로 배포한 투표 주소만 사용할 수 있습니다.');
}
async function preflightCofhe() {
  const { publicClient } = clients();
  const taskManager = '0xea30c4b8b44078bbf8a6ef5b9f1ec1626c7848d9' as Address;
  const code = await publicClient.getBytecode({ address: taskManager });
  if (!code || code === '0x') throw new Error('선택한 체인에 이 SDK의 CoFHE TaskManager가 없습니다. 배포를 중지했습니다.');
  const signer = await publicClient.readContract({
    address: taskManager,
    abi: [{ type: 'function', name: 'decryptResultSigner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }] as const,
    functionName: 'decryptResultSigner',
  });
  if (signer.toLowerCase() === '0x0000000000000000000000000000000000000000') throw new Error('CoFHE 복호화 서명자가 구성되지 않아 쓰기를 중지했습니다.');
}
async function snapshot(address: Address): Promise<PollState> {
  const { publicClient } = clients();
  const block = await publicClient.getBlock();
  const read = (functionName: string, args?: readonly unknown[]) => publicClient.readContract({ address, abi, functionName, args, blockNumber: block.number });
  const [turnout, deadline, quorum, voted, reveal, finalized, yes, no, encrypted] = await Promise.all([
    read('turnout'), read('closesAt'), read('minimumTurnout'), account ? read('hasVoted', [account]) : false,
    read('revealEnabled'), read('finalized'), read('yesVotes'), read('noVotes'), read('encryptedYesVotes'),
  ]);
  return { turnout: Number(turnout), deadline: BigInt(deadline as bigint), quorum: Number(quorum), voted: Boolean(voted), reveal: Boolean(reveal), finalized: Boolean(finalized), yes: Number(yes), no: Number(no), encrypted: encrypted as Hex, timestamp: block.timestamp };
}
async function refresh() {
  await walletGuard();
  if (!contract) throw new Error('투표 주소를 먼저 배포하거나 불러오세요.');
  const address = contract; const epoch = session;
  await verifyContract(address); const next = await snapshot(address); await walletGuard(epoch);
  state = next; paint();
}
function paint() {
  const connected = Boolean(account); const ready = connected && Boolean(contract && state);
  const closed = state ? state.timestamp >= state.deadline : false;
  for (const control of document.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('button,select,input')) control.disabled = busy;
  for (const id of ['deploy', 'load']) el<HTMLButtonElement>(id).disabled = busy || !connected;
  el<HTMLButtonElement>('refresh').disabled = busy || !connected || !contract;
  for (const id of ['vote-yes', 'vote-no']) el<HTMLButtonElement>(id).disabled = busy || !ready || closed || Boolean(state?.voted);
  el<HTMLButtonElement>('reveal').disabled = busy || !ready || !closed || Boolean(state?.reveal) || (state ? state.turnout < state.quorum : true);
  el<HTMLButtonElement>('publish').disabled = busy || !ready || !state?.reveal || Boolean(state?.finalized);
  el('no-wallet').classList.toggle('hidden', Boolean(window.ethereum));
  el('contract').textContent = contract ? `${network.name}\n${contract}` : '투표를 배포하거나 불러오면 주소가 표시됩니다.';
  el('turnout').textContent = state ? String(state.turnout) : '—';
  el('minimum').textContent = state ? String(state.quorum) : '—';
  el('my-vote').textContent = state ? (state.voted ? '참여 완료' : '미참여') : '—';
  el('deadline').textContent = state ? `${closed ? '마감됨' : '마감'} · ${new Date(Number(state.deadline) * 1000).toLocaleString('ko-KR')} · 읽은 블록 기준` : '마감 시각 미확인';
  el('chain-status').textContent = state ? (state.finalized ? '온체인 결과 게시 확인' : '동일 코드 배포 확인') : '온체인 배포 미확인';
  el('result').classList.toggle('hidden', !state?.finalized);
  el('result').textContent = state?.finalized ? `최종 결과 · 찬성 ${state.yes} / 반대 ${state.no} / 참여 ${state.turnout}` : '';
  el('step-build').classList.toggle('done', verification.localTestsPassed);
  el('step-deploy').classList.toggle('done', Boolean(state));
  el('step-vote').classList.toggle('done', Boolean(state?.turnout));
  el('step-result').classList.toggle('done', Boolean(state?.finalized));
  renderEvents();
}
function renderEvents() {
  el('events').replaceChildren();
  el('events-empty').classList.toggle('hidden', events.length > 0);
  for (const item of [...events].reverse()) {
    const li = document.createElement('li'); const time = document.createElement('time');
    time.textContent = `${new Date(item.at).toLocaleString('ko-KR')} · ${item.chainId}`; li.append(time);
    const label = document.createElement('span'); label.textContent = `${item.action} · ${item.status ?? ''} `; li.append(label);
    const chain = networks.find(n => n.id === item.chainId);
    if (item.tx && /^0x[0-9a-fA-F]{64}$/.test(item.tx) && chain?.blockExplorers) {
      const a = document.createElement('a'); a.href = `${chain.blockExplorers.default.url}/tx/${item.tx}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = short(item.tx); li.append(a);
    }
    el('events').append(li);
  }
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ chainId: network.id, contract, events: events.slice(-100) })); } catch { /* Optional public evidence storage only. */ }
}
function preview(functionName: string, destination?: Address, parameters?: string) {
  el('call-preview').textContent = `체인: ${network.name} (${network.id})\n대상: ${destination ?? '새 PrivatePoll 배포'}\n함수: ${functionName}${parameters ? `\n설정: ${parameters}` : ''}\n전송액: 0 ETH · 테스트넷 가스 별도 · 지갑 확인 필요`;
}
async function recordTx(tx: Hex, action: string, address?: Address) {
  const chainId = network.id;
  const event: PublicEvent = { at: new Date().toISOString(), action, chainId, contract: address, tx, status: '제출됨' };
  events.push(event); persist(); renderEvents();
  message(`트랜잭션 제출됨. 블록 확인을 기다립니다: ${tx}`);
  const receipt = await clients().publicClient.waitForTransactionReceipt({ hash: tx, confirmations: 1, timeout: 180_000 });
  event.status = receipt.status === 'success' ? '성공 확인' : '실패 확인'; persist(); renderEvents();
  if (receipt.status !== 'success') throw new Error('트랜잭션이 되돌려졌습니다. 탐색기에서 원인을 확인하세요.');
  return receipt;
}
async function action(task: () => Promise<void>) {
  if (busy) return;
  busy = true; paint();
  try { await task(); } catch (error) { message(displayError(error), true); }
  finally { busy = false; paint(); }
}
async function connect() {
  const ids = await provider().request({ method: 'eth_requestAccounts' });
  if (!ids[0]) throw new Error('선택한 계정이 없습니다.');
  account = getAddress(ids[0]); session += 1;
  await walletGuard();
  const balance = await clients().publicClient.getBalance({ address: account });
  el('wallet-status').textContent = `${account} · ${Number(formatEther(balance)).toFixed(6)} 테스트 ETH`;
  message('지갑을 연결했습니다. 테스트넷 잔액으로 배포하거나 기존 투표 주소를 불러오세요.');
  if (contract) { await refresh(); message('지갑과 기존 투표의 최신 상태를 확인했습니다.'); }
}
async function switchNetwork() {
  const chainId = `0x${network.id.toString(16)}`;
  try {
    await provider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    const rejected = error as { code?: number; data?: { originalError?: { code?: number } } };
    if ((rejected.code ?? rejected.data?.originalError?.code) !== 4902) throw error;
    // Only bundled, allowlisted testnet metadata is sent to the wallet.
    // The wallet asks the user to approve adding the network.
    await provider().request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId,
        chainName: network.name,
        nativeCurrency: network.nativeCurrency,
        rpcUrls: [...network.rpcUrls.default.http],
        blockExplorerUrls: [network.blockExplorers.default.url],
      }],
    });
    const current = await provider().request({ method: 'eth_chainId' });
    if (Number(current) !== network.id) await provider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
  invalidate(); message(`${network.name} 전환을 요청했습니다. 지갑 연결 버튼으로 계정을 다시 확인하세요.`);
}
async function deploy() {
  const epoch = session; const signer = await walletGuard(epoch); const chain = network;
  const hours = Number(el<HTMLSelectElement>('hours').value); const quorum = Number(el<HTMLInputElement>('quorum').value);
  if (![1, 24, 72, 168].includes(hours) || !Number.isInteger(quorum) || quorum < 3 || quorum > 100000) throw new Error('마감 시간과 최소 참여 수(3–100,000)를 확인하세요.');
  const { publicClient, walletClient } = clients();
  const block = await publicClient.getBlock(); const closesAt = block.timestamp + BigInt(hours * 3600);
  await preflightCofhe();
  preview('constructor(uint64,uint32)', undefined, `${hours}시간 후 마감 / 최소 ${quorum}주소`);
  await walletGuard(epoch, signer);
  const tx = await walletClient.deployContract({ abi, bytecode, args: [closesAt, quorum], account: signer, chain });
  const receipt = await recordTx(tx, 'PrivatePoll 배포');
  if (!receipt.contractAddress) throw new Error('배포 주소를 찾을 수 없습니다. 트랜잭션 탐색기를 확인하세요.');
  await walletGuard(epoch, signer);
  contract = receipt.contractAddress; el<HTMLInputElement>('address').value = contract;
  events[events.length - 1].contract = contract; persist();
  await refresh(); message('배포와 코드 검증을 완료했습니다. 동일한 체인과 투표 주소를 실제 참여자에게 공유하세요.');
}
async function loadContract() {
  const epoch = session; await walletGuard(epoch); const text = el<HTMLInputElement>('address').value.trim();
  if (!isAddress(text)) throw new Error('올바른 EVM 컨트랙트 주소를 입력하세요.');
  const address = getAddress(text); await verifyContract(address); const next = await snapshot(address); await walletGuard(epoch);
  contract = address; state = next; persist(); message('동일한 배포 코드를 확인하고 투표 상태를 불러왔습니다.');
}
async function cofhe() {
  message('CoFHE 암호화 모듈을 준비합니다. 최초 실행에는 시간이 걸릴 수 있습니다.');
  const [{ createCofheClient, createCofheConfig }, supported] = await Promise.all([import('@cofhe/sdk/web'), import('@cofhe/sdk/chains')]);
  const client = createCofheClient(createCofheConfig({ supportedChains: [supported.arbSepolia, supported.sepolia, supported.baseSepolia], useWorkers: false }));
  const { publicClient, walletClient } = clients();
  // SDK 0.7.1 pins its own viem 2.38.x; these clients use the same runtime API.
  // Cast across the duplicate declaration packages, not across an unknown API.
  await client.connect(
    publicClient as unknown as Parameters<typeof client.connect>[0],
    walletClient as unknown as Parameters<typeof client.connect>[1],
  );
  return client;
}
async function write(functionName: string, args: readonly unknown[], address: Address, epoch: number, signer: Address) {
  const { publicClient, walletClient } = clients(); const chain = network;
  await verifyContract(address); await preflightCofhe(); await walletGuard(epoch, signer);
  await publicClient.simulateContract({ address, abi, functionName, args, account: signer });
  await walletGuard(epoch, signer);
  return walletClient.writeContract({ address, abi, functionName, args, account: signer, chain });
}
async function vote(choice: boolean) {
  const epoch = session; const signer = await walletGuard(epoch); await refresh();
  if (!contract || !state) throw new Error('투표를 먼저 불러오세요.');
  if (state.voted || state.timestamp >= state.deadline) throw new Error('이미 참여했거나 마감된 투표입니다.');
  const address = contract; preview('vote(bytes32,bytes)', address, '암호화된 선택 + CoFHE 입력 증명');
  const client = await cofhe();
  try {
    const { Encryptable } = await import('@cofhe/sdk');
    await walletGuard(epoch, signer);
    message('선택을 암호화하고 CoFHE 입력 증명을 생성합니다.');
    const [encrypted, proof] = await client.encryptInputs([Encryptable.bool(choice)]).setConsumingContract(address).execute();
    const tx = await write('vote', [encrypted, proof], address, epoch, signer);
    await recordTx(tx, '암호화 투표', address); await walletGuard(epoch, signer); await refresh();
    message('암호화 투표가 온체인에서 확인되었습니다. 선택 내용은 활동 기록에 저장하지 않습니다.');
  } finally { client.disconnect(); }
}
async function reveal() {
  const epoch = session; const signer = await walletGuard(epoch); await refresh();
  if (!contract || !state || state.timestamp < state.deadline || state.turnout < state.quorum || state.reveal) throw new Error('마감 후 최소 참여 수가 충족되고 공개 허용 전인 투표만 진행할 수 있습니다.');
  const address = contract; preview('enableReveal()', address, '최종 집계에 공개 복호화 권한 부여');
  const tx = await write('enableReveal', [], address, epoch, signer);
  await recordTx(tx, '최종 집계 공개 허용', address); await walletGuard(epoch, signer); await refresh();
  message('최종 집계 공개 권한을 부여했습니다. 다음 버튼으로 복호화 증명을 받아 결과를 게시하세요.');
}
async function publish() {
  const epoch = session; const signer = await walletGuard(epoch); await refresh();
  if (!contract || !state?.reveal || state.finalized) throw new Error('공개 허용된 미게시 투표만 진행할 수 있습니다.');
  const address = contract; const encrypted = state.encrypted; const turnout = state.turnout;
  preview('publishResult(uint32,bytes)', address, 'CoFHE가 서명한 최종 합계');
  const client = await cofhe();
  try {
    await walletGuard(epoch, signer); message('CoFHE에서 최종 집계와 검증 서명을 받는 중입니다.');
    const result = await client.decryptForTx(encrypted).withoutACP().execute();
    if (result.decryptedValue < 0n || result.decryptedValue > BigInt(turnout)) throw new Error('복호화된 값이 유효한 집계 범위를 벗어났습니다.');
    const tx = await write('publishResult', [Number(result.decryptedValue), result.signature], address, epoch, signer);
    await recordTx(tx, '서명된 최종 결과 게시', address); await walletGuard(epoch, signer); await refresh();
    message('최종 결과가 게시되었습니다. 공개 활동 기록을 내보내면 트랜잭션 증빙을 보관할 수 있습니다.');
  } finally { client.disconnect(); }
}
function exportEvidence() {
  const evidence = { schema: 'private-poll-public-evidence-v1', exportedAt: new Date().toISOString(), localVerification: verification, disclaimer: 'Local tests use CoFHE mocks. Browser records are not Fhenix points or an airdrop eligibility claim. Verify transaction hashes independently.', chainId: network.id, contract, observedState: state ? { turnout: state.turnout, deadline: state.deadline.toString(), minimumTurnout: state.quorum, revealEnabled: state.reveal, finalized: state.finalized, yesVotes: state.finalized ? state.yes : null, noVotes: state.finalized ? state.no : null } : null, transactions: events };
  const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `private-poll-evidence-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
}
for (const [id, handler] of Object.entries({ connect, switch: switchNetwork, deploy, load: loadContract, refresh: async () => { await refresh(); message('온체인 상태를 새로 확인했습니다.'); }, 'vote-yes': () => vote(true), 'vote-no': () => vote(false), reveal, publish })) el(id).addEventListener('click', () => void action(handler));
el('export').addEventListener('click', exportEvidence);
el('clear').addEventListener('click', () => { events = []; persist(); renderEvents(); message('이 브라우저의 공개 기록을 지웠습니다. 온체인 기록은 계속 존재합니다.'); });
el('network').addEventListener('change', () => {
  network = networks.find(n => n.id === Number(el<HTMLSelectElement>('network').value)) ?? arbitrumSepolia;
  contract = undefined; state = undefined; el<HTMLInputElement>('address').value = ''; invalidate(); persist();
});
providerEvents();
function providerEvents() {
  window.ethereum?.on?.('accountsChanged', invalidate);
  window.ethereum?.on?.('chainChanged', invalidate);
}
try {
  const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  if (stored && typeof stored === 'object') {
    const data = stored as { chainId?: number; contract?: string; events?: PublicEvent[] };
    network = networks.find(n => n.id === data.chainId) ?? arbitrumSepolia;
    if (data.contract && isAddress(data.contract)) { contract = getAddress(data.contract); el<HTMLInputElement>('address').value = contract; }
    if (Array.isArray(data.events)) events = data.events.filter(e => e && typeof e.at === 'string' && typeof e.action === 'string' && [421614, 11155111, 84532].includes(e.chainId)).slice(-100);
  }
} catch { /* Ignore corrupt or unavailable public local storage. */ }
el<HTMLSelectElement>('network').value = String(network.id);
el('local-status').textContent = verification.localTestsPassed ? `로컬 모의 테스트 ${verification.testCount}개 통과` : '로컬 테스트 통과 미확인';
paint();
