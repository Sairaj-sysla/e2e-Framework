// Framework health from the runner's own report: counts, pass rate, slowest
// tests, retries and flakes, per-target breakdown, AI calls/tokens/cost and
// replay-cache use, and failures grouped by likely cause. Appends a compact
// entry to reports/history.jsonl and compares with the previous entry.
//
// Usage: npm run report                       (reads .e2e/report.json)
//        node scripts/report-summary.mjs a/report.json b/report.json   (CI shards)
//
// Every number comes from report.json. Token and cost figures are what the
// provider reported (tokenAccounting) and are shown as missing, never guessed.
// Failure categories are a triage hint from the error code, not a verdict.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const files = process.argv.slice(2).length ? process.argv.slice(2) : ['.e2e/report.json'];
const historyFile = 'reports/history.jsonl';
const summaryFile = 'reports/summary.md';

// Error code → triage category. Codes are the runner's (topic `debugging`).
const CATEGORIES = [
  ['AI budget / credits / rate limit', (e) => /MODEL_PROVIDER_FAILED/.test(e.code) && /credit|max_tokens|rate.?limit|429|quota|Prompt tokens limit/i.test(e.message)],
  ['AI provider error', (e) => /^MODEL_(PROVIDER_FAILED|UNAVAILABLE|OUTPUT_INVALID)$/.test(e.code)],
  ['AI step budget', (e) => /^(STEP_BUDGET_EXHAUSTED|CONTEXT_OVERFLOW)$/.test(e.code)],
  ['Locator', (e) => /^(LOCATOR_NOT_FOUND|LOCATOR_AMBIGUOUS|INVALID_LOCATOR)$/.test(e.code)],
  ['Timing / synchronization', (e) => /^(TEST_TIMEOUT|STEP_TIMEOUT|OPERATION_TIMEOUT)$/.test(e.code) || (e.code === 'ACTION_FAILED' && /timed out/i.test(e.message))],
  ['Authentication', (e) => /^(AUTH_|SESSION_|SECRET_UNAVAILABLE|LOGIN_REQUIRED|NOT_LOGGED_IN)/.test(e.code)],
  ['Test data', (e) => /^SEED_DATA_MISSING$/.test(e.code)],
  ['Environment / app', (e) => /^(APP_UNREACHABLE|APP_ALREADY_RUNNING|ENVIRONMENT_UNAVAILABLE|BROWSER_INSTALL_FAILED|LAUNCH_TIMEOUT|APP_URL_REQUIRED)$/.test(e.code)],
  ['Device infrastructure', (e) => e.platform !== 'web' && e.category === 'infrastructure'],
  ['Assertion (possible app defect)', (e) => /^(ASSERTION_FAILED|ASSERTION_INCONCLUSIVE|ACTION_FAILED)$/.test(e.code)],
  ['Configuration', (e) => e.category === 'configuration'],
];
const classify = (e) => CATEGORIES.find(([, match]) => match(e))?.[0] ?? `Unclassified (${e.code ?? 'no code'})`;
const firstLine = (text = '') => text.split('\n')[0].slice(0, 200);
const idOf = (title) => title.match(/^(E2E_[A-Z0-9]+_\d{3})/)?.[1] ?? title.slice(0, 60);

const reports = files.map((file) => {
  if (!existsSync(file)) throw new Error(`${file} not found: run the tests first (npx e2e run ...)`);
  return JSON.parse(readFileSync(file, 'utf8')).run;
});

const totals = { discovered: 0, selected: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, interrupted: 0 };
const ai = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costReported: 0, modelSteps: 0, models: new Set() };
const cache = { 'self-finalized': 0, 'agent-concluded': 0, missed: 0 };
const byTarget = {};
const tests = [];
const failures = [];
let durationMs = 0;

