import { spawnSync } from "child_process";
import { Script } from "vm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyntaxValidationResult = {
  valid: boolean;
  error?: string;
  line?: number;
};

export type TestSyntaxStatus = "verified" | "warning" | "unchecked";

export type FullValidationResult = SyntaxValidationResult & {
  status: TestSyntaxStatus;
};

// ─── Python / pytest ─────────────────────────────────────────────────────────
//
// Pipes code through Python's ast.parse() via stdin — no temp file, safe for
// concurrent calls. Requires python3 to be available in PATH.

export function validatePython(code: string): SyntaxValidationResult {
  const result = spawnSync(
    "python3",
    ["-c", 'import ast, sys; ast.parse(sys.stdin.read()); print("ok")'],
    { input: code, encoding: "utf-8", timeout: 5000 }
  );

  if (result.status === 0 && (result.stdout as string).trim() === "ok") {
    return { valid: true };
  }

  const stderr = (result.stderr as string) ?? "";
  const lineMatch = stderr.match(/line (\d+)/);
  const msgMatch = stderr.match(/SyntaxError:\s*(.+)/);

  return {
    valid: false,
    error: (msgMatch?.[1]?.trim() ?? stderr.slice(0, 300).trim()) || "Python syntax error",
    line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
  };
}

// ─── JavaScript / TypeScript (Cypress, Jest, Vitest, Mocha) ──────────────────
//
// Uses Node.js vm.Script for zero-dependency syntax checking.
// TypeScript-specific syntax (type annotations, generics, `as` casts) is
// detected and treated as valid — we cannot check TS without a TS parser, so
// we pass it through rather than false-positive.

export function validateJavaScript(code: string): SyntaxValidationResult {
  try {
    new Script(code);
    return { valid: true };
  } catch (e: unknown) {
    const err = e as Error & { lineNumber?: number };
    const msg = err.message ?? "JavaScript syntax error";

    // These messages typically indicate TypeScript syntax that vm.Script
    // cannot parse. Treat them as valid — not a real JS syntax error.
    const isTypeScriptSyntax =
      /Unexpected token ':'/.test(msg) ||          // type annotations
      /Unexpected token '<'/.test(msg) ||          // generics
      /Unexpected token '?'/.test(msg) ||          // optional chaining edge case
      msg.includes("Unexpected token 'as'") ||     // as casts
      (msg.includes("Unexpected identifier") && /:\s*[A-Z]/.test(code));

    if (isTypeScriptSyntax) return { valid: true };

    return {
      valid: false,
      error: msg,
      line: err.lineNumber,
    };
  }
}

// ─── Postman / REST ───────────────────────────────────────────────────────────
//
// Validates that the output is valid JSON with either:
//   a) A Postman collection structure (info + item[])
//   b) A single request object (method + url)
//   c) A reasonable object with at least one of the expected fields

export function validatePostman(code: string): SyntaxValidationResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(code) as Record<string, unknown>;
  } catch (e: unknown) {
    const err = e as Error;
    return { valid: false, error: `Invalid JSON: ${err.message}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "Expected a JSON object, got array or primitive" };
  }

  const isCollection = typeof parsed.info === "object" && Array.isArray(parsed.item);
  const isSingleRequest =
    typeof parsed.method === "string" && typeof parsed.url !== "undefined";
  const hasAnyExpectedKey = ["method", "url", "headers", "body", "info", "item", "request"].some(
    (k) => k in parsed
  );

  if (!isCollection && !isSingleRequest && !hasAnyExpectedKey) {
    return {
      valid: false,
      error: "Missing required fields: expected method + url for a request, or info + item[] for a collection",
    };
  }

  return { valid: true };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
//
// Routes to the right validator based on framework + language. Returns a status
// field alongside the raw result:
//   "verified"  — validator ran and the code is valid
//   "warning"   — validator ran and found a syntax error
//   "unchecked" — no suitable validator for this framework (treated as valid)

export function validateTestCode(
  code: string,
  framework: string,
  language: string
): FullValidationResult {
  const fw = framework.toLowerCase();
  const lang = language.toLowerCase();

  let result: SyntaxValidationResult;

  if (lang === "python" || fw === "pytest" || fw.startsWith("python")) {
    result = validatePython(code);
  } else if (
    fw.includes("cypress") ||
    fw.includes("jest") ||
    fw.includes("mocha") ||
    fw.includes("vitest") ||
    fw.includes("jasmine") ||
    fw.includes("playwright") ||
    lang === "typescript" ||
    lang === "javascript"
  ) {
    result = validateJavaScript(code);
  } else if (
    fw.includes("postman") ||
    fw.includes("supertest") ||
    (fw.includes("rest") && !fw.includes("request"))
  ) {
    result = validatePostman(code);
  } else {
    // Unknown framework — we can't validate, pass through
    return { valid: true, status: "unchecked" };
  }

  return { ...result, status: result.valid ? "verified" : "warning" };
}
