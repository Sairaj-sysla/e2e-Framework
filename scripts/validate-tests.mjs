// Checks every test's ID and tags against the suite's conventions, using the
// runner's own collection (`e2e list --reporter json`), so nothing is parsed
// by hand and nothing starts. Usage: npm run lint:tests
//
// Conventions (see README "Test IDs and tags"):
//   title     E2E_<AREA>_<NNN>: <what the user does and sees>, unique suite-wide
//   platform  exactly one of: web, mobile         (+ android / ios for platform-only tests)
//   feature   exactly one feature:<name>          (web: matches tests/web/<name>/)
//   suite     at least one of: smoke, regression, api
//   priority  exactly one of: critical, high, medium, low
//   extras    live (third-party/live site), ai (needs a model)
// Smoke tests must not be `live`: the PR gate cannot depend on another site.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/e2e/dist/cli/bin.js', import.meta.url));
const { pairs } = JSON.parse(execFileSync(process.execPath, [cli, 'list', '--reporter', 'json'], { encoding: 'utf8' }));

const PLATFORMS = ['web', 'mobile'];
const SUITES = ['smoke', 'regression', 'api'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const EXTRAS = ['live', 'ai', 'android', 'ios'];
const ID = /^(E2E_[A-Z0-9]+_\d{3}): \S/;

const tests = new Map(); // one entry per declared test; `list` repeats it per target
for (const pair of pairs) tests.set(`${pair.file}\u0000${pair.titlePath.join(' ')}`, pair);

const problems = [];
const ids = new Map();
for (const { file, title, titlePath, tags, kind } of tests.values()) {
  if (kind !== 'test') continue;
  const where = `${file} › ${titlePath.join(' › ')}`;
  const fail = (message) => problems.push(`${where}\n    ${message}`);

  const id = title.match(ID)?.[1];
  if (!id) fail(`title must start with a test ID: "E2E_<AREA>_<NNN>: description"`);
  else if (ids.has(id)) fail(`duplicate test ID ${id} (also in ${ids.get(id)})`);
  else ids.set(id, file);

  const pick = (allowed) => tags.filter((tag) => allowed.includes(tag));
  const features = tags.filter((tag) => tag.startsWith('feature:'));
  const unknown = tags.filter(
    (tag) => ![...PLATFORMS, ...SUITES, ...PRIORITIES, ...EXTRAS].includes(tag) && !tag.startsWith('feature:'),
  );

  const [platform, ...otherPlatforms] = pick(PLATFORMS);
  if (!platform || otherPlatforms.length) fail(`needs exactly one platform tag: ${PLATFORMS.join(', ')}`);
  else if (!file.startsWith(`tests/${platform}/`)) fail(`a "${platform}" test belongs under tests/${platform}/`);
  if (platform !== 'mobile' && pick(['android', 'ios']).length) fail('android/ios tags are for mobile tests');

  if (features.length !== 1 || !/^feature:[a-z][a-z0-9-]*$/.test(features[0] ?? '')) {
    fail('needs exactly one feature tag: feature:<kebab-case-name>');
  } else if (platform === 'web') {
    const folder = file.split('/')[2];
    if (features[0] !== `feature:${folder}`) fail(`feature tag ${features[0]} does not match its folder tests/web/${folder}/`);
  }

  if (!pick(SUITES).length) fail(`needs a suite tag: ${SUITES.join(', ')}`);
  if (pick(PRIORITIES).length !== 1) fail(`needs exactly one priority tag: ${PRIORITIES.join(', ')}`);
  if (tags.includes('smoke') && tags.includes('live')) fail('smoke tests must not be live: the PR gate cannot depend on a third-party site');
  if (unknown.length) fail(`unknown tag(s) ${unknown.join(', ')}; allowed: ${[...PLATFORMS, ...SUITES, ...PRIORITIES, ...EXTRAS].join(', ')}, feature:<name>`);
}

const count = [...tests.values()].filter((t) => t.kind === 'test').length;
if (problems.length) {
  console.error(`${problems.length} problem(s) in ${count} tests:\n\n${problems.join('\n\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${count} tests, ${ids.size} unique IDs: IDs and tags OK`);
}
