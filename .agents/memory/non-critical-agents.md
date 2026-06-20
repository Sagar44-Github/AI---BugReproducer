---
name: Non-critical pipeline agents
description: Pattern for optional pipeline steps that must not block the core result
---

Agents 6+ (Fix Suggester, Auto-Tagger) are non-critical: if they fail, the pipeline result should still be returned with the core 5 agents' output.

Pattern used:

```ts
let fixSuggestionsJson = "[]";
try {
  const fixData = await runValidatedAgent(...);
  fixSuggestionsJson = JSON.stringify(fixData.suggestions);
  auditTrail.push({ ...success entry... });
} catch (err) {
  logger.warn({ err }, "Fix Suggester failed — continuing pipeline");
  auditTrail.push({ ...skipped entry... });
}
```

**Why:** Validation-strict agents (`runValidatedAgent`) can throw `AgentValidationError` or `AgentTimeoutError`. Wrapping in try/catch with a safe default allows the pipeline to always return a complete result.

**How to apply:** Any agent added after the 5 core agents should follow this pattern. Always push an audit entry even on failure/skip so the audit trail is complete.
