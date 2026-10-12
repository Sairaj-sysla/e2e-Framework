// E2E_LOGIN_001: Verify that a user can log in successfully and view the Dashboard.
//
// Preconditions:
// - The demo app runs on http://localhost:3000 (the runner starts it, see e2e.config.ts).
// - OPENROUTER_API_KEY is set: the agent.* steps below call a model.
// - The `demo` credentials are declared in e2e.config.ts.
//
// The suite's hybrid reference test: AI-driven steps (agent.act, agent.assert)
// do the interaction and a semantic check; the pass/fail verdict rests on
// deterministic expect() checks, which also let the replay cache record each
// act. The PR smoke gate uses the deterministic E2E_LOGIN_002 instead, so pull
// requests spend no model calls on login.
import { test } from '@e2e-dev/web';
import { credentials, expect } from 'e2e';

test(
  'E2E_LOGIN_001: user can log in successfully and view the Dashboard',
  { tags: ['web', 'feature:auth', 'regression', 'high', 'ai'], requires: ['browser'] },
  async ({ app, agent, screen }) => {
    const demo = credentials.user('demo');

    // Step 1: open the login page.
    await app.open('/');

    // Step 2: the login page is displayed (deterministic).
    await expect(screen.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(screen.getByLabel('Email')).toBeVisible();
    await expect(screen.getByLabel('Password')).toBeVisible();

    // Step 3: the agent fills in the form. The password is a Secret: the model
    // only sees its name and the runner types the value.
    await agent.act('Enter {email} in the Email field and {password} in the Password field', {
      params: { email: demo.username, password: demo.password },
    });
    await expect(screen.getByLabel('Email')).toHaveValue(demo.username);

    // Step 4: the agent submits the form.
    await agent.act('Click the Login button');

    // Step 5: AI judgment of the logged-in state.
    await agent.assert('The user is logged in and the Dashboard is displayed');

    // Step 6: deterministic check with an accessible locator.
    await expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(screen.getByRole('status')).toHaveText('Welcome, Demo User!');

    // Step 7: the login form is gone.
    await expect(screen.getByRole('heading', { name: 'Login' })).toBeHidden();
    await expect(screen.getByRole('button', { name: 'Login' })).toBeHidden();
  },
);
