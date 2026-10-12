# AI-assisted E2E framework (TesterArmy `e2e`)

End-to-end tests for web (Playwright engine, `@e2e-dev/web`) and mobile (`@e2e-dev/mobile`, Android and iOS) on the TesterArmy [`e2e`](https://e2e.tester.army) runner. Tests are **deterministic first**: exact locators and `expect` checks carry every verdict, and AI steps (`agent.act`, `agent.assert`) are used where they add value. Most of the suite runs with no model and no API key.

The `e2e` CLI is installed in `node_modules`, so run it as `npx e2e ...` or through `npm run`. A bare `e2e run ...` fails with "The term 'e2e' is not recognized".

## Layout

```
e2e.config.ts                  Targets (web, android, ios), AI agent, reporters, demo credentials
tests/
  web/<feature>/*.e2e.ts       Browser tests, one folder per feature (auth/, hotels/)
  mobile/shared/*.e2e.ts       Device tests for both Android and iOS
  mobile/android/, mobile/ios/ Platform-only device tests
  support/web/                 Reusable page helpers: demoAuth.ts, easemytripHotels.ts
  support/mobile/              Reusable device helpers
test-data/                     Test inputs kept out of test logic: users.ts, hotels.ts
scripts/
  validate-tests.mjs           Test ID and tag conventions (npm run lint:tests)
  report-summary.mjs           Run health, AI usage, failure causes, history (npm run report)
  check-ai-config.mjs          OpenRouter key, credit and model check (npm run check:ai)
.github/workflows/e2e.yml      PR smoke, daily regression, weekly full, manual release suite
.e2e/cache/                    Replay cache: verified agent.act recordings (committed)
demo-app/                      Demo login app under test (plain Node.js)
.claude/skills/e2e/, .mcp.json Framework docs and MCP server for Claude Code
```

Suites (smoke, regression, critical) are **tags, not folders**: a test belongs to one feature folder and can be in several suites without being moved or copied.

## Quick start (PowerShell)

```powershell
npm install
copy .env.example .env         # then set OPENROUTER_API_KEY in .env (only AI tests need it)
npm run validate               # typecheck + test ID/tag conventions
npm run test:smoke:no-ai       # deterministic smoke suite: no key, no model calls
npm run report                 # health summary of the last run
```

Requirements: Node.js 24.8+ (or 22.22.3+). The first run downloads Chromium.

## Running tests

| What | Command |
| --- | --- |
| One test, by ID | `npx e2e run --grep E2E_LOGIN_003` |
| One test, by line | `npx e2e run tests/web/auth/login-form.e2e.ts:15` |
| One feature | `npx e2e run tests/web/auth` or `npx e2e run --tag feature:auth` |
| PR smoke suite | `npm run test:smoke` (`smoke`, not `live`) |
| Smoke without a model | `npm run test:smoke:no-ai` |
| Release-critical workflows | `npm run test:critical` |
| Web regression | `npm run test:regression` |
| All web tests | `npm run test:web` |
| Android / iOS | `npm run test:android` / `npm run test:ios` (needs a device, see Mobile) |
| Live EaseMyTrip test (headed) | `npm run test:hotels` |
| Everything on every configured target | `npm run test:e2e` |
| Preview a selection without running | `npx e2e list --tag smoke` |
| Rerun last failures | `npx e2e run --last-failed` |
| Watch the browser | add `--headed` |
| Agent transcripts, timings, AI trace | `npm run test:e2e:debug` |

`npx e2e run --help` lists every flag: `--tag`, `--exclude-tag`, `--tag-mode all`, `--grep`, `--target`, `--shard i/n`, `--workers`, `--retries`, `--max-failures`, `--repeat-each`, `--no-cache`, `--strict-cache`.

## Test IDs and tags

Every test title starts with a stable, unique ID, and its tags say where and when it runs. `npm run lint:tests` enforces this using the runner's own test collection, and CI runs it before any test.

```ts
test(
  'E2E_LOGIN_003: an unknown email is rejected with an error',
  { tags: ['web', 'feature:auth', 'regression', 'high'], requires: ['browser'] },
  async ({ app, screen }) => { ... },
);
```

| Part | Rule |
| --- | --- |
| Title | `E2E_<AREA>_<NNN>: <what the user does and sees>`, unique suite-wide. Never reuse a retired ID |
| Platform | exactly one of `web`, `mobile`; `android` / `ios` on platform-only mobile tests |
| Feature | exactly one `feature:<name>`; for web it matches the folder `tests/web/<name>/` |
| Suite | at least one of `smoke`, `regression`, `api` |
| Priority | exactly one of `critical` (release-blocking), `high`, `medium`, `low` |
| Extras | `live` (third-party or live site: never in smoke or CI), `ai` (needs a model) |

**Renaming a test file or title drops its replay-cache recordings**, because entries are keyed by file path and title. Rename deliberately.

### Routing tests to targets

| Test kind | Import `test` from | Options |
| --- | --- | --- |
| Web | `@e2e-dev/web` | `requires: ['browser']` |
| Mobile, both platforms | `@e2e-dev/mobile` | `requires: ['device']` |
| Android only / iOS only | `@e2e-dev/mobile` | `requires: ['device'], platforms: ['android']` (or `['ios']`) |

Targets that lack the capability skip the test at selection. `npx e2e list` shows where each test runs.

## Writing tests: deterministic first, AI where it helps

1. **Build from helpers.** `tests/support/web/` holds one module per app or page. Each helper does one user-level operation and ends by checking what the page then shows. Examples: `openLogin`, `loginAs`, `logout`, `expectLoginError` (demo app), and `openHotels`, `selectDestination`, `selectStayDates`, `configureRooms`, `searchHotels`, `expectSearchResults`, `sortResults`, `expectPricesSorted` (EaseMyTrip).
2. **Use exact checks for business facts:** IDs, amounts, prices, dates, guest counts, form values, statuses, URLs.
3. **Use `agent.act`** for flows that are hard to pin with stable locators, for new or changing screens, and while exploring a feature. Follow every `act` with a locator `expect`, `browser.waitForURL`, or `agent.assert`. That check is what lets the replay cache record the act; an unchecked `act` never replays.
4. **Use `agent.assert` sparingly**, for semantic or visual judgments with no exact equivalent. It always calls the model (it's never cached), so it costs money on every run.
5. **Keep data in `test-data/`.** Credentials come from `e2e.config.ts` `credentials` or `E2E_USER_<NAME>_USERNAME` / `_PASSWORD`, never from test files. When a test creates records, give each run its own value with `unique()` from `e2e` so parallel tests never collide.

`tests/web/auth/login.e2e.ts` (`E2E_LOGIN_001`) is the hybrid reference test. `login-form.e2e.ts` and `logout.e2e.ts` cover the same app deterministically.

## AI model, cost and the replay cache

The `default` agent in `e2e.config.ts` uses OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, default `openai/gpt-6-luna`).

- **Output cap:** OpenRouter reserves credit for a request's full output limit. The config caps each request at `OPENROUTER_MAX_TOKENS` (default 4096). On a near-empty account even a large page's prompt (EaseMyTrip: over 13,000 tokens) can fail with `Prompt tokens limit exceeded`; only more credit fixes that.
- **Budgets:** `act` makes up to 25 model calls and `assert` up to 2. `npm run report` shows the actual calls, tokens and provider-reported cost per run, and `npm run test:e2e:debug` shows them per step.
- **Replay cache:** a passing, verified `act` is saved in `.e2e/cache/`, and later runs replay it with no model call. The directory is committed so CI replays it too (CI reads it, never writes). Entries hold action summaries and digests, never secret values.
- **Failures are never cached:** a failing run evicts the entries it implicates. Add `--strict-cache` in CI once recordings exist, so a stale recording fails instead of quietly calling the model.
- **Before a costly run:** `npm run check:ai` verifies the key, remaining credit and model without printing the key.

## Reports and failure analysis

Every run writes `.e2e/report.json`. The config's reporters add `.e2e/junit.xml` (CI test tabs), `.e2e/summary.md`, and one page per failed test in `.e2e/failures/`: error, failing step, screen at failure, last model turns, and evidence paths. Screenshots, Playwright traces (`npx playwright-core@1.63.0 show-trace <file>`) and `screen.txt` live under `.e2e/artifacts/`.

`npm run report` turns one or more `report.json` files into a health summary in `reports/summary.md`:

- **Results:** counts, pass rate, duration, slowest tests, retries and flaky tests, broken down per target.
- **AI usage:** model calls, input/output tokens and provider-reported cost. It says when the provider reports no cost; it never estimates one.
- **Replay cache:** how many `act` steps replayed, handed off to the model, or missed.
- **Failures by likely cause:** AI budget/credits/rate limit, AI provider, AI step budget, locator, timing, authentication, test data, environment, device infrastructure, assertion (possible app defect), configuration. The category comes from the error code and is a triage hint, not a verdict.
- **Trend:** each run is appended to `reports/history.jsonl` and compared with the previous one: newly failing, fixed, still failing, and changes in pass rate and duration.

| Exit code | Meaning |
| ---: | --- |
| 0 | Every selected test passed, was flaky, or was skipped |
| 1 | A test failed |
| 2 | Config, CLI, collection or credential error: fix it, never retry |
| 3 | Engine, app process or model provider failure: the only code worth a job-level retry |

## CI (GitHub Actions)

`.github/workflows/e2e.yml`:

| Trigger | Suite | Selection |
| --- | --- | --- |
| Pull request, push to `main` | smoke | `--tag smoke` |
| Daily 01:00 UTC | regression | `--tag regression`, sharded |
| Sunday 03:00 UTC | full | all web tests, plus Android/iOS when enabled |
| Manual (`workflow_dispatch`) | smoke, regression, full or release | release = `--tag critical` |

- **Validation first:** a validate job runs typecheck and `lint:tests`, plus `check:ai` when the key secret exists.
- **Never in CI:** `live` tests are always excluded, because EaseMyTrip answers `502` to headless browsers. Without the `OPENROUTER_API_KEY` secret, `ai` tests are skipped with a warning.
- **Scaling knobs:** repository variables `E2E_WEB_SHARDS` (machines) and `E2E_WORKERS` (parallel files per machine). Start at 1 and 2, then raise them from measured runs (see Scaling).
- **Artifacts:** each shard uploads `report.json`, `junit.xml`, `summary.md` and `failures/`. Full `.e2e/artifacts` (screenshots, traces) are uploaded only on failure and kept for 7 days. A report job merges the shards with `npm run report` into the job summary, and keeps `history.jsonl` in the Actions cache for trends.
- **Mobile jobs:** they run in the full suite once `ANDROID_ENABLED` / `IOS_ENABLED` are set to `'true'`. Android uses an x86_64 emulator on Linux with KVM; iOS uses a macOS runner.
- **Obsolete runs:** a new push cancels the PR runs it replaces.

## Mobile

Mobile targets join a run only when their app is set in `.env`, so machines without mobile tooling keep running the web suite.

| Variable | Meaning |
| --- | --- |
| `ANDROID_PACKAGE` or `ANDROID_APP_PATH` | Enables the `android` target (`com.android.settings` works for a first smoke test) |
| `IOS_BUNDLE_ID` or `IOS_APP_PATH` | Enables the `ios` target (macOS with Xcode only) |
| `ANDROID_DEVICE`, `IOS_DEVICE` | Comma-separated device pool: one parallel worker per device |

Prerequisites: the Android SDK with a running emulator or a USB-debugging phone, or Xcode with a simulator. `npx agent-device doctor` must pass. If the engine can't start a device, the run fails with `ENGINE_FAILURE (launch)`. Its log is `~/.agent-device/daemon.log`.

## Scaling to thousands of tests

- **One file per user workflow,** a few tests each. Workers parallelize by file, and `--shard` splits by test, so many small files spread better than a few huge ones.
- **Measure before adding parallelism.** Run `npm run report` after each change to `E2E_WORKERS` or `E2E_WEB_SHARDS`. Raise workers until duration stops falling or failures rise (CPU, memory, or the app's capacity), then add shards.
- **Watch flakiness.** Run a new test with `--repeat-each 5 --no-cache` before merging, and investigate anything in the report's flaky or "attempts failed differently" lines.
- **Keep the PR gate small and deterministic** (smoke ≈ 5–10 minutes). Put breadth in regression and the full suite.
- **Leave `live` tests out of every gate.** They depend on someone else's site.

## Demo application

`demo-app/server.js` serves a login form on http://localhost:3000. The runner starts it (`app.command` in the config) unless `APP_URL` is set. You can also run it yourself with `npm run demo`. The account is `demo@example.test` / `DemoPass123!`, **demo-only**. `E2E_ENV` (`test`, `staging`, `production`) labels reports and keeps cache recordings separate per environment.

## Runtime agent vs. MCP

The runtime agent (`agents` in `e2e.config.ts`) drives `agent.*` steps while tests run, using your OpenRouter key. The MCP server (`.mcp.json` → `npx e2e mcp`) lets Claude Code open the live app and check locators while you write tests; it uses the assistant's own model. `.claude/skills/e2e/` teaches Claude Code the framework API, and `npx e2e guide <topic>` prints the same docs.
