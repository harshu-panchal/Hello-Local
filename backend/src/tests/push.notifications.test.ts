import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const frontend = path.resolve(process.cwd(), '../frontend');
const tick = () => new Promise(resolve => setImmediate(resolve));

// Run the actual browser module with controllable Firebase/browser boundaries.
// No credentials, network requests or live notifications are used.
function loadPush() {
  let auth: string | null = 'account-a';
  let portal = 'customer';
  let permission = 'granted';
  const storage = new Map<string, string>();
  const requests: any[] = [];
  const displays: any[] = [];
  let foreground: any;
  let unsubscribed = false;
  let sdkToken = 'device-token';
  let fetchImpl = async (_url: string, _options: any) => ({ ok: true, status: 200 });
  let getTokenImpl = async () => sdkToken;
  let prompts = 0;
  const registration = {
    active: {},
    showNotification: async (...args: any[]) => { displays.push(args); },
  };
  const notification = {
    get permission() { return permission; },
    requestPermission: async () => { prompts++; return permission; },
  };
  const module = { exports: {} as any };
  const source = fs.readFileSync(path.join(frontend, 'src/services/pushNotificationService.ts'), 'utf8')
    .replace(/import\.meta\.env/g, '__env');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  vm.runInNewContext(compiled, {
    exports: module.exports, module,
    __env: { VITE_API_BASE_URL: '/api/v1', VITE_FIREBASE_VAPID_KEY: 'vapid' },
    require: (name: string) => name === './firebase' ? {
      messaging: {}, getToken: () => getTokenImpl(),
      onMessage: (_messaging: any, handler: any) => {
        foreground = handler;
        return () => { unsubscribed = true; };
      },
    } : { currentPortal: () => portal, getAuthToken: () => auth },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    window: { Notification: notification }, Notification: notification,
    navigator: { serviceWorker: { register: async () => registration } },
    fetch: (url: string, options: any) => { requests.push({ url, ...options }); return fetchImpl(url, options); },
    console: { error() {} },
  });
  return {
    api: module.exports, storage, requests, displays,
    setAuth: (value: string | null) => { auth = value; },
    setPortal: (value: string) => { portal = value; },
    setPermission: (value: string) => { permission = value; },
    setSdkToken: (value: string) => { sdkToken = value; },
    setFetch: (value: typeof fetchImpl) => { fetchImpl = value; },
    setGetToken: (value: typeof getTokenImpl) => { getTokenImpl = value; },
    receive: (payload: any) => foreground(payload),
    get unsubscribed() { return unsubscribed; },
    get prompts() { return prompts; },
  };
}

test('push: logout retains captured authentication and isolates portal tokens', async () => {
  const h = loadPush();
  h.storage.set('fcm_token_web.customer', 'customer-device');
  h.storage.set('fcm_token_web.seller', 'seller-device');
  const removal = h.api.removeFCMToken();
  h.setAuth(null);
  await removal;
  assert.equal(h.requests[0].headers.Authorization, 'Bearer account-a');
  assert.equal(JSON.parse(h.requests[0].body).token, 'customer-device');
  assert.equal(h.storage.has('fcm_token_web.customer'), false);
  assert.equal(h.storage.get('fcm_token_web.seller'), 'seller-device');
});

test('push: logout removes a token whose save was already in flight', async () => {
  const h = loadPush();
  let release!: () => void;
  h.setFetch(async (_url, options) => {
    if (options.method === 'POST') await new Promise<void>(resolve => { release = resolve; });
    return { ok: true, status: 200 };
  });
  const saving = h.api.registerFCMToken(true);
  await tick();
  assert.equal(h.requests.length, 1);
  const removing = h.api.removeFCMToken();
  h.setAuth(null);
  release();
  await Promise.all([saving, removing]);
  assert.deepEqual(h.requests.map(r => r.method), ['POST', 'DELETE']);
  assert.equal(h.storage.size, 0);
});

