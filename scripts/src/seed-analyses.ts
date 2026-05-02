/**
 * Seed script — 25 realistic bug analyses for correlation demo.
 *
 * Run: pnpm --filter @workspace/scripts run seed
 * Re-seed (truncate first): pnpm --filter @workspace/scripts run seed -- --force
 */

import { db, analysesTable } from "@workspace/db";

const force = process.argv.includes("--force");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function ent(
  component: string,
  triggerAction: string,
  expectedBehavior: string,
  actualBehavior: string,
  errorMessages: string[],
  frequency: "always" | "intermittent" | "rare" | "unknown",
  env: { os?: string; browser?: string; runtime?: string; version?: string } = {},
  additionalContext?: string
): string {
  return JSON.stringify({
    component,
    triggerAction,
    expectedBehavior,
    actualBehavior,
    environment: env,
    errorMessages,
    frequency,
    additionalContext,
  });
}

function hyps(
  ...items: Array<{
    id: string;
    title: string;
    mechanism: string;
    likelihood: "high" | "medium" | "low";
    confirming: string[];
    refuting: string[];
    status: "retained" | "eliminated";
    reason: string;
  }>
): string {
  return JSON.stringify(
    items.map((h) => ({
      id: h.id,
      title: h.title,
      mechanism: h.mechanism,
      likelihood: h.likelihood,
      confirmingEvidence: h.confirming,
      refutingEvidence: h.refuting,
      status: h.status,
      statusReason: h.reason,
    }))
  );
}

function steps(
  prerequisites: string[],
  stepList: Array<{ action: string; expectedOutcome?: string }>,
  expectedResult: string,
  actualResult: string,
  notes: string[] = [],
  confidence = 8
): string {
  return JSON.stringify({
    prerequisites,
    steps: stepList.map((s, i) => ({
      number: i + 1,
      action: s.action,
      expectedOutcome: s.expectedOutcome,
    })),
    expectedResult,
    actualResult,
    environmentConfig: prerequisites,
    validationNotes: notes,
    confidenceRating: confidence,
  });
}

function breakdown(
  score: number,
  rubric: Record<string, number>,
  missing: string[],
  evidence: string[],
  assumptions: string[]
): string {
  return JSON.stringify({ score, rubric, missing, evidence, assumptions });
}

// ─── 25 seed entries ──────────────────────────────────────────────────────────

