---
name: Trends endpoint registration order
description: Express route ordering issue with static vs parameterized paths
---

When adding `GET /analyses/trends` to an Express router that also has `GET /analyses/:id`, the trends route **must be registered before** the parameterized route.

```ts
// ✅ CORRECT
router.get("/analyses/trends", ...);   // registered first
router.get("/analyses/:id", ...);      // registered second

// ❌ WRONG — Express matches "trends" as :id = "trends"
router.get("/analyses/:id", ...);
router.get("/analyses/trends", ...);
```

**Why:** Express matches routes in registration order. If `:id` is registered first, the string "trends" is captured as the id parameter and the trends handler is never reached.

**How to apply:** Any literal path segment that could collide with a parameterized segment must be registered first. The comment `// must be before /:id` was added to the code as a reminder.
