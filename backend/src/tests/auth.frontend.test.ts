import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve('../frontend');
const tick = () => new Promise(resolve => setImmediate(resolve));
function load(file: string, dependencies: Record<string, any>, globals: any = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/import\.meta\.env/g, '__env');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(code, {
    module, exports: module.exports, __env: { VITE_API_BASE_URL: '/api/v1' },
    Event, setTimeout, clearTimeout, atob,
    console: { error() {} },
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unmocked browser dependency ${name}`);
      return dependencies[name];
    }, ...globals,
  });
  return module.exports;
}
function browser() {
  const storage = new Map<string, string>();
  const events = new EventTarget();
  const window = {
    location: { pathname: '/', href: '' },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  const globals = { window, localStorage };
  const session = load('src/services/api/session.ts', {}, globals);
  return { storage, window, session, globals };
}
const jsx = { jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }) };

test('browser sessions: same-tab writes notify, cross-tab changes notify, logout isolates other portals', () => {
  const b = browser();
  let updates = 0;
  const unsubscribe = b.session.subscribeSession(() => updates++);
  b.session.setSession('customer-token', { id: 'c', userType: 'Customer' }, 'customer');
  b.session.setSession('seller-token', { id: 's', userType: 'Seller' }, 'seller');
  assert.equal(updates, 2);
  b.window.dispatchEvent(new Event('storage'));
  assert.equal(updates, 3);
  b.session.clearSession('seller');
  assert.equal(b.session.getAuthToken('customer'), 'customer-token');
  assert.equal(b.session.getAuthToken('seller'), null);
  unsubscribe(); b.window.dispatchEvent(new Event('storage'));
  assert.equal(updates, 4);
});

test('auth context: navigation immediately changes identity, and login writes its explicit portal', () => {
  const b = browser();
  b.session.setSession('customer-token', { id: 'c', userType: 'Customer' }, 'customer');
  b.session.setSession('seller-token', { id: 's', userType: 'Seller', status: 'Approved' }, 'seller');
  let ended: string | undefined;
  const context = load('src/context/AuthContext.tsx', {
    react: { createContext: () => ({ Provider: 'Provider' }), useContext() {}, useEffect() {},
      useMemo: (fn: any) => fn(), useSyncExternalStore: (_subscribe: any, snapshot: any) => snapshot() },
    'react/jsx-runtime': jsx, 'react-router-dom': { useLocation() {} },
    '../services/api/config': { __esModule: true, default: { get: async () => ({ data: {} }) } },
    '../services/api/session': b.session,
    '../services/pushNotificationService': { registerFCMToken: async () => null },
    '../services/authSession': { endSession: (portal: string) => { ended = portal; b.session.clearSession(portal); } },
  }, b.globals);
  const render = () => context.AuthProvider({ children: null }).props.value;
  assert.equal(render().user.id, 'c');
  b.window.location.pathname = '/seller';
  assert.equal(render().user.id, 's');
  assert.equal(render().token, 'seller-token');
  render().logout();
  assert.equal(ended, 'seller');
  assert.equal(render().isAuthenticated, false);
  assert.equal(b.session.getAuthToken('customer'), 'customer-token');
  // A delayed seller-login completion while viewing customer pages must not
  // overwrite the customer's session.
  b.window.location.pathname = '/';
  render().login('new-seller-token', { id: 's2', userType: 'Seller' });
  assert.equal(render().user.id, 'c');
  assert.equal(b.session.getAuthToken('seller'), 'new-seller-token');
});

test('public routes: a customer can open seller/delivery signup; matching roles redirect', () => {
  const b = browser();
  let user: any = { userType: 'Customer' };
  const routes = load('src/components/PublicRoute.tsx', {
    'react/jsx-runtime': jsx,
    'react-router-dom': { Navigate: 'Navigate', Outlet: 'Outlet' },
    '../context/AuthContext': { useAuth: () => ({ isAuthenticated: true, user }) },
  }, b.globals);
  for (const route of ['/seller/signup', '/delivery/signup']) {
    b.window.location.pathname = route;
    assert.equal(routes.default({ children: 'signup' }).props.children, 'signup');
  }
  user = { userType: 'Seller' }; b.window.location.pathname = '/seller/login';
  assert.equal(routes.default({ children: 'login' }).props.to, '/seller');
  user = {}; // Legacy/corrupt user metadata must not crash toLowerCase().
  assert.doesNotThrow(() => routes.default({ children: 'login' }));
});

test('API interceptor: protected seller profile 401 clears the correct portal and old 401s preserve a new session', async () => {
  const b = browser();
  let request: any, responseError: any;
  const api = { interceptors: {
    request: { use: (fn: any) => { request = fn; } },
    response: { use: (_ok: any, fail: any) => { responseError = fail; } },
  } };
  load('src/services/api/config.ts', {
    axios: { __esModule: true, default: { create: () => api } },
    './session': b.session, '../authSession': { endSession() {} },
  }, b.globals);
  b.window.location.pathname = '/seller';
  b.session.setSession('old', { id: 's', userType: 'Seller' }, 'seller');
  b.session.setSession('customer', { id: 'c', userType: 'Customer' }, 'customer');
  const config = request({ url: '/auth/seller/profile', headers: {}, method: 'get' });
  assert.equal(config.headers.Authorization, 'Bearer old');
  b.session.setSession('new', { id: 's2', userType: 'Seller' }, 'seller');
  await assert.rejects(responseError({ response: { status: 401 }, config }));
  assert.equal(b.session.getAuthToken('seller'), 'new');
  const current = request({ url: '/auth/seller/profile', headers: {}, method: 'get' });
  await assert.rejects(responseError({ response: { status: 401 }, config: current }));
  assert.equal(b.session.getAuthToken('seller'), null);
  assert.equal(b.session.getAuthToken('customer'), 'customer');
  assert.equal(b.window.location.href, '/seller/login');
});

test('logout: clears locally at once, cleans push first and revokes the captured token after navigation', async () => {
  const b = browser();
  b.window.location.pathname = '/seller';
  b.session.setSession('old-token', { id: 's', userType: 'Seller' }, 'seller');
  let finishCleanup!: () => void;
  const requests: any[] = [];
  const helper = load('src/services/authSession.ts', {
    './api/session': b.session,
    './pushNotificationService': { removeFCMToken: (portal: string) => {
      assert.equal(portal, 'seller'); assert.equal(b.session.getAuthToken('seller'), 'old-token');
      return new Promise<void>(resolve => { finishCleanup = resolve; });
    } },
  }, { ...b.globals, fetch: async (url: string, options: any) => { requests.push({ url, ...options }); return { ok: true }; } });
  helper.endSession();
  assert.equal(b.session.getAuthToken('seller'), null);
  b.window.location.pathname = '/';
  b.session.setSession('new-token', { id: 's2', userType: 'Seller' }, 'seller');
  finishCleanup(); await tick();
  assert.equal(requests[0].url, '/api/v1/auth/logout');
  assert.equal(requests[0].headers.Authorization, 'Bearer old-token');
  assert.equal(b.session.getAuthToken('seller'), 'new-token');
});

test('delivery service preserves 403/429/network errors for the UI', async () => {
  let failure: any;
  const service = load('src/services/api/auth/deliveryAuthService.ts', {
    '../config': { __esModule: true, default: { post: async () => { throw failure; } } },
    '../session': {},
  });
  for (const status of [403, 429, 503]) {
    failure = Object.assign(new Error('Rejected'), { response: { status, data: { message: 'Reason from server' } } });
    await assert.rejects(service.sendOTP('9876543210'), (error: any) => error === failure);
    await assert.rejects(service.verifyOTP('9876543210', '5829', 'session'), (error: any) => error === failure);
  }
});

function renderStateful(file: string, dependencies: Record<string, any>, fixture: any = {}, globals: any = {}) {
  const state: any[] = [], effectDeps: any[] = [];
  let index = 0, effectIndex = 0;
  let pending: Array<() => void> = [];
  const component = load(file, {
    ...dependencies, 'react/jsx-runtime': jsx,
    react: {
      useState(initial: any) {
        const position = index++;
        if (!(position in state)) {
          let value = typeof initial === 'function' ? initial() : initial;
          if (value && typeof value === 'object' && 'mobile' in value) value = { ...value, ...fixture };
          state[position] = value;
        }
        return [state[position], (value: any) => { state[position] = typeof value === 'function' ? value(state[position]) : value; }];
      },
      useRef: (value: any) => ({ current: value }),
      useEffect(effect: any, deps: any[]) {
        const position = effectIndex++;
        if (!effectDeps[position] || deps.some((value, i) => value !== effectDeps[position][i])) pending.push(effect);
        effectDeps[position] = deps;
      },
    },
  }, globals).default;
  return (props: any = {}) => {
    index = 0; effectIndex = 0; pending = [];
    const tree = component(props);
    pending.forEach(effect => effect());
    return tree;
  };
}
function elements(tree: any, type: string): any[] {
  if (Array.isArray(tree)) return tree.flatMap(item => elements(item, type));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props?.children, type)];
}
for (const role of ['Seller', 'Delivery'] as const) {
  test(`${role} signup UI: sends, verifies, registers in order, and retries without consuming a second OTP`, async () => {
    const calls: string[] = [], navigations: string[] = [], toasts: string[] = [];
    let registrations = 0, submitted: any, login: any;
    const service = {
      sendSignupOTP: async () => { calls.push('send'); return { success: true, sessionId: 'challenge' }; },
      verifySignupOTP: async (mobile: string, otp: string, session: string) => {
        calls.push('verify'); assert.equal(mobile, '9876543210'); assert.equal(otp, '5829'); assert.equal(session, 'challenge');
        return { success: true, data: { registrationToken: 'phone-proof' } };
      },
      register: async (body: any) => {
        calls.push('register'); submitted = body;
        if (++registrations === 1) throw new Error('Temporary failure');
        return { success: true, data: { token: role === 'Seller' ? 'seller-token' : undefined,
          user: { id: 'id', sellerName: 'Owner', mobile: body.mobile, email: body.email, storeName: 'Shop', status: 'Pending' } } };
      },
    };
    const dependencies: Record<string, any> = {
      'react-router-dom': { useNavigate: () => (to: string) => navigations.push(to), Link: 'Link' },
      '../../../hooks/useOtpResend': { useOtpResend: () => ({ remaining: 0, start() {} }) },
      '../../../components/OTPInput': { __esModule: true, default: 'OTPInput' },
      '../../../context/AuthContext': { useAuth: () => ({ login: (...args: any[]) => { login = args; } }) },
      '../../../context/ToastContext': { useToast: () => ({ showToast: (message: string) => toasts.push(message) }) },
      '../../../utils/phone': { normalizeMobile: (value: string) => value },
      '../../../services/api/auth/sellerAuthService': service,
      '../../../services/api/auth/deliveryAuthService': service,
      '../../../services/api/config': { __esModule: true, default: { get: async () => ({ data: { exists: false } }) } },
      '../../../services/api/uploadService': { uploadDocument: async () => { throw new Error('No document chosen'); } },
      '../../../components/GoogleMapsAutocomplete': { __esModule: true, default: 'GoogleMaps' },
      '../../../components/LocationPickerMap': { __esModule: true, default: 'LocationMap' },
      '../../../components/LegalPolicyModal': { __esModule: true, default: 'Policy' },
      '../../../services/api/headerCategoryService': { getHeaderCategoriesPublic: async () => [] },
      '../components/common/SellerButton': { SellerButton: 'SellerButton' },
      '../components/common/SellerFormField': { SellerFormField: 'SellerFormField' },
      '../components/common/SellerCard': { SellerCard: 'SellerCard' },
    };
    const fixture = { sellerName: 'Owner', name: 'Courier', mobile: '9876543210', email: 'test@example.test',
      storeName: 'Shop', category: 'Grocery', categories: ['Grocery'], address: 'Street', city: 'Mumbai',
      serviceRadiusKm: '10', dateOfBirth: '1990-01-01' };
    const render = renderStateful(`src/modules/${role.toLowerCase()}/pages/${role}SignUp.tsx`, dependencies, fixture,
      { window: { scrollTo() {} } });
    let tree = render();
    await elements(tree, 'form')[0].props.onSubmit({ preventDefault() {} });
    assert.deepEqual(calls, ['send']);
    tree = render();
    await elements(tree, 'OTPInput')[0].props.onComplete('5829');
    assert.deepEqual(calls, ['send', 'verify', 'register']);
    tree = render();
    const retry = elements(tree, role === 'Seller' ? 'SellerButton' : 'button').find(button => button.props.children === 'Retry Registration');
    assert.ok(retry, 'verified applicants can retry without entering an already-consumed OTP');
    await retry.props.onClick();
    assert.deepEqual(calls, ['send', 'verify', 'register', 'register']);
    assert.equal(submitted.registrationToken, 'phone-proof');
    tree = render();
    if (role === 'Seller') {
      assert.equal(login[0], 'seller-token'); assert.equal(login[1].status, 'Pending');
      assert.equal(navigations[0], '/seller');
    } else {
      assert.equal(login, undefined); assert.equal(navigations.length, 0);
      assert.equal(elements(tree, 'h1')[0].props.children, 'Application submitted');
      assert.ok(toasts.some(message => message.includes('admin approval')));
    }
  });
}

test('OTP input clears old digits after a failed attempt/resend and ignores paste while disabled', () => {
  const completed: string[] = [];
  const render = renderStateful('src/components/OTPInput.tsx', {}, {}, { setTimeout: (fn: any) => { fn(); return 0; }, clearTimeout() {} });
  const props = { onComplete: (code: string) => completed.push(code), disabled: false };
  render(props);
  for (let index = 0; index < 4; index++) {
    elements(render(props), 'input')[index].props.onChange({ target: { value: '5829'[index] } });
  }
  assert.deepEqual(completed, ['5829']);
  const disabled = render({ ...props, disabled: true });
  elements(disabled, 'input')[0].props.onPaste({ preventDefault() {}, clipboardData: { getData: () => '1234' } });
  assert.equal(completed.length, 1);
  render(props);
  assert.ok(elements(render(props), 'input').every(input => input.props.value === ''));
});
