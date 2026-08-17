/**
 * Walks the real module graph from index.html and fails on the mistakes a
 * build-less ES-module project cannot otherwise catch.
 *
 * This exists because of a bug that survived two rounds of tuning. `index.html`
 * carried an import map that aliased
 *
 *   "./src/config.js?v=floating-island-b-lite"
 *     -> "./src/config-floating-island-tuned.js?v=floating-island-tune2"
 *
 * so the config the game actually ran depended on three `?v=` strings matching
 * byte-for-byte across three files. A single typo would have loaded the old
 * config with no error and no warning, and every test imported `src/config.js`
 * directly and so could never have noticed. There is no bundler here to
 * complain, so the check has to be written down.
 *
 * What it enforces:
 *
 *   1. Every relative import resolves to a file that exists.
 *   2. No relative import carries a `?query` — cache-busting belongs on assets
 *      fetched by URL, not on module specifiers, where it silently forks the
 *      module identity and defeats the import map.
 *   3. Import-map keys that look like local modules resolve to real files.
 *   4. Nothing under src/ is orphaned (reported, not fatal — a module nothing
 *      imports is usually a rename that half-landed).
 *
 *     node tools/test/module-graph.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const problems = [];
const warnings = [];

const IMPORT_PATTERNS = [
  /\bimport\s+[^"';]*?from\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bexport\s+[^"';]*?from\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function specifiers(source) {
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

const seen = new Set();
const reachable = new Set();

function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  if (file.startsWith(path.join(ROOT, "src"))) reachable.add(file);

  const source = fs.readFileSync(file, "utf8");
  for (const raw of specifiers(source)) {
    // Bare specifiers ("three", "three/addons/...") are the import map's job.
    if (!raw.startsWith(".") && !raw.startsWith("/")) continue;

    const from = path.relative(ROOT, file);
    if (raw.includes("?")) {
      problems.push(
        `${from}\n    imports "${raw}"\n    -> a module specifier must not carry a ?query. It forks module `
        + `identity, defeats the import map, and fails silently when the string drifts.`
      );
    }
    const target = path.resolve(path.dirname(file), raw.split("?")[0]);
    if (!fs.existsSync(target)) {
      problems.push(`${from}\n    imports "${raw}"\n    -> no such file: ${path.relative(ROOT, target)}`);
      continue;
    }
    if (/\.(mjs|js)$/.test(target)) walk(target);
  }
}

// 1. Entry points: index.html's module script, plus the import map itself.
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

for (const match of html.matchAll(/entry\.src\s*=\s*["']([^"']+)["']/g)) {
  const entry = path.resolve(ROOT, match[1].split("?")[0]);
  if (!fs.existsSync(entry)) {
    problems.push(`index.html\n    entry script "${match[1]}"\n    -> no such file`);
  } else {
    walk(entry);
  }
}

for (const match of html.matchAll(/["'](\.\/src\/[^"']+)["']\s*:/g)) {
  const key = match[1];
  const target = path.resolve(ROOT, key.split("?")[0]);
  problems.push(
    `index.html\n    import map aliases "${key}"\n    -> local modules must not be aliased in the import map. `
    + `A build-less project has no bundler to flag a stale specifier`
    + `${fs.existsSync(target) ? "" : ", and this one no longer resolves"}.`
  );
}

// 2. Test pages are entry points too, so a stub gap shows up here as well.
const testDir = path.join(ROOT, "tools/test");
for (const name of fs.readdirSync(testDir)) {
  if (!name.endsWith(".test.html")) continue;
  const source = fs.readFileSync(path.join(testDir, name), "utf8");
  for (const raw of specifiers(source)) {
    if (!raw.startsWith(".")) continue;
    const target = path.resolve(testDir, raw.split("?")[0]);
    if (!fs.existsSync(target)) {
      problems.push(`tools/test/${name}\n    imports "${raw}"\n    -> no such file`);
    } else if (/\.(mjs|js)$/.test(target)) {
      walk(target);
    }
  }
}

// 3. Orphans under src/.
function everyModule(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return everyModule(full);
    return /\.(mjs|js)$/.test(entry.name) ? [full] : [];
  });
}
for (const file of everyModule(path.join(ROOT, "src"))) {
  if (!reachable.has(file)) warnings.push(`orphan: ${path.relative(ROOT, file)} is imported by nothing`);
}

for (const warning of warnings) console.log(`!  ${warning}`);
if (problems.length) {
  console.error(`\n${problems.length} module-graph problem(s):\n`);
  for (const problem of problems) console.error(`x  ${problem}\n`);
  process.exit(1);
}
console.log(`\nmodule graph ok — ${seen.size} modules reachable, ${warnings.length} orphan(s)`);
