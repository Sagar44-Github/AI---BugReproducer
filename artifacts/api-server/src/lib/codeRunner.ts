import { execFile } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const JEST_SHIM = `
const __results__ = [];
let __currentSuite__ = '';
const __beforeEachStack__ = [[]];

function describe(name, fn) {
  const prev = __currentSuite__;
  __currentSuite__ = name;
  __beforeEachStack__.push([]);
  try { fn(); } finally { __beforeEachStack__.pop(); __currentSuite__ = prev; }
}
function it(name, fn) { _runTest(name, fn); }
function test(name, fn) { _runTest(name, fn); }
function xit() {} function xtest() {} function xdescribe() {}

function _runTest(name, fn) {
  const fullName = __currentSuite__ ? __currentSuite__ + ' > ' + name : name;
  try {
    for (const b of __beforeEachStack__.flat()) b();
    const r = fn();
    if (r && typeof r.then === 'function') {
      __results__.push({ name: fullName, status: 'skip', reason: 'Async test skipped (no runtime in sandbox)' });
    } else {
      __results__.push({ name: fullName, status: 'pass' });
    }
  } catch (e) {
    __results__.push({ name: fullName, status: 'fail', error: e.message });
  }
}

function beforeEach(fn) { __beforeEachStack__[__beforeEachStack__.length - 1].push(fn); }
function afterEach() {} function beforeAll(fn) { try { fn(); } catch {} } function afterAll() {}

function expect(received) {
  const fmt = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
  const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

  const m = {
    toBe: (exp) => ok(Object.is(received, exp), 'Expected ' + fmt(exp) + ', received ' + fmt(received)),
    toEqual: (exp) => ok(JSON.stringify(received) === JSON.stringify(exp), 'Expected ' + fmt(exp) + ', got ' + fmt(received)),
    toBeDefined: () => ok(received !== undefined, 'Expected defined, got undefined'),
    toBeUndefined: () => ok(received === undefined, 'Expected undefined, got ' + fmt(received)),
    toBeNull: () => ok(received === null, 'Expected null, got ' + fmt(received)),
    toBeTruthy: () => ok(Boolean(received), 'Expected truthy, got ' + fmt(received)),
    toBeFalsy: () => ok(!Boolean(received), 'Expected falsy, got ' + fmt(received)),
    toBeNaN: () => ok(Number.isNaN(received), 'Expected NaN, got ' + fmt(received)),
    toContain: (item) => {
      if (Array.isArray(received)) ok(received.includes(item), fmt(received) + ' should contain ' + fmt(item));
      else ok(String(received).includes(String(item)), fmt(received) + ' should contain ' + fmt(item));
    },
    toHaveLength: (len) => ok(received?.length === len, 'Expected length ' + len + ', got ' + received?.length),
    toBeGreaterThan: (n) => ok(received > n, received + ' should be > ' + n),
    toBeGreaterThanOrEqual: (n) => ok(received >= n, received + ' should be >= ' + n),
    toBeLessThan: (n) => ok(received < n, received + ' should be < ' + n),
    toBeLessThanOrEqual: (n) => ok(received <= n, received + ' should be <= ' + n),
    toMatch: (p) => ok(new RegExp(p).test(String(received)), fmt(received) + ' should match ' + p),
    toThrow: (msg) => {
      let threw = false; let thrown = '';
      try { if (typeof received === 'function') received(); } catch(e) { threw = true; thrown = e.message; }
      ok(threw, 'Expected function to throw');
      if (msg) ok(thrown.includes(String(msg)), 'Expected throw "' + msg + '", got "' + thrown + '"');
    },
    toHaveProperty: (prop, val) => {
      ok(prop in Object(received), fmt(received) + ' has no property ' + fmt(prop));
      if (val !== undefined) ok(JSON.stringify(received[prop]) === JSON.stringify(val), 'Property ' + prop + ': expected ' + fmt(val) + ', got ' + fmt(received[prop]));
    },
    toStrictEqual: (exp) => ok(JSON.stringify(received) === JSON.stringify(exp), 'Expected ' + fmt(exp) + ', got ' + fmt(received)),
    toBeInstanceOf: (cls) => ok(received instanceof cls, fmt(received) + ' is not instanceof ' + cls.name),
    toHaveBeenCalled: () => ok(received?.mock?.calls?.length > 0, 'Expected mock to have been called'),
    toHaveBeenCalledTimes: (n) => ok(received?.mock?.calls?.length === n, 'Expected ' + n + ' calls, got ' + received?.mock?.calls?.length),
    toHaveBeenCalledWith: (...args) => ok(received?.mock?.calls?.some(c => JSON.stringify(c) === JSON.stringify(args)), 'Expected call with ' + fmt(args)),
  };

  return {
    ...m,
    not: Object.fromEntries(Object.entries(m).map(([k, fn]) => [k, (...args) => {
      let threw = false; let thrownMsg = '';
      try { (fn)(...args); } catch(e) { threw = true; thrownMsg = e.message; }
      if (!threw) throw new Error('.not.' + k + ' failed — assertion unexpectedly passed');
    }])),
  };
}

const jest = {
  fn: (impl) => {
    let _impl = impl;
    const calls = [];
    const mock = (...args) => { calls.push(args); return _impl ? _impl(...args) : undefined; };
    mock.mock = { calls };
    mock.mockReturnValue = (v) => { _impl = () => v; return mock; };
    mock.mockImplementation = (fn) => { _impl = fn; return mock; };
    mock.mockClear = () => { calls.length = 0; return mock; };
    mock.mockReset = () => { calls.length = 0; _impl = undefined; return mock; };
    return mock;
  },
  spyOn: (obj, method) => { const spy = jest.fn(obj[method]?.bind(obj)); obj[method] = spy; return spy; },
  clearAllMocks: () => {},
  resetAllMocks: () => {},
};

const require = (mod) => {
  const mods = {
    'assert': {
      equal: (a, b) => { if (a != b) throw new Error(a + ' != ' + b); },
      strictEqual: (a, b) => { if (a !== b) throw new Error(a + ' !== ' + b); },
      ok: (v, msg) => { if (!v) throw new Error(msg || 'Assertion failed'); },
      deepEqual: (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('deepEqual failed: ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); },
      throws: (fn, matcher) => {
        let threw = false;
        try { fn(); } catch(e) { threw = true; if (matcher && matcher instanceof RegExp && !matcher.test(e.message)) throw new Error('Wrong error: ' + e.message); }
        if (!threw) throw new Error('Expected function to throw');
      },
      doesNotThrow: (fn) => { try { fn(); } catch(e) { throw new Error('Expected not to throw, got: ' + e.message); } },
      notEqual: (a, b) => { if (a == b) throw new Error(a + ' == ' + b); },
      rejects: async (p) => { try { await p; throw new Error('Expected rejection'); } catch(e) { if (e.message === 'Expected rejection') throw e; } },
    },
    'path': { join: (...p) => p.join('/'), resolve: (...p) => p.join('/'), basename: (p) => p.split('/').pop(), dirname: (p) => p.split('/').slice(0,-1).join('/') || '.' },
  };
  return mods[mod] || new Proxy({}, { get: (_, k) => typeof k === 'string' ? jest.fn() : undefined });
};
`;

