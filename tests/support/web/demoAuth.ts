// Login, logout, and their checks for the demo app (demo-app/). Every helper
// is deterministic and ends with a check of what the page then shows, so
// tests built on it need no model calls.
import type { App, Screen, Secret } from 'e2e';
import { credentials, expect } from 'e2e';

/** Opens the app and checks the login form is shown. */
export async function openLogin(app: App, screen: Screen): Promise<void> {
  await app.open('/');
  await expect(screen.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(screen.getByLabel('Email')).toBeVisible();
  await expect(screen.getByLabel('Password')).toBeVisible();
}

/** Fills the login form and submits it; the caller checks the outcome. */
export async function submitLogin(screen: Screen, email: string, password: string | Secret): Promise<void> {
  await screen.getByLabel('Email').fill(email);
  await expect(screen.getByLabel('Email')).toHaveValue(email);
  await screen.getByLabel('Password').fill(password);
  await screen.getByRole('button', { name: 'Login' }).tap();
}

/** Logs in as a configured credential (e2e.config.ts `credentials`) and checks the dashboard. */
export async function loginAs(screen: Screen, credential: string, displayName: string): Promise<void> {
  const user = credentials.user(credential);
  await submitLogin(screen, user.username, user.password);
  await expectDashboard(screen, displayName);
}

/** The dashboard greets the user and the login form is gone. */
export async function expectDashboard(screen: Screen, displayName: string): Promise<void> {
  await expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(screen.getByRole('status')).toHaveText(`Welcome, ${displayName}!`);
  await expect(screen.getByRole('heading', { name: 'Login' })).toBeHidden();
}

/** The login form shows `message` as an alert and no dashboard. */
export async function expectLoginError(screen: Screen, message: string): Promise<void> {
  await expect(screen.getByRole('alert')).toHaveText(message);
  await expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeHidden();
}

/** Logs out from the dashboard and checks the login form is back. */
export async function logout(screen: Screen): Promise<void> {
  await screen.getByRole('button', { name: 'Logout' }).tap();
  await expect(screen.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeHidden();
}
