// Account references by credential name. Usernames and passwords live in
// e2e.config.ts `credentials` (demo values) or E2E_USER_<NAME>_USERNAME /
// E2E_USER_<NAME>_PASSWORD (real environments), never in test files.

/** The demo app's account (demo-app/server.js); DEMO-ONLY. */
export const DEMO_USER = { credential: 'demo', displayName: 'Demo User' } as const;

/** A well-formed email no environment has an account for. */
export const UNKNOWN_EMAIL = 'nobody@example.test';
