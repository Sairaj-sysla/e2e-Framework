// Deterministic logout check for the demo app: no model calls, no API key.
import { test } from '@e2e-dev/web';
import { DEMO_USER } from '../../../test-data/users.js';
import { loginAs, logout, openLogin } from '../../support/web/demoAuth.js';

test(
  'E2E_LOGIN_005: logging out returns to the login form',
  { tags: ['web', 'feature:auth', 'regression', 'high'], requires: ['browser'] },
  async ({ app, screen }) => {
    await openLogin(app, screen);
    await loginAs(screen, DEMO_USER.credential, DEMO_USER.displayName);
    await logout(screen);
  },
);
