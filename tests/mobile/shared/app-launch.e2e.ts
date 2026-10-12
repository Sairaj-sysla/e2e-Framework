// E2E_MOBILE_001: the app under test launches on iOS and Android.
//
// Runs on every device target in e2e.config.ts (set IOS_BUNDLE_ID or
// ANDROID_PACKAGE in .env to enable one); browser targets skip it.
// Put flows that differ per platform in tests/mobile/ios or tests/mobile/android
// with `platforms: ['ios']` or `platforms: ['android']`.
import { test } from '@e2e-dev/mobile';

test(
  'E2E_MOBILE_001: the app launches to its first screen',
  { tags: ['mobile', 'feature:app', 'smoke', 'critical', 'ai'], requires: ['device'] },
  async ({ app, agent }) => {
    await app.open();
    await agent.assert('The app has finished launching and shows its first screen, with no crash or error dialog');
  },
);
