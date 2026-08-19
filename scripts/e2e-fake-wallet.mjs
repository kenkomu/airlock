/* Drive the whole app with a wallet that is not real.
 *
 * The one thing this project could not test was the money path: it needs a
 * wallet, and a wallet needs a human. So this supplies one. The fake speaks the
 * STRK20 wallet API over `request` — chain id, accounts, shielded balances,
 * prepare, invoke — which is the only surface the app actually touches, so
 * everything from discovery through to the submitted action array runs for real
 * against the live Sepolia contract.
 *
 * What it proves: the panel picks the token the user holds, reads the split off
 * the deployed contract, and submits one withdraw, one open note per leg, and a
 * single invoke whose placeholders are indexed in creation order.
 *
 * What it cannot prove: that the POOL accepts the array. Nothing here reaches
 * the pool — it stops at the wallet boundary. That still needs a real wallet
 * and a real proof.
 *
 * Needs the dev server up (pnpm --dir app dev) and Playwright available:
 *
 *     node scripts/e2e-fake-wallet.mjs
 *
 * The chromium path below is a local cache; point CHROME at your own if it
 * differs. Kept out of CI deliberately — it wants a browser, a dev server and a
 * public RPC, none of which belong in a pipeline whose job is to say whether
 * the code is correct.
 */

import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage({ viewport: { width: 1000, height: 1200 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });
await p.goto(process.env.URL || 'http://localhost:5183/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(800);

// A wallet that speaks the STRK20 wallet API: Sepolia, one account, and a
// shielded STRK balance. Everything the app asks goes through `request`.
await p.evaluate(() => {
  const ACCOUNT = '0x05c66f610289cb55ec63ac953a3c3cc1f3812438ddef444f73f026c468a15802';
  const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
  const calls = [];
  window.__calls = calls;
  // Ready refuses everything until the dapp is authorized through the
  // wallet-standard connect handshake — the "Not preauthorized" error. The fake
  // enforces the same rule, so an ordering mistake fails here rather than only
  // in front of a human with the extension installed.
  let authorized = false;
  const request = async ({ type, params }) => {
    calls.push(type);
    if (!authorized && type !== 'wallet_supportedSpecs' && type !== 'wallet_supportedWalletApi') {
      throw new Error('Not preauthorized');
    }
    switch (type) {
      case 'wallet_requestChainId': return '0x534e5f5345504f4c4941';
      case 'wallet_requestAccounts': return [ACCOUNT];
      case 'wallet_getPermissions': return ['accounts'];
      case 'wallet_supportedSpecs': return ['0.10.0'];
      case 'wallet_supportedWalletApi': return ['0.10.0'];
      // 250 STRK shielded, in base units.
      case 'wallet_strk20Balances':
        return [{ token: STRK, balance: '0x' + (250n * 10n**18n).toString(16) }];
      case 'wallet_strk20PrepareInvoke': return { call: {}, proof: {} };
      case 'wallet_strk20InvokeTransaction':
        window.__submitted = params?.actions ?? params;
        return { transaction_hash: '0x' + 'ab'.repeat(16) };
      default: throw new Error('Unknown request type: ' + type);
    }
  };
  const fake = {
    version: '1.0.0', name: 'FakeReady', icon: 'data:image/svg+xml;base64,PHN2Zy8+',
    chains: ['starknet:SN_SEPOLIA'],
    accounts: [{ address: ACCOUNT, publicKey: new Uint8Array(), chains: ['starknet:SN_SEPOLIA'], features: [] }],
    features: {
      'starknet:walletApi': { version: '1.0.0', request, walletVersion: '5.33.8', id: 'fakeready' },
      'standard:connect': {
        version: '1.0.0',
        connect: async () => { authorized = true; return { accounts: fake.accounts }; },
      },
      'standard:disconnect': { version: '1.0.0', disconnect: async () => {} },
      'standard:events': { version: '1.0.0', on: () => () => {} },
    },
  };
  window.addEventListener('wallet-standard:app-ready', (e) => e.detail.register(fake));
});

await p.getByRole('button', { name: /connect wallet/i }).first().click();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: /FakeReady/i }).first().click();
await p.waitForTimeout(2500);

console.log('badge:', await p.locator('.badge-net').first().innerText().catch(()=>'?'));
const den = p.locator('.card', { hasText: 'Denominate' }).first();
console.log('--- denominate panel ---');
console.log(await den.innerText().catch(()=>'MISSING'));
// Type an amount and let it fetch the plan from the live contract.
await p.locator('input.input').first().fill('84.7');
await p.waitForTimeout(6000);
console.log('--- after typing 84.7 ---');
console.log(await den.innerText().catch(()=>'MISSING'));

// Now run it.
const btn = p.getByRole('button', { name: /Split into/i }).first();
console.log('button enabled:', await btn.isEnabled());
if (await btn.isEnabled()) {
  await btn.click();
  await p.waitForTimeout(6000);
  console.log('--- after clicking ---');
  console.log(await den.innerText().catch(()=>'MISSING'));
  const submitted = await p.evaluate(() => window.__submitted);
  console.log('--- actions submitted to the wallet ---');
  const a = submitted;
  console.log('count:', a.length,
    '| withdraw:', a.filter(x=>x.type==='withdraw').length,
    '| open notes:', a.filter(x=>x.type==='transfer'&&x.amount==='OPEN').length,
    '| invoke:', a.filter(x=>x.type==='invoke').length);
  console.log('order ok (withdraw first, invoke last):',
    a[0].type==='withdraw' && a[a.length-1].type==='invoke');
  const inv = a[a.length-1];
  console.log('invoke calldata:', JSON.stringify(inv.calldata));
  const amt = BigInt(a[0].amount);
  console.log('withdraw amount == 84.7 STRK:', amt === 847n*10n**17n);
  console.log('invoke amount matches withdraw:', BigInt(inv.calldata[0]) === amt);
  console.log('span len matches note count:', Number(BigInt(inv.calldata[1])) === a.filter(x=>x.type==='transfer').length);
}
console.log('--- wallet calls made:', await p.evaluate(() => window.__calls));
await p.screenshot({ path: 'connected.png', fullPage: false });
console.log('errors:', errs.length ? errs.slice(0,5) : 'none');
await b.close();