for (const run of reports) {
  // Every shard discovers the whole suite; everything else is per shard.
  for (const key of Object.keys(totals)) {
    totals[key] = key === 'discovered' ? Math.max(totals[key], run.summary[key] ?? 0) : totals[key] + (run.summary[key] ?? 0);
  }
  durationMs = Math.max(durationMs, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
  for (const error of run.errors ?? []) {
    failures.push({ id: '(run)', target: '-', code: error.code, message: firstLine(error.message), category: classify({ ...error, platform: 'run' }) });
  }
  for (const result of run.results) {
    if (!result.selected) continue;
    const target = (byTarget[result.targetId] ??= { passed: 0, failed: 0, flaky: 0, skipped: 0, interrupted: 0 });
    if (result.status in target) target[result.status]++;
    const title = result.titlePath.join(' › ');
    const attemptsMs = result.attempts.reduce((sum, a) => sum + (a.durationMs ?? 0), 0);
    tests.push({ id: idOf(title), title, target: result.targetId, status: result.status, durationMs: attemptsMs, attempts: result.attempts.length });

    for (const attempt of result.attempts) {
      for (const step of attempt.steps ?? []) {
        if (step.cache?.mode) cache[step.cache.mode]++;
        if (!step.model) continue;
        ai.modelSteps++;
        ai.calls += step.model.calls ?? 0;
        ai.inputTokens += step.model.inputTokens ?? 0;
        ai.outputTokens += step.model.outputTokens ?? 0;
        ai.models.add(`${step.model.provider}/${step.model.model}`);
        if (typeof step.model.estimatedCostUsd === 'number') {
          ai.costUsd += step.model.estimatedCostUsd;
          ai.costReported++;
        }
      }
    }
    const error = result.attempts.at(-1)?.error ?? result.error;
    if (result.status === 'failed' && error) {
      const failedStep = result.attempts.at(-1)?.steps?.find((s) => s.status !== 'passed');
      failures.push({
        id: idOf(title), target: result.targetId, code: error.code, message: firstLine(error.message),
        step: failedStep ? `${failedStep.api} ${firstLine(failedStep.label ?? '').slice(0, 80)}` : undefined,
        everyAttempt: result.attempts.every((a) => a.error?.code === error.code),
        category: classify({ ...error, platform: result.platform }),
      });
    }
  }
}

const executed = totals.passed + totals.failed + totals.flaky;
const passRate = executed ? ((totals.passed + totals.flaky) / executed) * 100 : null;
const retried = tests.filter((t) => t.attempts > 1).length;
const slowest = [...tests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
const failingIds = [...new Set(failures.filter((f) => f.id !== '(run)').map((f) => f.id))];
const categories = failures.reduce((acc, f) => ({ ...acc, [f.category]: (acc[f.category] ?? 0) + 1 }), {});
const cacheTotal = Object.values(cache).reduce((a, b) => a + b, 0);

const entry = {
  at: reports[0]?.startedAt, commit: reports[0]?.vcs?.commit?.slice(0, 7), branch: reports[0]?.vcs?.branch,
  ci: reports[0]?.environment?.ci, ...totals, passRate, durationMs, retried, failingIds, categories,
  ai: { calls: ai.calls, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, costUsd: ai.costReported ? ai.costUsd : null },
  cache,
};
const previous = existsSync(historyFile)
  ? readFileSync(historyFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).at(-1)
  : undefined;

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
const delta = (now, before, unit = '', digits = 1) =>
  !Number.isFinite(before) || !Number.isFinite(now) ? '' : ` (${now - before >= 0 ? '+' : ''}${(now - before).toFixed(digits)}${unit} vs previous)`;
const lines = [
  '# E2E run health',
  '',
  `Source: ${files.join(', ')} · commit ${entry.commit ?? '?'} · ${entry.ci ? 'CI' : 'local'} · actual results from report.json`,
  '',
  '| Discovered | Selected | Passed | Failed | Flaky | Skipped | Interrupted | Pass rate | Duration |',
  '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  `| ${totals.discovered} | ${totals.selected} | ${totals.passed} | ${totals.failed} | ${totals.flaky} | ${totals.skipped} | ${totals.interrupted} | ${passRate == null ? 'n/a' : `${passRate.toFixed(1)}%`} | ${s(durationMs)} |`,
  '',
  `Pass rate counts passed + flaky over executed tests${delta(passRate, previous?.passRate, ' pts')}. Duration is wall clock (longest report when several)${delta(durationMs / 1000, previous?.durationMs / 1000, 's')}.`,
  `Retried tests: ${retried} · flaky (passed on retry): ${totals.flaky}`,
  '',
  '## By target',
  '',
  '| Target | Passed | Failed | Flaky | Skipped | Interrupted |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...Object.entries(byTarget).map(([t, c]) => `| ${t} | ${c.passed} | ${c.failed} | ${c.flaky} | ${c.skipped} | ${c.interrupted} |`),
  '',
  '## AI usage',
  '',
  ai.modelSteps
    ? `Model calls: ${ai.calls} over ${ai.modelSteps} steps (${[...ai.models].join(', ')}) · tokens in/out: ${ai.inputTokens}/${ai.outputTokens} · cost: ${ai.costReported ? `$${ai.costUsd.toFixed(4)} (provider-reported, ${ai.costReported}/${ai.modelSteps} steps)` : 'not reported by the provider'}`
    : 'No model-backed steps ran.',
  cacheTotal
    ? `Replay cache (agent.act): ${cache['self-finalized']} replayed with no model call, ${cache['agent-concluded']} replayed then handed to the model, ${cache.missed} missed.`
    : 'Replay cache: no cached agent steps in this run.',
  '',
  '## Slowest tests',
  '',
  ...slowest.map((t) => `- ${s(t.durationMs)} · ${t.status} · [${t.target}] ${t.title}`),
  '',
  '## Failures by likely cause',
  '',
  failures.length ? '_Categories come from the error code: a starting point for triage, not a verdict._' : 'None.',
  '',
  ...Object.entries(categories).map(([c, n]) => `- **${c}**: ${n}`),
  '',
  ...failures.map((f) =>
    [`### ${f.id} [${f.target}] · ${f.category}`, '', `- \`${f.code}\`: ${f.message}`, f.step && `- Failed step: ${f.step}`,
      f.everyAttempt === false && '- Attempts failed differently: check for flakiness'].filter(Boolean).join('\n') + '\n'),
];
if (previous) {
  const before = new Set(previous.failingIds ?? []);
  const now = new Set(failingIds);
  lines.push('', '## Compared with the previous run', '',
    `- Newly failing: ${failingIds.filter((id) => !before.has(id)).join(', ') || 'none'}`,
    `- Fixed since: ${[...before].filter((id) => !now.has(id)).join(', ') || 'none'}`,
    `- Still failing: ${failingIds.filter((id) => before.has(id)).join(', ') || 'none'}`, '');
}

const markdown = `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
mkdirSync(dirname(historyFile), { recursive: true });
writeFileSync(summaryFile, markdown);
appendFileSync(historyFile, `${JSON.stringify(entry)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
console.log(`Wrote ${summaryFile}; appended to ${historyFile}.`);