test('push: logout during Firebase token acquisition prevents a late save', async () => {
  const h = loadPush();
  let release!: (value: string) => void;
  h.setGetToken(() => new Promise<string>(resolve => { release = resolve; }));
  const saving = h.api.registerFCMToken();
  await tick();
  const removing = h.api.removeFCMToken();
  h.setAuth(null);
  release('late-token');
  await Promise.all([saving, removing]);
  assert.equal(h.requests.length, 0);
});

test('push: token refresh updates the backend instead of trusting local cache', async () => {
  const h = loadPush();
  h.storage.set('fcm_token_web.customer', 'old-token');
  h.setSdkToken('refreshed-token');
  assert.equal(await h.api.registerFCMToken(), 'refreshed-token');
  assert.equal(JSON.parse(h.requests[0].body).token, 'refreshed-token');
});

test('push: restored sessions never prompt and failed removals retain cached tokens', async () => {
  const h = loadPush();
  h.setPermission('default');
  await h.api.registerFCMToken(true, { requestPermission: false });
  assert.equal(h.prompts, 0);
  assert.equal(h.requests.length, 0);
  h.storage.set('fcm_token_web.customer', 'device');
  h.setFetch(async () => ({ ok: false, status: 503 }));
  await h.api.removeFCMToken();
  assert.equal(h.storage.get('fcm_token_web.customer'), 'device');
});

test('push: denied permission skips registration and legacy logout tokens still work', async () => {
  const h = loadPush();
  h.setPermission('denied');
  assert.equal(await h.api.registerFCMToken(), null);
  assert.equal(h.requests.length, 0);
  h.storage.set('fcm_token_web', 'legacy-device');
  await h.api.removeFCMToken();
  assert.equal(JSON.parse(h.requests[0].body).token, 'legacy-device');
  assert.equal(h.storage.has('fcm_token_web'), false);
});

test('push: account switch serializes old removal before new registration', async () => {
  const h = loadPush();
  h.storage.set('fcm_token_web.customer', 'device-token');
  const removing = h.api.removeFCMToken();
  h.setAuth('account-b');
  const saving = h.api.registerFCMToken(true);
  await Promise.all([removing, saving]);
  assert.deepEqual(h.requests.map(r => r.method), ['DELETE', 'POST']);
  assert.equal(h.requests[0].headers.Authorization, 'Bearer account-a');
  assert.equal(h.requests[1].headers.Authorization, 'Bearer account-b');
  assert.equal(h.storage.get('fcm_token_web.customer'), 'device-token');
});

test('auth provider: restored sessions refresh silently and logout captures auth before clearing it', () => {
  let auth: string | null = 'existing-session';
  let captured: string | null = null;
  let options: any;
  const effects: Array<() => void> = [];
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(frontend, 'src/context/AuthContext.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name: string) => {
      if (name === 'react') return {
        createContext: () => ({ Provider: 'Provider' }),
        useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}],
        useEffect: (effect: () => void) => effects.push(effect),
      };
      if (name === 'react/jsx-runtime') return { jsx: (_type: any, props: any) => ({ props }) };
      if (name.includes('pushNotificationService')) return {
        registerFCMToken: (_force: boolean, value: any) => { options = value; return Promise.resolve(null); },
        removeFCMToken: () => { captured = auth; return Promise.resolve(); },
      };
      return {
        getAuthToken: () => auth, removeAuthToken: () => { auth = null; },
        setAuthToken: (value: string) => { auth = value; },
        getStoredUser: () => ({ id: 'user-a' }), setStoredUser() {},
      };
    },
  });
  const provider = module.exports.AuthProvider({ children: null });
  effects.forEach(effect => effect());
  assert.equal(options.requestPermission, false);
  provider.props.value.logout();
  assert.equal(captured, 'existing-session');
  assert.equal(auth, null);
  provider.props.value.login('new-session', { id: 'user-b' });
  assert.equal(auth, 'new-session');
});

test('push: foreground uses the worker, preserves links, and unsubscribes', async () => {
  const h = loadPush();
  let handled = 0;
  const unsubscribe = h.api.setupForegroundNotificationHandler(() => { handled++; });
  h.receive({ notification: { title: 'Order', body: 'Ready' }, data: { link: '/orders/123' } });
  await tick();
  assert.equal(h.displays.length, 1);
  assert.equal(h.displays[0][0], 'Order');
  assert.equal(h.displays[0][1].data.link, '/orders/123');
  assert.equal(handled, 1);
  unsubscribe();
  assert.equal(h.unsubscribed, true);
});