const SEEDS = [

  // ── AUTH / SESSION (5) ──────────────────────────────────────────────────────

  {
    title: "JWT refresh token collision on concurrent API requests",
    inputType: "raw_text" as const,
    rawInput: `Authentication service fails intermittently when multiple API calls are made simultaneously. JWT access token expires during a burst of requests, all of which simultaneously attempt to refresh it. Each refresh call generates a new token pair, invalidating the previous one. Client ends up with stale tokens and 401 errors on subsequent calls.`,
    tags: "authentication,jwt,token,refresh,concurrent,session,seed-data",
    status: "completed" as const,
    severity: "critical" as const,
    severityReason: "Silent token invalidation causes cascading 401 errors across all authenticated API calls.",
    confidenceScore: 0.88,
    confidenceBreakdown: breakdown(88, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 8, similar_bug: 10 }, ["stack_trace"], ["JWT refresh race condition documented in auth service logs", "401 errors correlated with concurrent request bursts"], ["Token refresh lock not implemented"]),
    extractedEntities: ent("AuthenticationService", "Concurrent JWT refresh on token expiry", "Single token refresh, all requests succeed with new token", "Multiple refresh calls issued simultaneously, tokens overwrite each other causing 401 on stale tokens", ["401 Unauthorized: token_revoked", "JWT signature verification failed: key rotation conflict"], "intermittent", { runtime: "Node.js 20", version: "auth-service v3.2.1" }, "Observed under load when >5 concurrent requests hit an expired token simultaneously. Implementing a refresh lock (mutex) resolves the issue."),
    hypotheses: hyps({ id: "h1", title: "Missing refresh token mutex", mechanism: "Without a distributed lock, concurrent token refresh requests each spawn independent refresh flows, creating a race condition where the last writer wins and invalidates all prior refresh attempts.", likelihood: "high", confirming: ["Multiple 401s logged within same 50ms window", "Auth service log shows concurrent refresh_token calls"], refuting: [], status: "retained", reason: "Direct match with missing mutex in AuthService.refreshToken()" }),
    reproductionSteps: steps(["Active user session with JWT access token", "Token within 60s of expiry"], [{ action: "Issue 5+ concurrent API requests from same session", expectedOutcome: "All requests trigger simultaneous token refresh" }, { action: "Observe auth service logs for concurrent refresh_token calls" }, { action: "Check responses — later responses return 401 with token_revoked" }], "Single refresh completes, all requests succeed", "Multiple refreshes race; subsequent calls fail with stale tokens", ["Verify with Redis lock implementation as fix"]),
    testCode: `// Bug Reproduction Test — JWT refresh race condition\nimport { createAuthClient } from '../src/auth';\n\ndescribe('JWT refresh concurrency', () => {\n  it('should not issue multiple concurrent refresh calls', async () => {\n    const client = createAuthClient({ tokenTtl: 1 });\n    await client.login('user@example.com', 'password');\n    // Expire the token\n    await new Promise(r => setTimeout(r, 1100));\n    // Fire 5 concurrent requests\n    const results = await Promise.allSettled(\n      Array.from({ length: 5 }, () => client.get('/api/profile'))\n    );\n    const failures = results.filter(r => r.status === 'rejected');\n    expect(failures).toHaveLength(0);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(45),
  },

  {
    title: "Session not invalidated across devices after password change",
    inputType: "raw_text" as const,
    rawInput: `After a user changes their password, existing sessions on other devices remain active indefinitely. The password change endpoint updates the credential hash but does not revoke session tokens or refresh tokens issued before the change. A stolen session remains valid even after the password is rotated.`,
    tags: "authentication,session,password,credential,security,logout,seed-data",
    status: "completed" as const,
    severity: "critical" as const,
    severityReason: "Active sessions persist after credential rotation — compromised accounts cannot be secured by password change alone.",
    confidenceScore: 0.91,
    confidenceBreakdown: breakdown(91, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 20 }, ["stack_trace"], ["Password change endpoint tested, session persists confirmed", "Security audit identified missing session revocation"], []),
    extractedEntities: ent("SessionManagementService", "Password change via account settings", "All existing sessions invalidated after password rotation", "Sessions on other devices remain authenticated with old credential hash", ["Session validation bypass: credential hash mismatch ignored", "Security policy violation: active session post-password-change"], "always", { runtime: "Node.js 18", version: "user-service v2.8.0" }, "Password change should revoke all active refresh tokens and session cookies. Requires iterating session store and invalidating all tokens associated with userId."),
    hypotheses: hyps({ id: "h1", title: "Session store not purged on credential change", mechanism: "The password update flow only writes the new bcrypt hash to the users table. Session tokens are stored separately (Redis) and are never queried or revoked as part of the password change transaction.", likelihood: "high", confirming: ["Redis session store query shows tokens persisting after password change", "password_updated_at field is newer than session.created_at on active sessions"], refuting: [], status: "retained", reason: "Confirmed: session revocation call missing from PasswordChangeService" }),
    reproductionSteps: steps(["User logged in on two devices (Device A and Device B)"], [{ action: "On Device A, navigate to Account > Security > Change Password" }, { action: "Submit new password" }, { action: "On Device B, attempt any authenticated API call" }], "Device B receives 401, user must re-authenticate", "Device B session remains active with no interruption", ["Verify session store has active tokens for userId after password change"]),
    testCode: `// Bug Reproduction Test — session persistence after password change\ndescribe('PasswordChangeService', () => {\n  it('invalidates all sessions after password change', async () => {\n    const userId = await createUser('test@example.com', 'old-password');\n    const session = await issueSession(userId);\n    await changePassword(userId, 'old-password', 'new-password');\n    const result = await validateSession(session.token);\n    expect(result.valid).toBe(false);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(38),
    updatedAt: daysAgo(38),
  },

  {
    title: "OAuth PKCE code verifier mismatch on mobile redirect",
    inputType: "raw_text" as const,
    rawInput: `OAuth 2.0 PKCE flow fails on iOS Safari when the app is backgrounded during the authorization redirect. The code verifier stored in sessionStorage is lost when the app returns to foreground. The token exchange fails with invalid_grant because the verifier no longer matches the code challenge registered with the authorization server.`,
    tags: "oauth,pkce,authentication,session,mobile,redirect,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Login fails completely on iOS for users whose app is backgrounded during OAuth flow — common on mobile.",
    confidenceScore: 0.82,
    confidenceBreakdown: breakdown(82, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, ["stack_trace", "similar_bug"], ["iOS sessionStorage cleared on background confirmed via testing", "OAuth server logs show code_challenge mismatch"], ["Other browsers may behave differently"]),
    extractedEntities: ent("OAuthPKCEHandler", "OAuth authorization redirect on iOS Safari with app backgrounded", "Token exchange succeeds with matching code verifier", "invalid_grant error: code verifier not found in sessionStorage after return from OAuth provider", ["invalid_grant: PKCE code verifier mismatch", "SessionStorage cleared: code_verifier key missing"], "intermittent", { os: "iOS 17", browser: "Safari Mobile 17", version: "oauth-client v1.4.2" }, "PKCE code verifier must survive app backgrounding. Use localStorage with expiry or native secure storage instead of sessionStorage for the verifier."),
    hypotheses: hyps({ id: "h1", title: "sessionStorage cleared on iOS app backgrounding", mechanism: "iOS Safari clears sessionStorage when the browser tab or PWA is backgrounded for more than a few seconds. The PKCE code_verifier is stored in sessionStorage before the redirect, but is gone when the OAuth provider redirects back to the app.", likelihood: "high", confirming: ["Reproducible 100% of time when phone receives notification during OAuth flow", "sessionStorage.getItem('pkce_verifier') returns null after app restore"], refuting: ["Fails only on iOS, not Android Chrome"], status: "retained", reason: "sessionStorage lifecycle on iOS confirmed as root cause" }),
    reproductionSteps: steps(["iOS device with Safari", "App with OAuth login configured"], [{ action: "Tap 'Sign in with Google' to initiate OAuth flow" }, { action: "Immediately background the app after redirect to Google" }, { action: "Receive a notification or wait 5 seconds" }, { action: "Return to app and complete Google sign-in" }], "Successful login, tokens stored", "invalid_grant error, login fails silently", ["Use localStorage with time-bounded expiry as verifier storage"]),
    testCode: `// Bug Reproduction Test — PKCE verifier persistence\ndescribe('OAuthPKCEHandler', () => {\n  it('uses persistent storage for code verifier', () => {\n    const handler = new OAuthPKCEHandler();\n    const { codeChallenge } = handler.generateChallenge();\n    // Simulate sessionStorage wipe (iOS backgrounding)\n    sessionStorage.clear();\n    const verifier = handler.getVerifier();\n    expect(verifier).not.toBeNull();\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(29),
    updatedAt: daysAgo(29),
  },

  {
    title: "Remember-me cookie scoped to subdomain, lost on apex login",
    inputType: "raw_text" as const,
    rawInput: `Users who log in via the marketing site (example.com) and then navigate to the app (app.example.com) are logged out unexpectedly. The remember-me cookie set on app.example.com has domain=app.example.com, so it is not sent when the user visits the root domain. The session cookie is not shared across subdomains.`,
    tags: "authentication,cookie,session,subdomain,login,credential,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Users lose authenticated state when navigating between apex domain and app subdomain — broken UX for cross-domain flows.",
    confidenceScore: 0.79,
    confidenceBreakdown: breakdown(79, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, ["stack_trace", "similar_bug"], ["Cookie scope mismatch confirmed in browser DevTools", "Set-Cookie header shows domain=app.example.com"], ["CDN rewrites may affect cookie headers"]),
    extractedEntities: ent("AuthCookieMiddleware", "Login on apex domain then navigate to app subdomain", "Session persists across apex and subdomain", "Cookie not sent on subdomain request, user forced to re-authenticate", ["Set-Cookie: session=...; Domain=app.example.com (missing apex domain)", "403 Forbidden: missing session cookie on subdomain request"], "always", { browser: "Chrome 120", version: "auth-middleware v1.1.0" }, "Fix by setting cookie domain to .example.com (with leading dot) to share across all subdomains."),
    hypotheses: hyps({ id: "h1", title: "Cookie domain not set to apex domain", mechanism: "The Set-Cookie header sets domain=app.example.com. Browsers only send cookies to the exact domain match, not to the parent domain. Setting domain=.example.com would share the cookie with all subdomains.", likelihood: "high", confirming: ["Browser DevTools shows cookie with domain=app.example.com", "Login on app.example.com works; login on example.com sets separate cookie"], refuting: [], status: "retained", reason: "Confirmed in HTTP response headers" }),
    reproductionSteps: steps(["User account with credentials", "Access to both example.com and app.example.com"], [{ action: "Log in at example.com/login" }, { action: "Navigate to app.example.com/dashboard" }, { action: "Observe authentication state" }], "User is logged in on app.example.com", "User is logged out, redirected to login page"),
    testCode: `// Bug Reproduction Test — cross-subdomain session cookie\ndescribe('AuthCookieMiddleware', () => {\n  it('sets cookie domain to apex domain for subdomain sharing', async () => {\n    const res = await request(app).post('/auth/login').send({ email: 'user@test.com', password: 'pass' });\n    const setCookie = res.headers['set-cookie']?.[0] ?? '';\n    expect(setCookie).toMatch(/Domain=\\.example\\.com/i);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(22),
    updatedAt: daysAgo(22),
  },

  {
    title: "2FA bypass possible via session fixation after account recovery",
    inputType: "raw_text" as const,
    rawInput: `After a user completes account recovery via email link, the session ID from before the recovery is reused. An attacker who observes the pre-recovery session ID can inject it into their browser and bypass 2FA entirely since the recovered session is marked as fully authenticated.`,
    tags: "authentication,2fa,security,session,account-recovery,fixation,seed-data",
    status: "completed" as const,
    severity: "critical" as const,
    severityReason: "Session fixation attack allows 2FA bypass — attacker can hijack recovered sessions.",
    confidenceScore: 0.93,
    confidenceBreakdown: breakdown(93, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 20 }, ["stack_trace"], ["Penetration test confirmed session fixation vector", "Recovery flow does not regenerate session ID"], []),
    extractedEntities: ent("AccountRecoveryService", "Email-based account recovery with 2FA enabled", "New session issued post-recovery, old session invalidated", "Session ID preserved across recovery flow, bypassing 2FA requirement", ["Session fixation: pre-recovery session_id accepted post-authentication", "2FA enforcement skipped: session.mfa_verified=true inherited from recovery"], "rare", { runtime: "Node.js 20", version: "account-service v4.1.0" }, "Must call session.regenerate() after successful recovery to issue a new session ID. All previous session IDs must be invalidated."),
    hypotheses: hyps({ id: "h1", title: "session.regenerate() not called post-recovery", mechanism: "Express session stores the session_id in a cookie. If session.regenerate() is not called after authentication level changes (recovery, 2FA), the same session_id is reused, enabling session fixation.", likelihood: "high", confirming: ["Session ID before and after recovery confirmed identical in test environment", "mfa_verified flag set on session without re-challenge after recovery"], refuting: [], status: "retained", reason: "Security audit finding — missing session.regenerate() call" }),
    reproductionSteps: steps(["Account with 2FA enabled", "Network interception capability (DevTools)"], [{ action: "Start account recovery flow, note session cookie value" }, { action: "Complete recovery via email link" }, { action: "Inject pre-recovery session ID into new browser" }, { action: "Attempt access to 2FA-protected endpoint" }], "2FA challenge presented", "Access granted with pre-recovery session ID"),
    testCode: `// Bug Reproduction Test — session fixation post-recovery\ndescribe('AccountRecoveryService', () => {\n  it('regenerates session ID after account recovery', async () => {\n    const agent = request.agent(app);\n    await agent.post('/auth/recovery/start').send({ email: 'user@test.com' });\n    const before = agent.jar.getCookies('http://localhost')[0]?.value;\n    await agent.post('/auth/recovery/complete').send({ token: 'valid-token' });\n    const after = agent.jar.getCookies('http://localhost')[0]?.value;\n    expect(before).not.toEqual(after);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(15),
    updatedAt: daysAgo(15),
  },

  // ── RACE CONDITIONS (4) ─────────────────────────────────────────────────────

  {
    title: "Cart total incorrect after rapid concurrent item additions",
    inputType: "raw_text" as const,
    rawInput: `Shopping cart shows incorrect total when a user rapidly adds multiple items in quick succession. The cart total update is a read-modify-write operation without any locking. Concurrent requests can read the same stale total, add their item cost, and write back — resulting in lost updates and incorrect totals.`,
    tags: "race-condition,concurrency,cart,atomic,database,lost-update,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Incorrect cart totals lead to pricing errors at checkout — financial impact and loss of customer trust.",
    confidenceScore: 0.85,
    confidenceBreakdown: breakdown(85, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 8, similar_bug: 10 }, ["stack_trace"], ["Race condition reproduced under load test", "Concurrent update logs show stale read before write"], ["Single-threaded environments may not reproduce"]),
    extractedEntities: ent("CartService", "Concurrent item addition to shopping cart", "Cart total reflects all added items accurately", "Cart total loses some item prices when items added simultaneously", ["Stale read detected: cart.total read before concurrent write committed", "Lost update: CartItem.addToTotal() using non-atomic increment"], "intermittent", { runtime: "Node.js 20", version: "cart-service v2.3.0" }, "Use atomic SQL increment (UPDATE carts SET total = total + $1 WHERE id = $2) or pessimistic row lock SELECT FOR UPDATE to prevent concurrent read-modify-write races."),
    hypotheses: hyps({ id: "h1", title: "Non-atomic read-modify-write in CartService", mechanism: "CartService reads current total, adds item price in application code, then writes back. Two concurrent requests reading the same initial total both write back with only their single item added, losing the other item's price.", likelihood: "high", confirming: ["Concurrent test with 10 simultaneous add-item requests shows 30-40% item loss", "Database query log shows overlapping SELECT and UPDATE timestamps"], refuting: [], status: "retained", reason: "Classic lost-update pattern confirmed" }),
    reproductionSteps: steps(["Cart with existing items"], [{ action: "Issue 10 concurrent POST /cart/add requests with different items" }, { action: "Check cart total after all requests complete" }, { action: "Compare total to expected sum of all item prices" }], "Cart total equals sum of all item prices", "Cart total is lower than expected — some updates lost"),
    testCode: `// Bug Reproduction Test — cart concurrent update race condition\ndescribe('CartService', () => {\n  it('maintains correct total under concurrent item additions', async () => {\n    const cartId = await createCart();\n    const items = Array.from({ length: 10 }, (_, i) => ({ itemId: i + 1, price: 10 }));\n    await Promise.all(items.map(item => addItemToCart(cartId, item)));\n    const cart = await getCart(cartId);\n    expect(cart.total).toBe(100);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(52),
    updatedAt: daysAgo(52),
  },

  {
    title: "Deadlock on simultaneous order submission and inventory decrement",
    inputType: "raw_text" as const,
    rawInput: `Database deadlocks observed during peak checkout periods. Two concurrent order submissions each acquire a row lock on their respective inventory items and then attempt to acquire the lock held by the other transaction. PostgreSQL deadlock detector terminates one transaction, which surfaces as a 500 error to the user.`,
    tags: "deadlock,concurrency,database,transaction,inventory,postgresql,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Deadlocks during checkout cause order failures — direct revenue loss and poor user experience.",
    confidenceScore: 0.87,
    confidenceBreakdown: breakdown(87, { stack_trace: 25, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, [], ["Stack trace shows deadlock_detected", "PostgreSQL pg_locks confirms lock ordering conflict"], []),
    extractedEntities: ent("OrderService", "Concurrent order submissions with overlapping inventory items", "Orders complete without deadlock", "PostgreSQL deadlock terminates one order transaction", ["ERROR: deadlock detected DETAIL: Process 1234 waits for ShareLock on transaction 5678", "HINT: See server log for query details", "deadlock_detected: transaction rolled back"], "intermittent", { runtime: "PostgreSQL 15", version: "order-service v5.1.0" }, "Fix by acquiring inventory locks in consistent order (ORDER BY product_id) to prevent circular lock dependency."),
    hypotheses: hyps({ id: "h1", title: "Inconsistent lock acquisition order across transactions", mechanism: "Transaction A locks inventory[product_1] then inventory[product_2]. Simultaneously Transaction B locks inventory[product_2] then inventory[product_1]. Both wait for the other's lock — classic deadlock from inconsistent lock ordering.", likelihood: "high", confirming: ["Deadlock graph in pg_locks confirms circular wait", "Both transactions modify same product inventory rows in different order"], refuting: [], status: "retained", reason: "Deadlock graph confirms lock order inversion" }),
    reproductionSteps: steps(["Products with shared inventory items in cart", "PostgreSQL with row-level locking"], [{ action: "Submit two concurrent orders both containing product_id=1 and product_id=2" }, { action: "Observe PostgreSQL logs for deadlock_detected error" }, { action: "Verify one order returns 500 while the other completes" }], "Both orders complete successfully", "One order returns 500: deadlock detected"),
    testCode: `// Bug Reproduction Test — checkout deadlock\ndescribe('OrderService', () => {\n  it('processes concurrent orders without deadlock', async () => {\n    const [order1, order2] = await Promise.allSettled([\n      submitOrder({ items: [{ productId: 1 }, { productId: 2 }] }),\n      submitOrder({ items: [{ productId: 2 }, { productId: 1 }] }),\n    ]);\n    expect(order1.status).toBe('fulfilled');\n    expect(order2.status).toBe('fulfilled');\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(41),
    updatedAt: daysAgo(41),
  },

  {
    title: "WebSocket message ordering broken under concurrent broadcast",
    inputType: "raw_text" as const,
    rawInput: `Real-time notification feed shows messages out of order when multiple events are broadcast simultaneously. The WebSocket server emits events as they complete async database queries, not in the order they were received. Two notifications fired within the same millisecond can arrive at clients in reversed order.`,
    tags: "websocket,concurrency,async,ordering,broadcast,race-condition,seed-data",
    status: "completed" as const,
    severity: "medium" as const,
    severityReason: "Out-of-order notifications confuse users and can cause incorrect UI state — lower severity but affects perceived reliability.",
    confidenceScore: 0.72,
    confidenceBreakdown: breakdown(72, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 5, frequency: 5, similar_bug: 0 }, ["stack_trace", "environment"], ["Message timestamps confirm out-of-order delivery", "Async DB query completion races observed in logs"], ["Network latency may mask reordering"]),
    extractedEntities: ent("NotificationBroadcastService", "Concurrent notification broadcast via WebSocket", "Messages delivered to clients in order of event creation", "Messages arrive in order of async query completion, not event order", ["Message reordering detected: notification.sequence out of order", "WebSocket broadcast race: event_b delivered before event_a despite later timestamp"], "intermittent", { runtime: "Node.js 20", version: "notification-service v1.6.0" }, "Assign a monotonic sequence number at event creation time and sort client-side, or use a message queue with ordering guarantees (e.g. Redis Streams)."),
    hypotheses: hyps({ id: "h1", title: "Async DB enrichment races before broadcast", mechanism: "Each notification triggers an async DB query to enrich payload. Events fired in rapid succession complete their enrichment queries at different speeds, causing out-of-order emission to the WebSocket clients.", likelihood: "high", confirming: ["Slower DB queries complete after faster ones, reversing order", "Notifications without async enrichment deliver in correct order"], refuting: [], status: "retained", reason: "Async enrichment latency confirmed as reordering cause" }),
    reproductionSteps: steps(["WebSocket client connected", "Two notification triggers 5ms apart"], [{ action: "Trigger notification A with slow DB enrichment (50ms)" }, { action: "Trigger notification B with fast DB enrichment (5ms)" }, { action: "Observe client WebSocket message order" }], "Client receives A then B", "Client receives B then A"),
    testCode: `// Bug Reproduction Test — WebSocket message ordering\ndescribe('NotificationBroadcastService', () => {\n  it('delivers concurrent notifications in creation order', async () => {\n    const received: string[] = [];\n    ws.on('message', (data) => received.push(JSON.parse(data).id));\n    await Promise.all([broadcastNotification('a', 50), broadcastNotification('b', 5)]);\n    await new Promise(r => setTimeout(r, 100));\n    expect(received).toEqual(['a', 'b']);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(33),
    updatedAt: daysAgo(33),
  },

  {
    title: "File upload progress counter goes negative on concurrent retry",
    inputType: "raw_text" as const,
    rawInput: `File upload progress bar shows negative percentages when a chunk upload is retried while another chunk completes. The progress tracker uses a shared counter that is decremented on failure and incremented on success. Concurrent success and retry events can decrement below zero.`,
    tags: "concurrency,upload,async,counter,race-condition,atomic,seed-data",
    status: "completed" as const,
    severity: "low" as const,
    severityReason: "Visual glitch — negative progress is confusing but upload still completes correctly.",
    confidenceScore: 0.68,
    confidenceBreakdown: breakdown(68, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 5, frequency: 5, similar_bug: 0 }, ["stack_trace", "environment", "similar_bug"], ["UI shows -4% progress captured in screenshot", "Race between chunk retry and completion callbacks confirmed"], []),
    extractedEntities: ent("ChunkedUploadService", "Multipart upload with retry on chunk failure", "Progress percentage stays between 0 and 100", "Progress counter goes negative when retry event races with completion callback", ["UploadProgress.update: value -4% below minimum", "Concurrent counter decrement: chunks_in_flight underflow detected"], "intermittent", { browser: "Chrome 120", runtime: "Browser JS" }, "Use Math.max(0, counter) clamp, or switch to atomic counter using a proper state machine."),
    hypotheses: hyps({ id: "h1", title: "Non-atomic progress counter under concurrent callbacks", mechanism: "The retry handler decrements the counter (chunk failed) at the same time a success callback increments it (another chunk completed). Non-atomic read-modify-write allows the counter to dip below zero.", likelihood: "high", confirming: ["Negative progress reproduced reliably with simulated slow chunk", "Counter value logged as -4 in console"], refuting: [], status: "retained", reason: "Race confirmed between retry and complete callbacks" }),
    reproductionSteps: steps(["Large file (>10MB) to trigger chunking", "Slow network (DevTools throttle to 50kbps)"], [{ action: "Upload large file" }, { action: "During upload, simulate chunk failure by dropping first chunk" }, { action: "Observe progress bar value" }], "Progress stays between 0% and 100%", "Progress briefly shows negative percentage"),
    testCode: `// Bug Reproduction Test — upload progress counter underflow\ndescribe('ChunkedUploadService', () => {\n  it('never shows negative progress', async () => {\n    const progress: number[] = [];\n    const uploader = new ChunkedUploadService({ onProgress: (p) => progress.push(p) });\n    await uploader.uploadWithSimulatedFailure(mockFile, { failChunk: 0 });\n    expect(Math.min(...progress)).toBeGreaterThanOrEqual(0);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(18),
    updatedAt: daysAgo(18),
  },

  // ── NULL REFERENCE (4) ──────────────────────────────────────────────────────

  {
    title: "TypeError: Cannot read properties of undefined reading 'email' in user profile",
    inputType: "raw_text" as const,
    rawInput: `Profile page crashes with TypeError when a user logs in via SSO for the first time. The SSO provider does not always return an email address in the identity payload. The profile rendering code accesses user.profile.email directly without null checking the profile object.`,
    tags: "null-reference,typeerror,undefined,profile,sso,nullable,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "White screen crash on first SSO login — new users cannot use the product until profile data is populated.",
    confidenceScore: 0.89,
    confidenceBreakdown: breakdown(89, { stack_trace: 25, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, [], ["Stack trace points to profile rendering line", "SSO payload inspection confirms absent email field"], []),
    extractedEntities: ent("UserProfileRenderer", "Access user.profile.email during SSO first login", "Profile page renders with placeholder for missing email", "TypeError thrown: Cannot read properties of undefined reading 'email'", ["TypeError: Cannot read properties of undefined (reading 'email')", "at UserProfile.render (UserProfile.jsx:47:22)", "Uncaught exception in rendering pipeline"], "intermittent", { browser: "Chrome 120", runtime: "React 18" }, "Add optional chaining: user?.profile?.email ?? 'No email on file'. Also populate profile.email from SSO identity on first login if available."),
    hypotheses: hyps({ id: "h1", title: "Missing null guard on SSO profile payload", mechanism: "SSO providers do not guarantee email in identity claims. profile.email access without optional chaining throws TypeError when profile is null or email is absent.", likelihood: "high", confirming: ["Stack trace points to UserProfile.jsx:47", "SSO test account without email reproduces crash 100%"], refuting: [], status: "retained", reason: "Null dereference confirmed at exact rendering line" }),
    reproductionSteps: steps(["SSO provider configured (Google/GitHub)", "Test account without email in OAuth scope"], [{ action: "Navigate to login page" }, { action: "Click 'Continue with Google' using account with email scope denied" }, { action: "Observe profile page rendering" }], "Profile renders with placeholder text", "White screen: TypeError thrown"),
    testCode: `// Bug Reproduction Test — null profile email access\ndescribe('UserProfileRenderer', () => {\n  it('renders safely when user profile email is undefined', () => {\n    const user = { id: '123', profile: null };\n    const { queryByText } = render(<UserProfile user={user} />);\n    expect(queryByText(/typeerror/i)).toBeNull();\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(60),
  },

  {
    title: "NullPointerException in payment webhook handler on missing order reference",
    inputType: "raw_text" as const,
    rawInput: `Payment webhook processor crashes with NullPointerException when Stripe sends a payment_intent.succeeded event for an intent that has no associated order in our database. This can happen when users abandon checkout mid-flow or when test mode events are forwarded to production. The handler does not check if the retrieved order object is null before accessing its fields.`,
    tags: "null-reference,webhook,payment,exception,nullable,reference,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Webhook handler crashes cause payment events to be missed — unprocessed payments leave orders in limbo.",
    confidenceScore: 0.84,
    confidenceBreakdown: breakdown(84, { stack_trace: 25, code_context: 0, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, ["code_context"], ["Stack trace confirms null order reference", "Stripe webhook log shows successful delivery with 500 response"], ["Test mode events should be filtered"]),
    extractedEntities: ent("PaymentWebhookProcessor", "Stripe payment_intent.succeeded webhook with orphaned payment intent", "Webhook acknowledged 200, order status updated", "NullPointerException: order.updateStatus() called on null order reference", ["NullPointerException at PaymentWebhookProcessor.handle:83", "Stripe-Signature verified but order lookup returned null", "Webhook delivery marked as failed after 500 response"], "rare", { runtime: "Node.js 20", version: "payment-service v3.0.1" }, "Add null check before accessing order object. Return 200 for known orphaned intents to prevent Stripe retry storms."),
    hypotheses: hyps({ id: "h1", title: "Missing null guard after order DB lookup", mechanism: "Handler calls db.findOrderByPaymentIntentId(), which returns null for orphaned intents. Without checking null before accessing order.status, the code throws a NullPointerException.", likelihood: "high", confirming: ["Handler code review confirms no null check at line 83", "Test webhook with unknown payment intent reproduces 500"], refuting: [], status: "retained", reason: "Confirmed missing null check in webhook handler" }),
    reproductionSteps: steps(["Stripe webhook endpoint accessible", "Payment intent not associated with any order"], [{ action: "Send payment_intent.succeeded webhook with payment_intent_id='pi_orphaned'" }, { action: "Observe handler response and server logs" }], "200 OK, order not found handled gracefully", "500 Internal Server Error, NullPointerException logged"),
    testCode: `// Bug Reproduction Test — null order in webhook handler\ndescribe('PaymentWebhookProcessor', () => {\n  it('handles null order reference gracefully', async () => {\n    const event = buildStripeEvent('payment_intent.succeeded', { id: 'pi_orphaned' });\n    const res = await request(app).post('/webhooks/stripe').send(event).set('stripe-signature', sign(event));\n    expect(res.status).toBe(200);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(55),
    updatedAt: daysAgo(55),
  },

  {
    title: "Dashboard renders blank when API returns null user object",
    inputType: "raw_text" as const,
    rawInput: `The dashboard page renders completely blank when the /api/me endpoint returns null instead of a user object. This happens during a brief window when the session is being refreshed. The dashboard component does not handle null user gracefully and attempts to destructure properties from a null object.`,
    tags: "null-reference,rendering,dashboard,nullable,component,destructure,seed-data",
    status: "completed" as const,
    severity: "medium" as const,
    severityReason: "Blank dashboard during session refresh causes transient but jarring loss of UI — users may assume the app is broken.",
    confidenceScore: 0.76,
    confidenceBreakdown: breakdown(76, { stack_trace: 25, code_context: 0, reproduction_steps: 25, error_message: 20, environment: 5, frequency: 5, similar_bug: 0 }, ["code_context", "similar_bug"], ["API returns null during session refresh window confirmed", "Dashboard destructure TypeError reproduced in component test"], []),
    extractedEntities: ent("DashboardComponent", "Render dashboard with null user from API during session refresh", "Loading skeleton shown while session refreshes", "Component crash: destructuring null throws TypeError, renders blank page", ["TypeError: Cannot destructure property 'name' of null", "Component boundary not catching render exception", "API /me returned null during 200ms session refresh window"], "intermittent", { browser: "Chrome 120", runtime: "React 18", version: "dashboard v2.1.0" }, "Add null guard before destructuring: const { name } = user ?? {}. Add ErrorBoundary around dashboard to catch render exceptions."),
    hypotheses: hyps({ id: "h1", title: "Null user destructured without guard", mechanism: "Dashboard does const { name, email } = user at the top of render. When API returns null during session refresh, user is null and destructuring throws TypeError, crashing the entire component tree.", likelihood: "high", confirming: ["Reproduced by returning null from mock /api/me endpoint", "Component has no ErrorBoundary"], refuting: [], status: "retained", reason: "Destructure-null pattern confirmed in Dashboard.tsx" }),
    reproductionSteps: steps(["Active session close to expiry"], [{ action: "Open Dashboard while session is refreshing (within 200ms window)" }, { action: "Observe page content" }], "Loading skeleton shows, then dashboard content renders", "Blank page — no loading state, no error message"),
    testCode: `// Bug Reproduction Test — null user dashboard render\ndescribe('DashboardComponent', () => {\n  it('renders loading state when user is null', () => {\n    const { getByTestId } = render(<Dashboard user={null} loading={true} />);\n    expect(getByTestId('loading-skeleton')).toBeInTheDocument();\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(27),
    updatedAt: daysAgo(27),
  },

  {
    title: "TypeError reading shipping address fields on unverified guest account",
    inputType: "raw_text" as const,
    rawInput: `Checkout summary page throws TypeError when a guest user proceeds to checkout without adding a shipping address. The checkout summary component accesses order.shippingAddress.city directly, but shippingAddress is null for guest users who have not yet provided it. No null check or fallback exists.`,
    tags: "null-reference,typeerror,checkout,nullable,address,optional,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Checkout crash for guest users without a shipping address blocks conversions — direct revenue impact.",
    confidenceScore: 0.81,
    confidenceBreakdown: breakdown(81, { stack_trace: 25, code_context: 0, reproduction_steps: 25, error_message: 20, environment: 5, frequency: 5, similar_bug: 0 }, ["code_context", "similar_bug"], ["Stack trace confirms null address access", "Guest checkout without address reproduces 100%"], []),
    extractedEntities: ent("CheckoutSummaryComponent", "Guest checkout without shipping address entered", "Prompt to add shipping address displayed", "TypeError: Cannot read properties of null reading 'city' at CheckoutSummary.jsx:112", ["TypeError: Cannot read properties of null (reading 'city')", "at CheckoutSummary.render (CheckoutSummary.jsx:112)", "order.shippingAddress is null for guest session"], "always", { browser: "Firefox 121", runtime: "React 18" }, "Use optional chaining: order.shippingAddress?.city ?? 'Not provided'. Add validation gate before allowing checkout with null shipping address."),
    hypotheses: hyps({ id: "h1", title: "Missing optional chain on shippingAddress access", mechanism: "Guest users have shippingAddress=null until they complete the address form. CheckoutSummary accesses order.shippingAddress.city synchronously in JSX without optional chaining.", likelihood: "high", confirming: ["100% reproducible for guest users without address", "Code review confirms no null check at line 112"], refuting: [], status: "retained", reason: "Null access on required field with no fallback" }),
    reproductionSteps: steps(["Guest user session", "Cart with at least one item"], [{ action: "Proceed to checkout as guest" }, { action: "Skip shipping address entry" }, { action: "Navigate to checkout summary page" }], "Prompt to add shipping address shown", "TypeError thrown, page renders blank"),
    testCode: `// Bug Reproduction Test — null shipping address in checkout\ndescribe('CheckoutSummaryComponent', () => {\n  it('renders without crashing when shippingAddress is null', () => {\n    const order = { id: '1', shippingAddress: null, items: [] };\n    const { getByText } = render(<CheckoutSummary order={order} />);\n    expect(getByText(/add shipping address/i)).toBeInTheDocument();\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(14),
  },

  // ── API TIMEOUT (4) ─────────────────────────────────────────────────────────

  {
    title: "Stripe payment intent creation times out under high load",
    inputType: "raw_text" as const,
    rawInput: `Payment processing endpoint times out when Stripe's API takes more than 10 seconds to respond during high-load periods. The HTTP client has a default 10s timeout that is too aggressive for payment operations. Stripe recommends idempotency keys and retry logic for timeout scenarios, neither of which are implemented.`,
    tags: "timeout,api,payment,stripe,network,retry,connection,seed-data",
    status: "completed" as const,
    severity: "critical" as const,
    severityReason: "Payment failures during high load cause direct revenue loss and duplicate charge risk without idempotency.",
    confidenceScore: 0.90,
    confidenceBreakdown: breakdown(90, { stack_trace: 25, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, [], ["Timeout error captured with Stripe request ID", "Load test confirms timeout at >500 rps"], []),
    extractedEntities: ent("PaymentIntentService", "Create payment intent during checkout under load", "Payment intent created, client secret returned within 5s", "ConnectTimeout: Stripe API request exceeded 10s timeout limit", ["ConnectTimeout: request to https://api.stripe.com/v1/payment_intents timed out", "StripeConnectionError: Network communication with Stripe failed", "Request ID: req_missing — timeout before response received"], "intermittent", { runtime: "Node.js 20", version: "payment-service v3.2.0" }, "Increase timeout to 30s for payment operations. Add idempotency key to prevent duplicate charges on retry. Implement circuit breaker to fail fast when Stripe is degraded."),
    hypotheses: hyps({ id: "h1", title: "HTTP client timeout too aggressive for payment API", mechanism: "The default 10s timeout is shorter than Stripe's P99 response time under load. Stripe recommends 30s timeout for payment operations. Without idempotency keys, retries risk duplicate charges.", likelihood: "high", confirming: ["Stripe status page shows elevated P99 during incident", "10s timeout reproducible under load test"], refuting: [], status: "retained", reason: "Timeout threshold too low for payment API SLA" }),
    reproductionSteps: steps(["Load testing tool (k6/Artillery)", "Stripe test mode credentials"], [{ action: "Run load test with 500 concurrent checkout requests" }, { action: "Observe payment intent creation response times" }, { action: "Check for timeout errors in application logs" }], "All payment intents created within 5s", "Timeout errors appear at >100 concurrent requests"),
    testCode: `// Bug Reproduction Test — Stripe timeout handling\ndescribe('PaymentIntentService', () => {\n  it('uses idempotency key on retry after timeout', async () => {\n    const stripeClient = mockStripeWithDelay(12000);\n    const service = new PaymentIntentService({ client: stripeClient, timeout: 30000 });\n    const result = await service.createWithRetry({ amount: 1000, currency: 'usd' });\n    expect(stripeClient.paymentIntents.create).toHaveBeenCalledWith(\n      expect.anything(),\n      expect.objectContaining({ idempotencyKey: expect.any(String) })\n    );\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(50),
    updatedAt: daysAgo(50),
  },

  {
    title: "Elasticsearch aggregation query exceeds 30-second request timeout",
    inputType: "raw_text" as const,
    rawInput: `Analytics dashboard fails to load when Elasticsearch aggregation query over 90-day date range times out. The query performs nested aggregations without using composite pagination or sampling. At scale (>10M documents), the query execution time exceeds the 30s timeout configured on the API gateway.`,
    tags: "timeout,elasticsearch,query,aggregation,slow,network,connection,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Analytics dashboard unusable for customers with large datasets — degraded product value for high-value accounts.",
    confidenceScore: 0.83,
    confidenceBreakdown: breakdown(83, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, ["stack_trace"], ["Query explain shows 45s execution time", "Elasticsearch slow query log confirms aggregation bottleneck"], ["Dataset size affects reproducibility"]),
    extractedEntities: ent("AnalyticsQueryService", "Execute 90-day aggregation over large Elasticsearch index", "Aggregation completes within 5s, dashboard renders", "Request timeout after 30s, dashboard shows error state", ["Gateway Timeout: upstream request to analytics service exceeded 30000ms", "Elasticsearch SearchTimeout: Search cancelled after 30s execution", "agg_query execution_time=34520ms exceeded_limit=30000ms"], "intermittent", { runtime: "Elasticsearch 8.x", version: "analytics-service v2.0.0" }, "Use composite aggregations with pagination, or add query sampling for large datasets. Cache aggregation results with 5-minute TTL."),
    hypotheses: hyps({ id: "h1", title: "Unbounded aggregation over large date range", mechanism: "Nested date_histogram + terms aggregations without cardinality limits scan all matching documents. For 90-day windows on 10M+ document indices, this exceeds API gateway timeout.", likelihood: "high", confirming: ["Elasticsearch profile API shows 34s execution on 90-day range", "Query on 7-day range completes in 2s"], refuting: [], status: "retained", reason: "Query execution time confirmed to exceed gateway timeout" }),
    reproductionSteps: steps(["Elasticsearch index with >10M documents", "Analytics API configured with 30s timeout"], [{ action: "Request 90-day analytics dashboard for high-volume account" }, { action: "Observe API response time" }, { action: "Check Elasticsearch slow query log" }], "Dashboard renders within 5s", "504 Gateway Timeout after 30s"),
    testCode: `// Bug Reproduction Test — analytics aggregation timeout\ndescribe('AnalyticsQueryService', () => {\n  it('completes 90-day aggregation within 10 seconds', async () => {\n    const service = new AnalyticsQueryService({ timeout: 10000 });\n    const start = Date.now();\n    const result = await service.aggregate({ days: 90, indexSize: 'large' });\n    expect(Date.now() - start).toBeLessThan(10000);\n    expect(result.buckets.length).toBeGreaterThan(0);\n  }, 15000);\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(44),
    updatedAt: daysAgo(44),
  },

  {
    title: "S3 presigned URL generation hangs on large file multipart upload initialization",
    inputType: "raw_text" as const,
    rawInput: `File export endpoint hangs indefinitely when generating presigned URLs for large file exports. The AWS SDK call to createMultipartUpload never completes when the S3 bucket is in a different region from the Lambda function. No timeout is set on the AWS SDK client, so the request hangs until the Lambda function hits its 15-minute execution limit.`,
    tags: "timeout,aws,s3,upload,connection,network,request,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Export feature completely broken for cross-region S3 buckets — Lambda timeouts waste compute and block export queue.",
    confidenceScore: 0.78,
    confidenceBreakdown: breakdown(78, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, ["stack_trace", "similar_bug"], ["Lambda timeout logs confirm hanging AWS SDK call", "Cross-region S3 access confirmed via bucket configuration"], []),
    extractedEntities: ent("FileExportService", "Generate presigned multipart upload URL for large export", "Presigned URL returned within 2s", "AWS SDK createMultipartUpload hangs, Lambda times out after 900s", ["Task timed out after 900.00 seconds (Lambda max)", "AWS SDK: no response received for s3.createMultipartUpload request", "RequestTimeout: socket hang up after 600000ms"], "always", { runtime: "AWS Lambda Node.js 20", version: "export-service v1.3.0" }, "Set requestTimeout and connectionTimeout on S3 client. Use same-region S3 bucket or configure VPC endpoint. Add CloudWatch alarm for Lambda timeout metric."),
    hypotheses: hyps({ id: "h1", title: "Missing SDK timeout on cross-region S3 request", mechanism: "The S3 SDK client has no requestTimeout configured. Cross-region requests with VPC routing issues can hang indefinitely, blocking the Lambda until its 15-minute execution limit.", likelihood: "high", confirming: ["Lambda CloudWatch logs show timeout at exactly 900s (configured limit)", "Same call with same-region bucket completes in 200ms"], refuting: [], status: "retained", reason: "Cross-region hang with no timeout confirmed" }),
    reproductionSteps: steps(["Lambda in us-east-1", "S3 bucket in eu-west-1 with no cross-region replication"], [{ action: "Trigger export for file >1GB" }, { action: "Observe Lambda execution logs" }, { action: "Wait for Lambda timeout (15 minutes)" }], "Presigned URL returned within 2s", "Lambda hangs for 900s then times out"),
    testCode: `// Bug Reproduction Test — S3 SDK timeout configuration\ndescribe('FileExportService', () => {\n  it('uses requestTimeout on S3 client', () => {\n    const service = new FileExportService();\n    const s3Config = service.getS3ClientConfig();\n    expect(s3Config.requestHandler.requestTimeout).toBeLessThanOrEqual(30000);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(37),
    updatedAt: daysAgo(37),
  },

  {
    title: "Geocoding API connection refused in EU region causing address validation failure",
    inputType: "raw_text" as const,
    rawInput: `Address validation fails for all European users because the geocoding API endpoint is geo-restricted to US IP addresses. The application uses a hardcoded US API endpoint without region routing. EU Lambda functions receive connection refused when attempting to reach the US-only endpoint. GDPR-compliant EU endpoint exists but is not configured.`,
    tags: "connection,refused,api,network,timeout,geocoding,region,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Address validation completely broken for all EU users — affects GDPR-compliant regions with significant user base.",
    confidenceScore: 0.86,
    confidenceBreakdown: breakdown(86, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 10 }, ["stack_trace"], ["Connection refused confirmed from EU Lambda IP ranges", "US endpoint IP geofencing confirmed by API vendor"], []),
    extractedEntities: ent("AddressValidationService", "Validate shipping address for EU user account", "Address validated and normalized within 500ms", "ECONNREFUSED: connection to geocoding API refused from EU IP range", ["ECONNREFUSED: connect ECONNREFUSED 54.235.10.1:443", "Error: connect ETIMEDOUT: geocoding API unreachable from eu-west-1", "GeocodingClient: endpoint US-only, EU access blocked by geo-restriction"], "always", { runtime: "AWS Lambda Node.js 20 (eu-west-1)", version: "address-service v1.0.4" }, "Configure region-aware endpoint selection. Use GEOCODING_ENDPOINT_EU environment variable for EU deployments. Add health check on startup to validate endpoint reachability."),
    hypotheses: hyps({ id: "h1", title: "Hardcoded US API endpoint not accessible from EU region", mechanism: "GEOCODING_API_URL is hardcoded to the US endpoint. The vendor geo-restricts this endpoint to US IP ranges for data residency compliance. EU Lambda IPs are blocked at the network layer.", likelihood: "high", confirming: ["curl from eu-west-1 confirms ECONNREFUSED", "Vendor documentation shows separate EU endpoint api-eu.geocoding.example.com"], refuting: [], status: "retained", reason: "Geo-restriction confirmed by vendor support" }),
    reproductionSteps: steps(["AWS Lambda function in eu-west-1", "US-only geocoding API endpoint configured"], [{ action: "Submit address validation request from EU Lambda" }, { action: "Observe error response" }], "Address validated within 500ms", "ECONNREFUSED error, address validation fails"),
    testCode: `// Bug Reproduction Test — geocoding region routing\ndescribe('AddressValidationService', () => {\n  it('selects EU endpoint when AWS_REGION is eu-west-1', () => {\n    process.env.AWS_REGION = 'eu-west-1';\n    const service = new AddressValidationService();\n    expect(service.getEndpoint()).toBe('https://api-eu.geocoding.example.com');\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(20),
  },

  // ── FRONTEND RENDERING (4) ──────────────────────────────────────────────────

  {
    title: "Infinite render loop in product filter useEffect with object dependency",
    inputType: "raw_text" as const,
    rawInput: `Product listing page freezes browser tab with 100% CPU usage when the filter panel is opened. A useEffect hook depends on a filterOptions object that is recreated on every render. Since the object reference changes each render cycle, the effect fires again, which updates state, which triggers a re-render, which creates a new object reference — infinite loop.`,
    tags: "react,rendering,useeffect,infinite-loop,state,component,performance,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Browser tab freeze on filter interaction makes the product listing page completely unusable — core e-commerce functionality broken.",
    confidenceScore: 0.91,
    confidenceBreakdown: breakdown(91, { stack_trace: 25, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, [], ["React DevTools confirms infinite render loop", "useEffect dependency array identified as root cause"], []),
    extractedEntities: ent("ProductFilterComponent", "Open filter panel on product listing page", "Filter panel opens, products filtered without performance issues", "Browser tab freezes: infinite render loop caused by useEffect with object reference dependency", ["Warning: Maximum update depth exceeded", "useEffect triggered 10000+ times in 500ms", "React error: too many re-renders, likely caused by infinite update loop"], "always", { browser: "Chrome 120", runtime: "React 18", version: "product-listing v4.2.0" }, "Memoize filterOptions with useMemo or move it outside the component. Use JSON.stringify comparison or deep-equal custom hook for object dependencies."),
    hypotheses: hyps({ id: "h1", title: "Object reference in useEffect dependency causes infinite loop", mechanism: "filterOptions is created inline: const filterOptions = { categories, priceRange }. Each render creates a new object reference. useEffect([filterOptions, fetchProducts]) detects a new reference every render, calls fetchProducts, which updates state, triggering another render.", likelihood: "high", confirming: ["React DevTools shows render count exceeding 10000 within 1 second", "Wrapping filterOptions in useMemo stops the loop"], refuting: [], status: "retained", reason: "Object reference instability in useEffect deps confirmed" }),
    reproductionSteps: steps(["React app with product listing page", "DevTools open to Components tab"], [{ action: "Navigate to product listing page" }, { action: "Click any filter checkbox" }, { action: "Observe browser CPU usage and React render count" }], "Products filter, render count stable", "Browser tab freezes, render count increases indefinitely"),
    testCode: `// Bug Reproduction Test — useEffect infinite loop\nimport { renderHook } from '@testing-library/react';\nimport { act } from 'react';\n\ndescribe('ProductFilterComponent', () => {\n  it('does not cause excessive renders on filter change', () => {\n    let renderCount = 0;\n    const { rerender } = render(<ProductFilter onRender={() => renderCount++} />);\n    act(() => { rerender(<ProductFilter categories={['electronics']} onRender={() => renderCount++} />); });\n    expect(renderCount).toBeLessThan(5);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(48),
    updatedAt: daysAgo(48),
  },

  {
    title: "Stale closure in debounced search captures initial empty query",
    inputType: "raw_text" as const,
    rawInput: `Search functionality returns results for empty query instead of the typed query. The debounced search function closes over the initial empty string value of the query state. Each debounced call fires with query="" because the closure was created before the state update propagated. Users see all results instead of filtered results.`,
    tags: "react,closure,state,hook,debounce,rendering,stale,seed-data",
    status: "completed" as const,
    severity: "medium" as const,
    severityReason: "Search returns wrong results — users cannot find specific products, reducing conversion.",
    confidenceScore: 0.74,
    confidenceBreakdown: breakdown(74, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 5, frequency: 5, similar_bug: 0 }, ["stack_trace", "environment"], ["Stale closure confirmed by logging query inside debounced function", "useRef workaround resolves issue"], []),
    extractedEntities: ent("SearchComponent", "Type query into search input with debounce", "Debounced search fires with current query value", "Debounced function fires with empty string from stale closure", ["Stale closure: search called with query='' instead of current value", "useCallback dependency missing: query not in deps array", "Search results show all items instead of filtered results"], "always", { browser: "Chrome 120", runtime: "React 18" }, "Use useRef to track latest query value, or add query to useCallback deps array. The debounce callback must reference current query, not the closure value."),
    hypotheses: hyps({ id: "h1", title: "Debounced callback closes over initial query value", mechanism: "const debouncedSearch = useCallback(debounce(() => search(query), 300), []) creates the callback once (empty deps). The closure captures query='' from the first render. All subsequent debounced calls use the stale empty string.", likelihood: "high", confirming: ["Adding query to useCallback deps array fixes the behavior", "console.log inside debounce confirms query is always ''"], refuting: [], status: "retained", reason: "Missing query dependency in useCallback confirmed" }),
    reproductionSteps: steps(["Search component with debounce"], [{ action: "Type 'laptop' in the search input" }, { action: "Wait for debounce to fire (300ms)" }, { action: "Observe search results and network request payload" }], "Network request sends query='laptop', filtered results shown", "Network request sends query='', all results returned"),
    testCode: `// Bug Reproduction Test — stale closure in debounced search\ndescribe('SearchComponent', () => {\n  it('searches with current query value after debounce', async () => {\n    const mockSearch = jest.fn();\n    const { getByRole } = render(<SearchComponent onSearch={mockSearch} />);\n    fireEvent.change(getByRole('searchbox'), { target: { value: 'laptop' } });\n    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('laptop'), { timeout: 500 });\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(35),
    updatedAt: daysAgo(35),
  },

  {
    title: "Virtualized list scroll position resets to top on data refresh",
    inputType: "raw_text" as const,
    rawInput: `The transaction history list jumps to the top when background data polling refreshes the list. The virtualized list component receives a new array reference on every poll response (even when data is identical), which triggers a full re-render and resets the scroll position. Users lose their place in long transaction histories.`,
    tags: "react,rendering,virtualized,scroll,state,component,list,seed-data",
    status: "completed" as const,
    severity: "medium" as const,
    severityReason: "Users lose reading position on data refresh — frustrating UX for customers reviewing transaction histories.",
    confidenceScore: 0.71,
    confidenceBreakdown: breakdown(71, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 5, frequency: 5, similar_bug: 0 }, ["stack_trace", "environment", "similar_bug"], ["New array reference on identical data confirmed", "Scroll reset triggered by prop change in virtualized component"], []),
    extractedEntities: ent("TransactionListComponent", "Background polling refreshes transaction list data", "Scroll position preserved during background refresh with identical data", "Virtualized list remounts and scroll resets to position 0 on every poll", ["VirtualizedList: key prop change detected, remounting list", "scroll_position_reset: new items prop reference causes scroll to 0", "Polling creates new array: items !== prevItems despite identical content"], "always", { browser: "Chrome 120", runtime: "React 18", version: "transaction-history v3.0.0" }, "Memoize the items array to preserve reference stability when data is unchanged. Use deep comparison in useMemo or normalize API responses before passing to list component."),
    hypotheses: hyps({ id: "h1", title: "New array reference on every poll response", mechanism: "Each successful poll creates a new array: setItems(response.data). Even if response.data has identical content, it is a new reference. The virtualized list component uses referential equality for change detection, remounting when items prop reference changes.", likelihood: "high", confirming: ["Replacing setItems(response.data) with setItems(prev => isEqual(prev, response.data) ? prev : response.data) prevents reset", "React DevTools confirms VirtualizedList remounts on every poll"], refuting: [], status: "retained", reason: "Reference instability on poll response confirmed as root cause" }),
    reproductionSteps: steps(["Transaction list with >50 items", "Background polling enabled (30s interval)"], [{ action: "Scroll to item #40 in the transaction list" }, { action: "Wait 30 seconds for background poll to complete" }, { action: "Observe scroll position" }], "Scroll position maintained at item #40", "List jumps to top (item #1)"),
    testCode: `// Bug Reproduction Test — scroll position on data refresh\ndescribe('TransactionListComponent', () => {\n  it('preserves scroll position on background refresh with identical data', async () => {\n    const { getScrollTop, triggerRefresh } = renderTransactionList(mockTransactions);\n    simulateScroll(500);\n    await triggerRefresh(mockTransactions);\n    expect(getScrollTop()).toBe(500);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(25),
    updatedAt: daysAgo(25),
  },

  {
    title: "Modal overlay persists and blocks interaction after close animation",
    inputType: "raw_text" as const,
    rawInput: `After closing a modal dialog, the backdrop overlay remains visible and blocks all click interactions with the page. The close animation (300ms fade-out) completes visually, but the DOM element is not removed because the animation end event never fires in Safari. The invisible overlay captures all click events, making the entire page unresponsive.`,
    tags: "react,rendering,animation,modal,state,component,safari,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "Page becomes completely unresponsive after modal use in Safari — critical for Mac users.",
    confidenceScore: 0.80,
    confidenceBreakdown: breakdown(80, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, ["stack_trace"], ["animationend event not firing in Safari confirmed", "DOM overlay persists confirmed in DevTools inspector"], ["Chrome not affected"]),
    extractedEntities: ent("ModalComponent", "Close modal dialog in Safari browser", "Modal closes, overlay removed, page interactive", "Overlay DOM element persists, pointer events blocked on entire page", ["animationend event not dispatched in Safari 17 with CSS animation", "Modal.onExited callback never called: animation lifecycle incomplete", "pointer-events blocked: overlay z-index covers page content"], "always", { os: "macOS 14", browser: "Safari 17", runtime: "React 18" }, "Add setTimeout fallback for animationend in Safari: if (!onExited called within 400ms, force-remove overlay). Or replace CSS animation with JS animation via requestAnimationFrame."),
    hypotheses: hyps({ id: "h1", title: "Safari does not fire animationend for certain CSS animations", mechanism: "The modal uses CSS animation for fade-out. Safari 17 has a known bug where animationend is not dispatched when the animation uses certain timing functions with transform. React Transition Group waits for this event to unmount the DOM node.", likelihood: "high", confirming: ["Overlay persists 100% of time in Safari 17", "animationend listener confirmed never called via DevTools breakpoint in Safari"], refuting: ["Behavior is Safari-specific, Chrome and Firefox unaffected"], status: "retained", reason: "Safari animationend bug confirmed as root cause" }),
    reproductionSteps: steps(["Safari 17 on macOS", "Page with modal dialog trigger"], [{ action: "Open any modal dialog" }, { action: "Click the close button" }, { action: "Wait for fade-out animation to complete visually" }, { action: "Attempt to click any element on the underlying page" }], "Modal closes, page is interactive", "Clicks not registered, page unresponsive — overlay blocks interaction"),
    testCode: `// Bug Reproduction Test — modal overlay cleanup\ndescribe('ModalComponent', () => {\n  it('removes overlay from DOM after close animation timeout', async () => {\n    const { getByRole, queryByTestId } = render(<ModalWrapper />);\n    fireEvent.click(getByRole('button', { name: /open modal/i }));\n    fireEvent.click(getByRole('button', { name: /close/i }));\n    await waitFor(() => expect(queryByTestId('modal-overlay')).not.toBeInTheDocument(), { timeout: 500 });\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(16),
    updatedAt: daysAgo(16),
  },

  // ── DATABASE QUERY (4) ──────────────────────────────────────────────────────

  {
    title: "PostgreSQL connection pool exhausted under API load spike",
    inputType: "raw_text" as const,
    rawInput: `All API endpoints return 503 errors during traffic spikes because the PostgreSQL connection pool is exhausted. The pool is configured with max=10 connections but several long-running report queries hold connections for 30-60 seconds. When a burst of requests arrives, all 10 connections are occupied by report queries, leaving no connections for fast user-facing requests.`,
    tags: "database,postgresql,connection,pool,timeout,slow-query,performance,seed-data",
    status: "completed" as const,
    severity: "critical" as const,
    severityReason: "Complete API outage during traffic spikes — all user-facing endpoints fail when connection pool is exhausted.",
    confidenceScore: 0.92,
    confidenceBreakdown: breakdown(92, { stack_trace: 25, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, [], ["pg_stat_activity confirms connections held by report queries", "Connection pool metrics show exhaustion during incident"], []),
    extractedEntities: ent("DatabaseConnectionPool", "User-facing API request during report query execution", "Fast API request completes within 100ms with available connection", "503 Service Unavailable: no connections available in pool", ["Error: timeout exceeded when trying to connect — pool exhausted", "pg_stat_activity shows 10/10 connections in active state", "PoolClient.connect: waitForAvailableConnectionIfNonePresent timed out after 5000ms"], "intermittent", { runtime: "PostgreSQL 15, Node.js pg pool", version: "api-server v6.0.0" }, "Separate connection pools for OLAP (reports) and OLTP (user requests). Limit report queries to 3 connections. Add query timeout of 60s to kill stale connections."),
    hypotheses: hyps({ id: "h1", title: "Shared pool between fast and slow queries starves user requests", mechanism: "All queries share a single pool of 10 connections. Report queries hold connections for 30-60s. During a burst, all 10 are occupied by reports. User-facing queries queue until pool timeout, returning 503.", likelihood: "high", confirming: ["pg_stat_activity shows all connections used by report-service during incidents", "Dedicated report pool resolves the issue in testing"], refuting: [], status: "retained", reason: "Pool starvation confirmed by connection monitoring" }),
    reproductionSteps: steps(["PostgreSQL with connection pool max=10", "Report queries running"], [{ action: "Trigger 10 concurrent report generation requests" }, { action: "Immediately send 5 user-facing API requests" }, { action: "Observe user-facing API response codes" }], "User-facing requests complete within 200ms", "User-facing requests return 503 — pool exhausted"),
    testCode: `// Bug Reproduction Test — connection pool starvation\ndescribe('DatabaseConnectionPool', () => {\n  it('does not starve user requests when report pool is saturated', async () => {\n    const reportPromises = Array.from({ length: 10 }, () => runSlowReport());\n    const userRequest = getUserProfile(userId);\n    const result = await Promise.race([userRequest, new Promise(r => setTimeout(() => r('timeout'), 1000))]);\n    expect(result).not.toBe('timeout');\n    await Promise.allSettled(reportPromises);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(58),
    updatedAt: daysAgo(58),
  },

  {
    title: "N+1 query on user dashboard causes 30-second page load",
    inputType: "raw_text" as const,
    rawInput: `User dashboard takes 25-30 seconds to load for accounts with many projects. Investigation reveals an N+1 query pattern: the dashboard loads all projects in one query (N=150), then executes a separate query for each project's latest activity (N queries), totaling 151 database round trips. Each query has ~200ms latency, resulting in 30+ seconds total.`,
    tags: "database,performance,query,slow,postgresql,nplusone,optimization,seed-data",
    status: "completed" as const,
    severity: "high" as const,
    severityReason: "30-second dashboard load is effectively unusable — high-value users with many projects have the worst experience.",
    confidenceScore: 0.88,
    confidenceBreakdown: breakdown(88, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 10 }, ["stack_trace"], ["Database query log shows 151 sequential queries", "N+1 pattern identified in ORM code review"], []),
    extractedEntities: ent("DashboardDataService", "Load user dashboard with projects and latest activity", "Dashboard loads in under 1s with single joined query", "151 sequential database queries execute, page load takes 30s", ["slow query: dashboard loaded in 28432ms", "N+1 query detected: 150 separate queries for project activity", "pg_stat_statements shows getProjectActivity called 150 times per dashboard load"], "always", { runtime: "Node.js 20, PostgreSQL 15", version: "dashboard-service v3.1.0" }, "Replace individual getProjectActivity calls with a single JOIN or CTE. Use ORM eager loading: Project.findAll({ include: [LatestActivity] })."),
    hypotheses: hyps({ id: "h1", title: "N+1 query in dashboard project activity loading", mechanism: "DashboardService loads projects array then iterates: for (const project of projects) { await getProjectActivity(project.id) }. Each getProjectActivity is a separate SQL query. With 150 projects, this is 150 sequential DB round trips.", likelihood: "high", confirming: ["Query log shows 150 identical SELECT queries with different project_id values", "Replacing loop with JOIN reduces load to 1 query and 200ms"], refuting: [], status: "retained", reason: "N+1 pattern confirmed in service code and query logs" }),
    reproductionSteps: steps(["User account with >100 projects", "Database query logging enabled"], [{ action: "Log in as user with 150 projects" }, { action: "Navigate to dashboard" }, { action: "Count database queries in logs during load" }], "Dashboard loads in <1s with single query", "150+ sequential queries, 30s load time"),
    testCode: `// Bug Reproduction Test — N+1 query on dashboard\ndescribe('DashboardDataService', () => {\n  it('loads dashboard with single query for all project activities', async () => {\n    const queryCount = { value: 0 };\n    db.on('query', () => queryCount.value++);\n    await loadDashboard(userId);\n    db.off('query');\n    expect(queryCount.value).toBeLessThan(5);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(43),
    updatedAt: daysAgo(43),
  },

  {
    title: "Missing composite index causes full table scan on product search",
    inputType: "raw_text" as const,
    rawInput: `Product search becomes slow when filtering by both category and price range simultaneously. The query planner performs a sequential scan on the products table (2M rows) instead of using an index. Individual indexes on category and price exist, but PostgreSQL cannot efficiently combine them for this query. A composite index on (category, price) would resolve this.`,
    tags: "database,postgresql,index,slow-query,performance,search,scan,seed-data",
    status: "completed" as const,
    severity: "medium" as const,
    severityReason: "Search response time degrades to 8-10 seconds at scale — unacceptable for product discovery UX.",
    confidenceScore: 0.82,
    confidenceBreakdown: breakdown(82, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 5, similar_bug: 0 }, ["stack_trace"], ["EXPLAIN ANALYZE confirms sequential scan", "Adding composite index reduces query time from 8s to 12ms"], []),
    extractedEntities: ent("ProductSearchRepository", "Search products filtered by category and price range", "Search results return in under 200ms", "Full table sequential scan on 2M row products table, query takes 8-10 seconds", ["slow query warning: product_search execution=8432ms plan=Seq Scan", "EXPLAIN ANALYZE: Seq Scan on products (cost=0..45000 rows=2000000)", "Query planner selected sequential scan: no suitable composite index"], "always", { runtime: "PostgreSQL 15", version: "search-service v2.4.0" }, "CREATE INDEX CONCURRENTLY idx_products_category_price ON products(category, price). Run ANALYZE after creation. Consider partial index for active products only."),
    hypotheses: hyps({ id: "h1", title: "Missing composite index for multi-column filter", mechanism: "PostgreSQL has separate indexes on category and price but cannot merge them efficiently for a combined filter. The query planner chooses a sequential scan as the estimated cost is lower than the double-index bitmap scan.", likelihood: "high", confirming: ["EXPLAIN ANALYZE confirms Seq Scan", "Composite index creation drops query time from 8s to 12ms in test environment"], refuting: [], status: "retained", reason: "EXPLAIN ANALYZE definitively confirms missing composite index" }),
    reproductionSteps: steps(["PostgreSQL database with products table >1M rows", "psql access for EXPLAIN ANALYZE"], [{ action: "Run: EXPLAIN ANALYZE SELECT * FROM products WHERE category='electronics' AND price BETWEEN 100 AND 500" }, { action: "Observe execution plan" }, { action: "Check for 'Seq Scan' in output" }], "Index Scan: results in <100ms", "Seq Scan on 2M rows: 8-10 second execution"),
    testCode: `// Bug Reproduction Test — composite index for category+price filter\ndescribe('ProductSearchRepository', () => {\n  it('uses index scan for category+price filter', async () => {\n    const explain = await db.query('EXPLAIN SELECT * FROM products WHERE category=$1 AND price BETWEEN $2 AND $3', ['electronics', 100, 500]);\n    expect(explain.rows.map(r => r['QUERY PLAN']).join(' ')).not.toMatch(/Seq Scan/);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(31),
    updatedAt: daysAgo(31),
  },

  {
    title: "Transaction isolation violation causes oversold inventory on concurrent orders",
    inputType: "raw_text" as const,
    rawInput: `Inventory management shows negative stock counts for popular items during flash sales. Concurrent order transactions both read the same stock level (READ COMMITTED), both determine sufficient stock exists, and both decrement the inventory. The result is inventory going below zero — items are oversold. Requires SERIALIZABLE isolation or SELECT FOR UPDATE.`,
    tags: "database,transaction,isolation,concurrency,inventory,postgresql,oversold,seed-data",
    status: "completed" as const,
    severity: "critical" as const,
    severityReason: "Overselling inventory causes order fulfillment failures and customer refunds — direct financial and reputational damage.",
    confidenceScore: 0.94,
    confidenceBreakdown: breakdown(94, { stack_trace: 0, code_context: 15, reproduction_steps: 25, error_message: 20, environment: 10, frequency: 8, similar_bug: 10 }, ["stack_trace"], ["Inventory going negative confirmed in database audit log", "Concurrent test reproduces oversell with READ COMMITTED isolation"], []),
    extractedEntities: ent("InventoryService", "Concurrent order placement for limited stock item", "Stock level never goes below zero, concurrent orders correctly rejected when stock exhausted", "Two concurrent transactions both succeed when only 1 unit available, inventory goes to -1", ["Inventory constraint violation: stock_level=-1 below minimum threshold", "Concurrent write conflict: inventory decremented twice from same initial value", "SELECT FOR UPDATE missing: read-modify-write race on inventory table"], "intermittent", { runtime: "PostgreSQL 15", version: "inventory-service v4.0.0" }, "Use SELECT FOR UPDATE on inventory rows inside transaction to acquire a pessimistic lock. Alternatively, use UPDATE inventory SET stock = stock - 1 WHERE stock > 0 AND id = $1 and check rows affected = 1."),
    hypotheses: hyps({ id: "h1", title: "READ COMMITTED isolation allows concurrent stock reads before decrement", mechanism: "Both transactions read stock=1 (READ COMMITTED sees latest committed row). Both pass the stock > 0 check and proceed to decrement. First transaction commits stock=0, second transaction commits stock=-1 without detecting the intermediate commit.", likelihood: "high", confirming: ["Concurrent test with 2 orders for 1 unit reliably produces stock=-1", "SELECT FOR UPDATE serializes access and prevents oversell"], refuting: [], status: "retained", reason: "Isolation level race confirmed between concurrent read and decrement" }),
    reproductionSteps: steps(["Product with stock=1 in database", "PostgreSQL READ COMMITTED isolation (default)"], [{ action: "Simultaneously submit 2 order requests for the last unit" }, { action: "Check inventory.stock_level after both orders complete" }], "Second order rejected (stock=0), inventory stays non-negative", "Both orders succeed, inventory.stock_level = -1"),
    testCode: `// Bug Reproduction Test — inventory oversell under concurrency\ndescribe('InventoryService', () => {\n  it('prevents inventory going negative under concurrent orders', async () => {\n    await setStock(productId, 1);\n    const [r1, r2] = await Promise.allSettled([\n      placeOrder({ productId, quantity: 1 }),\n      placeOrder({ productId, quantity: 1 }),\n    ]);\n    const stock = await getStock(productId);\n    expect(stock).toBeGreaterThanOrEqual(0);\n    const successes = [r1, r2].filter(r => r.status === 'fulfilled');\n    expect(successes).toHaveLength(1);\n  });\n});`,
    testSyntaxStatus: "verified" as const,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
  },

];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const existing = await db
    .select({ id: analysesTable.id })
    .from(analysesTable)
    .limit(25);

  if (existing.length >= 20 && !force) {
    console.log(`Database already has ${existing.length} analyses. Use --force to re-seed.`);
    process.exit(0);
  }

  console.log(`Inserting ${SEEDS.length} seed analyses...`);
  let inserted = 0;

  for (const seed of SEEDS) {
    try {
      await db.insert(analysesTable).values(seed);
      inserted++;
      process.stdout.write(`  [${inserted}/${SEEDS.length}] ${seed.title}\n`);
    } catch (err) {
      console.error(`  FAILED: ${seed.title}`, err);
    }
  }

  console.log(`\nDone. ${inserted}/${SEEDS.length} entries inserted.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
