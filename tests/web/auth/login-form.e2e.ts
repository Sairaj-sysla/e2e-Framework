// Deterministic login checks for the demo app: no model calls, no API key.
import { test } from '@e2e-dev/web';
import { DEMO_USER, UNKNOWN_EMAIL } from '../../../test-data/users.js';
import { expectLoginError, loginAs, openLogin, submitLogin } from '../../support/web/demoAuth.js';

test(
  'E2E_LOGIN_002: a registered user logs in and sees the Dashboard',
  { tags: ['web', 'feature:auth', 'smoke', 'critical'], requires: ['browser'] },
  async ({ app, screen }) => {
    await openLogin(app, screen);
    await loginAs(screen, DEMO_USER.credential, DEMO_USER.displayName);
  },
);

test(
  'E2E_LOGIN_003: an unknown email is rejected with an error',
  { tags: ['web', 'feature:auth', 'regression', 'high'], requires: ['browser'] },
  async ({ app, screen }) => {
    await openLogin(app, screen);
    await submitLogin(screen, UNKNOWN_EMAIL, 'NotARealPassword1!');
    await expectLoginError(screen, 'Invalid email or password.');
  },
);

test(
  'E2E_LOGIN_004: submitting an empty form asks for both fields',
  { tags: ['web', 'feature:auth', 'regression', 'medium'], requires: ['browser'] },
  async ({ app, screen }) => {
    await openLogin(app, screen);
    await screen.getByRole('button', { name: 'Login' }).tap();
    await expectLoginError(screen, 'Email and password are required.');
  },
);