function loadWorker() {
  let background: any;
  let click: any;
  const displays: any[] = [];
  const opened: string[] = [];
  let focused = false;
  let windows: any[] = [];
  let imported = false;
  vm.runInNewContext(fs.readFileSync(path.join(frontend, 'public/firebase-messaging-sw.js'), 'utf8'), {
    URL, console: { log() {} },
    importScripts: () => { imported = true; },
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage: (fn: any) => { background = fn; } }) },
    self: {
      location: { origin: 'https://app.example' },
      registration: { showNotification: async (...args: any[]) => { displays.push(args); } },
      addEventListener: (name: string, fn: any) => {
        if (name === 'notificationclick') { assert.equal(imported, false); click = fn; }
      },
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => { opened.push(url); },
    },
  });
  return {
    background: (payload: any) => background(payload), displays, opened,
    existing: (url: string) => { windows = [{ url, focus: async () => { focused = true; } }]; },
    get focused() { return focused; },
    click: async (data: any) => {
      let work: Promise<any> = Promise.resolve();
      click({ notification: { data, close() {} }, stopImmediatePropagation() {}, waitUntil: (p: Promise<any>) => { work = p; } });
      await work;
    },
  };
}

test('push worker: SDK notifications are not displayed twice; data-only messages still display', async () => {
  const h = loadWorker();
  await h.background({ notification: { title: 'SDK displayed' }, data: {} });
  assert.equal(h.displays.length, 0);
  await h.background({ data: { title: 'Data title', body: 'Data body', link: '/orders/1' } });
  assert.equal(h.displays.length, 1);
  assert.equal(h.displays[0][0], 'Data title');
  assert.equal(h.displays[0][1].body, 'Data body');
});

test('push worker: foreground and Firebase-wrapped click data preserve destinations', async () => {
  const h = loadWorker();
  await h.click({ FCM_MSG: { data: { link: '/seller/orders/123' } } });
  assert.equal(h.opened[0], 'https://app.example/seller/orders/123');
  h.existing('https://app.example/orders/1');
  await h.click({ link: '/orders/1' });
  assert.equal(h.focused, true);
  assert.equal(h.opened.length, 1);
});

test('FCM sender: preserves mobile notification/data payloads and configures automatic web display', async () => {
  let sent: any;
  const module = { exports: {} as any };
  const admin = {
    credential: { cert: () => ({}) }, initializeApp() {},
    messaging: () => ({ sendEachForMulticast: async (message: any) => {
      sent = message;
      return { successCount: 1, failureCount: 0, responses: [{ success: true }] };
    } }),
  };
  const compiled = ts.transpileModule(fs.readFileSync(path.resolve('src/services/firebaseAdmin.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name: string) => name === 'firebase-admin' ? admin : path,
    process: { env: { FIREBASE_SERVICE_ACCOUNT: '{}' } },
    console: { log() {}, warn() {}, error() {} },
  });
  const skipped = await module.exports.sendPushNotification(['device'], { title: 'Order', body: 'Ready' });
  assert.equal(skipped.successCount, 0);
  assert.equal(skipped.failureCount, 1);
  module.exports.initializeFirebaseAdmin();
  const result = await module.exports.sendPushNotification(['device'], {
    title: 'Order', body: 'Ready', data: { orderId: '123', link: '/orders/123' }, icon: 'notification_icon',
  });
  assert.equal(result.successCount, 1);
  assert.equal(sent.notification.title, 'Order');
  assert.equal(sent.notification.body, 'Ready');
  assert.equal(sent.data.orderId, '123');
  assert.equal(sent.data.link, '/orders/123');
  assert.equal(sent.data.icon, 'notification_icon');
  assert.equal(sent.webpush.notification.icon, '/logo.png');
  assert.equal(sent.tokens[0], 'device');
});
