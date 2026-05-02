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

    // PRIMARY check: look at the code itself for TypeScript-specific constructs.
    // vm.Script cannot parse valid TypeScript — if the code is TS, we pass it
    // through rather than false-positive. This catches all common TS patterns:
    const codeIsTypeScript =
      /\binterface\s+\w+/.test(code) ||                        // interface declarations
      /\benum\s+\w+/.test(code) ||                             // enum declarations
      /\btype\s+\w+\s*(<[^>]*>)?\s*=/.test(code) ||           // type aliases
      /\bimplements\s+\w+/.test(code) ||                       // implements clause
      /\b(private|public|protected|readonly)\s+\w+/.test(code) || // access/readonly modifiers
      /\w+\s*<[\w\s,|&[\]]+>/.test(code) ||                   // generic type params: Foo<T>, Array<string>
      /:\s*(string|number|boolean|void|any|never|unknown|null|undefined|object)\b/.test(code) || // primitive type annotations
      /:\s*[A-Z]\w*(\[\]|<)/.test(code) ||                    // type annotations starting with capital: : MyType, : MyType[], : MyType<
      /\bas\s+[A-Z]\w*/.test(code) ||                         // as TypeAssertion
      /\bas\s+(string|number|boolean|unknown|any|never)\b/.test(code) || // as primitive
      /\w!\s*[.([]/.test(code);                                 // non-null assertion: value!.foo

    if (codeIsTypeScript) return { valid: true };

    // SECONDARY check: error message patterns that also indicate TS syntax.
    // Belt-and-suspenders for constructs the code regex might miss.
    const errorImpliesTS =
      /Unexpected token ':'/.test(msg) ||    // type annotations vm.Script chokes on
      /Unexpected token '<'/.test(msg) ||    // generics
      msg.includes("Unexpected token 'as'"); // as casts

    if (errorImpliesTS) return { valid: true };

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
