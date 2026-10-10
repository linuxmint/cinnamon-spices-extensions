// The documentation check, run by `tools/check.sh docs` over
// docs/contributing/. It fails on what is not a matter of judgement, and
// reports what is:
//
// - Every relative link resolves, and every path in a code span that names
//   a file or folder of the repository exists, unless an example in the
//   same guide creates it.
// - Every example compiles and its tests pass. A fenced block that follows
//   a line `<!-- example: <path> -->` is written to that path in a copy of
//   the repository made for the check; a `json` block that follows
//   `<!-- example-merge: <path> -->` adds its keys to that JSON file there.
//   The copy is then type-checked, and each example test is run.
// - Headings deeper than three levels are reported, since a guide that
//   needs them wants splitting; they fail nothing.

import { execFileSync } from "node:child_process";
import {
    cpSync,
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
    mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const guides = join(root, "docs", "contributing");
const failures = [];
const reports = [];

/** The examples a guide carries, in the order they appear. */
function examplesIn(text) {
    const found = [];
    const marker = /<!-- (example|example-merge): (\S+) -->\s*\n```\w*\n([\s\S]*?)\n```/g;
    for (const match of text.matchAll(marker)) {
        found.push({ kind: match[1], path: match[2], body: match[3] });
    }
    return found;
}

function checkReferences(file, text, created) {
    const name = relative(root, file);
    text.split("\n").forEach((line, index) => {
        const where = `${name}:${index + 1}`;
        if (/^#{4,} /.test(line)) {
            reports.push(`${where}: a heading deeper than three levels`);
        }
        for (const link of line.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
            const target = link[1];
            if (/^[a-z]+:/.test(target)) {
                continue;
            }
            if (!existsSync(resolve(dirname(file), target))) {
                failures.push(`${where}: the link to ${target} leads nowhere`);
            }
        }
        for (const span of line.matchAll(/`((?:src|tests|tools|types|docs)\/[\w./@-]*)`/g)) {
            const path = span[1];
            if (!created.has(path) && !existsSync(join(root, path))) {
                failures.push(`${where}: ${path} is not in the repository`);
            }
        }
    });
}

/** A copy of what the examples build on, with the dependencies linked. */
function copyOfTheTree() {
    const copy = mkdtempSync(join(tmpdir(), "cplace-docs-"));
    for (const part of ["src", "tests", "types", "tsconfig.json"]) {
        cpSync(join(root, part), join(copy, part), { recursive: true });
    }
    symlinkSync(join(root, "node_modules"), join(copy, "node_modules"));
    return copy;
}

function run(command, args, cwd) {
    try {
        execFileSync(command, args, { cwd, stdio: "pipe" });
        return null;
    } catch (error) {
        return `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    }
}

function checkExamples(examples) {
    if (examples.length === 0) {
        return;
    }
    const copy = copyOfTheTree();
    try {
        const tests = [];
        for (const example of examples) {
            const target = join(copy, example.path);
            mkdirSync(dirname(target), { recursive: true });
            if (example.kind === "example-merge") {
                const merged = {
                    ...JSON.parse(readFileSync(target, "utf8")),
                    ...JSON.parse(example.body),
                };
                writeFileSync(target, `${JSON.stringify(merged, null, 4)}\n`);
            } else {
                writeFileSync(target, `${example.body}\n`);
                if (/^tests\/.*\.test\.ts$/.test(example.path)) {
                    tests.push(example.path);
                }
            }
        }
        const bin = join(copy, "node_modules", ".bin");
        const typed = run(join(bin, "tsc"), ["--noEmit", "-p", copy], copy);
        if (typed !== null) {
            failures.push(`the examples do not type-check:\n${typed}`);
            return;
        }
        for (const test of tests) {
            const out = join(copy, "build", test.replace(/\.ts$/, ".cjs"));
            const bundled = run(
                join(bin, "esbuild"),
                [test, "--bundle", "--platform=node", "--format=cjs",
                    "--target=es2022", `--outfile=${out}`, "--log-level=warning"],
                copy,
            );
            const passed = bundled ?? run("node", ["--test", out], copy);
            if (passed !== null) {
                failures.push(`the example test ${test} fails:\n${passed}`);
            }
        }
    } finally {
        rmSync(copy, { recursive: true, force: true });
    }
}

const files = existsSync(guides)
    ? readdirSync(guides)
          .filter((name) => name.endsWith(".md"))
          .map((name) => join(guides, name))
    : [];
const examples = [];
for (const file of files) {
    const text = readFileSync(file, "utf8");
    const own = examplesIn(text);
    examples.push(...own);
    checkReferences(file, text, new Set(own.map((example) => example.path)));
}
checkExamples(examples);

for (const line of reports) {
    console.log(`report: ${line}`);
}
for (const line of failures) {
    console.error(`fail: ${line}`);
}
console.log(
    `docs: ${files.length} guide(s), ${examples.length} example block(s), ` +
        `${failures.length} failure(s), ${reports.length} report(s)`,
);
process.exit(failures.length > 0 ? 1 : 0);
