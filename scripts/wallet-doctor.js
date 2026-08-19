/* Paste this into the browser console on the Airlock page.
 *
 * It answers one question: which wallets does this page actually see, and for
 * any it sees but will not list, WHY. get-starknet drops a wallet silently when
 * it is missing any required feature, so "my wallet is installed but not in the
 * picker" has no visible cause without something like this.
 */
(() => {
  const REQUIRED = [
    'starknet:walletApi',
    'standard:connect',
    'standard:disconnect',
    'standard:events',
  ];

  console.log('%c— Airlock wallet doctor —', 'font-weight:bold');

  /* 1. Legacy injected wallets: the window.starknet_* objects. */
  const injected = Object.getOwnPropertyNames(window).filter((k) =>
    k.startsWith('starknet'),
  );
  console.log('window.starknet* keys:', injected.length ? injected : '(none)');
  for (const k of injected) {
    const w = window[k];
    console.log(`  ${k}:`, {
      id: w?.id,
      name: w?.name,
      version: w?.version,
      hasRequest: typeof w?.request === 'function',
    });
  }

  /* 2. wallet-standard wallets: ask them to register and see who answers. */
  const seen = [];
  const api = Object.freeze({
    register: (...wallets) => {
      seen.push(...wallets);
      return () => {};
    },
  });
  window.addEventListener('wallet-standard:register-wallet', (e) =>
    e.detail(api),
  );
  window.dispatchEvent(
    new (class extends Event {
      constructor() {
        super('wallet-standard:app-ready', { bubbles: false, cancelable: false });
        this.detail = api;
      }
    })(),
  );

  setTimeout(() => {
    console.log(`wallet-standard wallets: ${seen.length}`);
    for (const w of seen) {
      const features = Object.keys(w.features ?? {});
      const missing = REQUIRED.filter((f) => !features.includes(f));
      console.log(
        `  ${w.name} — ${missing.length === 0 ? 'OK, will be listed' : 'DROPPED, missing: ' + missing.join(', ')}`,
      );
      console.log('     chains:', w.chains, '\n     features:', features);
    }
    if (!seen.length && !injected.length) {
      console.log(
        'Nothing registered at all. The extension may not have injected into this page — check it is enabled for this site, and that the page was loaded after the extension.',
      );
    }
  }, 1200);
})();