function stripTypeScript(code: string): string {
  return code
    .replace(/^import\s+type\s+[^;]+;?\s*$/gm, "")
    .replace(/^import\s+[^;]+from\s+['"][^'"]+['"];?\s*$/gm, "")
    .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, "")
    .replace(/^export\s+(default\s+)?(?=(?:class|function|const|let|var|async)\b)/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*(?:from\s*['"][^'"]*['"])?\s*;?\s*$/gm, "")
    .replace(/^interface\s+\w+[^{]*\{[^}]*\}\s*$/gm, "")
    .replace(/^type\s+\w+\s*(?:<[^>]*>)?\s*=\s*[^;]+;?\s*$/gm, "")
    .replace(/\s+as\s+(?:string|number|boolean|any|unknown|never|void|null|undefined|[A-Z]\w*(?:<[^>]*>)?)(?=\s*[,);}\]\n])/g, "")
    .replace(/:\s*(?:string|number|boolean|any|unknown|never|void|null|undefined|object)(?:\[\])*(?=\s*[,)=;\n{])/g, "")
    .replace(/<[A-Z]\w*(?:,\s*[A-Z]\w*)*>(?=\s*[\[(])/g, "");
}

export type TestResult = {
  name: string;
  status: "pass" | "fail" | "skip";
  error?: string;
  reason?: string;
};

export type RunCodeResult = {
  success: boolean;
  tests: TestResult[];
  error?: string;
  duration: number;
};

export async function runCodeInSandbox(code: string, language: string): Promise<RunCodeResult> {
  const isTs = /typescript/i.test(language);
  const startTime = Date.now();
  const tmpFile = join(tmpdir(), `sandbox_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);

  const processed = isTs ? stripTypeScript(code) : code;
  const fullCode = [
    JEST_SHIM,
    "try {",
    processed,
    "} catch (__e__) {",
    "  __results__.push({ name: 'Script error', status: 'fail', error: __e__.message });",
    "}",
    "process.stdout.write(JSON.stringify(__results__));",
  ].join("\n");

  writeFileSync(tmpFile, fullCode, "utf8");

  return new Promise((resolve) => {
    execFile(
      "node",
      [tmpFile],
      { timeout: 15_000, maxBuffer: 512 * 1024 },
      (err, stdout, stderr) => {
        try { unlinkSync(tmpFile); } catch {}
        const duration = Date.now() - startTime;

        if (!stdout && err) {
          resolve({ success: false, tests: [], error: (stderr || err.message).slice(0, 1000), duration });
          return;
        }
        try {
          const tests: TestResult[] = JSON.parse(stdout);
          resolve({ success: true, tests, duration });
        } catch {
          resolve({ success: false, tests: [], error: (stderr || stdout || "Failed to parse output").slice(0, 1000), duration });
        }
      }
    );
  });
}
