/**
 * Walks the real module graph from index.html and fails on mistakes a
 * build-less ES-module project cannot otherwise catch.
 *
 * Cache-busting is allowed, but only in a deliberately narrow form:
 *
 *   - a relative import may add ?v=... (or a test-only ?smoke=... / ?test=...)
 *     as long as the pathname still resolves to the same real file;
 *   - a local import-map alias may add a query to the same pathname, but may
 *     never redirect one local module name to a different local file.
 *
 * This keeps the Safari cache workaround used by production while still
 * catching the dangerous case that originally motivated this checker: a stale
 * alias silently routing ./src/config.js to some other config file.
 *
 * What it enforces:
 *
 *   1. Every relative import resolves to a file that exists.
 *   2. Query-busted relative imports use only the approved cache/test keys.
 *   3. Local import-map aliases are self-aliases only (same pathname).
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
const APPROVED_QUERY_KEYS = new Set(["v", "smoke", "test"]);

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

function splitSpecifier(raw) {
  const question = raw.indexOf("?");
  if (question === -1) return { pathname: raw, query: "" };
  return { pathname: raw.slice(0, question), query: raw.slice(question + 1) };
}

function validateQuery(raw, from) {
  const { query } = splitSpecifier(raw);
  if (!query) return;
  const params = new URLSearchParams(query);
  const keys = [...params.keys()];
  const bad = keys.filter((key) => !APPROVED_QUERY_KEYS.has(key));
  if (bad.length) {
    problems.push(
      `${from}\n    imports "${raw}"\n    -> unsupported module query key(s): ${bad.join(", ")}. `
      + `Use only ?v= for production cache-busting or ?smoke= / ?test= in tests.`
    );
  }
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
    validateQuery(raw, from);
    const { pathname } = splitSpecifier(raw);
    const target = path.resolve(path.dirname(file), pathname);
    if (!fs.existsSync(target)) {
      problems.push(`${from}\n    imports "${raw}"\n    -> no such file: ${path.relative(ROOT, target)}`);
      continue;
    }
    if (/\.(mjs|js)$/.test(target)) walk(target);
  }
}

// 1. Entry points: index.html's module scripts, plus the import map itself.
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

for (const match of html.matchAll(/(?:entry|audio|npcTest)\.src\s*=\s*["']([^"']+)["']/g)) {
  const raw = match[1];
  validateQuery(raw, "index.html");
  const { pathname } = splitSpecifier(raw);
  const entry = path.resolve(ROOT, pathname);
  if (!fs.existsSync(entry)) {
    problems.push(`index.html\n    entry script "${raw}"\n    -> no such file`);
  } else {
    walk(entry);
  }
}

// Local module aliases are permitted only as same-path cache-bust aliases.
// Example allowed:
//   "./src/config.js": "./src/config.js?v=village3"
// Example rejected:
//   "./src/config.js": "./src/config-floating-island-tuned.js?v=..."
for (const match of html.matchAll(/["'](\.\/src\/[^"']+)["']\s*:\s*["'](\.\/src\/[^"']+)["']/g)) {
  const key = match[1];
  const value = match[2];
  const keyParts = splitSpecifier(key);
  const valueParts = splitSpecifier(value);
  const keyTarget = path.resolve(ROOT, keyParts.pathname);
  const valueTarget = path.resolve(ROOT, valueParts.pathname);

  if (!fs.existsSync(keyTarget)) {
    problems.push(`index.html\n    import map key "${key}"\n    -> no such file`);
  }
  if (!fs.existsSync(valueTarget)) {
    problems.push(`index.html\n    import map target "${value}"\n    -> no such file`);
  }
  if (keyParts.pathname !== valueParts.pathname) {
    problems.push(
      `index.html\n    import map aliases "${key}" -> "${value}"\n    -> local aliases may only add a cache query to the same pathname.`
    );
  }
  validateQuery(value, "index.html import map");
}

// 2. Test pages are entry points too, so a stub gap shows up here as well.
const testDir = path.join(ROOT, "tools/test");
for (const name of fs.readdirSync(testDir)) {
  if (!name.endsWith(".test.html")) continue;
  const source = fs.readFileSync(path.join(testDir, name), "utf8");
  for (const raw of specifiers(source)) {
    if (!raw.startsWith(".")) continue;
    validateQuery(raw, `tools/test/${name}`);
    const { pathname } = splitSpecifier(raw);
    const target = path.resolve(testDir, pathname);
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
