# Dead Code Explorer

Dead Code Explorer is a local-first VS Code extension that finds potentially
unused TypeScript, JavaScript, and Vue script-block code. It uses the
TypeScript compiler through `ts-morph`; source code never leaves the machine
and no backend, network service, or AI model is involved.

Its core distinction is symbol-level analysis. A file being imported does not
prove that every export in that file is used, so the scanner builds both:

- a file import graph for entry-point reachability; and
- a symbol/reference index that follows TypeScript aliases through barrel
  re-exports.

Every result includes evidence, a confidence score, and known static-analysis
risks. A result is never a claim that code is safe to delete.

## Run the extension

Requirements: Node.js 20 or newer and VS Code 1.95 or newer.

```sh
npm install
npm run build
```

Open this folder in VS Code and press `F5` to start an Extension Development
Host. In the new window, open a single-root TypeScript or JavaScript project whose
`tsconfig.json` is at the workspace root. Run:

`Dead Code Explorer: Scan Workspace`

The activity bar contains the Dead Code Explorer view. A scan shows file,
symbol, edge, and duration metrics followed by:

- Unused Files
- Unused Exports
- Unused Types
- Unused Local Symbols
- Ignored Findings

Select a finding to open and highlight its declaration and show the evidence
panel. Flagged declarations also receive an editor decoration and CodeLens
actions.

## Configuration

```json
{
  "deadCodeExplorer.entryPoints": ["src/index.ts", "src/worker.ts"],
  "deadCodeExplorer.exclude": [
    "**/*.generated.ts",
    "**/migrations/**",
    "**/*.stories.tsx"
  ],
  "deadCodeExplorer.preserve": ["src/public-api.ts", "src/plugins/**"],
  "deadCodeExplorer.includeTypeOnlySymbols": true,
  "deadCodeExplorer.minimumConfidence": "medium",
  "deadCodeExplorer.scanOnSave": true
}
```

When `entryPoints` is empty, the scanner looks for common entry files such as
`src/index.ts`, `src/main.ts`, and `src/server.ts`. Inferred entries are shown
as a warning in the sidebar and are never silently trusted.

Add this comment immediately above a declaration to suppress it:

```ts
// dead-code-explorer-ignore
export function discoveredByMetadata() {}
```

The **Ignore** action persists a finding ID in VS Code workspace state.
Preserved and inline-suppressed results remain inspectable in Ignored Findings.

## Commands

- `Dead Code Explorer: Scan Workspace`
- `Dead Code Explorer: Rescan Current File`
- `Dead Code Explorer: Configure Entry Points`
- `Dead Code Explorer: Ignore Finding`
- `Dead Code Explorer: Clear Analysis Cache`

V1 uses a full project rescan for both manual and save-triggered rescans.

## Confidence model

The initial evidence weights are:

| Signal | Weight |
| --- | ---: |
| No symbol references found | +3 |
| File unreachable from entry points | +3 |
| No imports found | +2 |
| Not publicly exported | +1 |
| Non-static dynamic import in repository | -3 |
| Symbol is a public package export | -3 |
| Framework-managed convention | -2 |

Scores of 5 or more are High, 2–4 are Medium, and lower scores are Low.
Dynamic imports, public package APIs, and convention-driven files are called
out in the evidence panel.

## Test and demo

```sh
npm test
npm run build
```

The `fixtures/` directory contains known-answer projects for relative imports,
path aliases, barrel exports, dynamic imports, public package APIs,
JavaScript/JSDoc, and Vue single-file components.

Generate and scan a known-ground-truth repository with:

```sh
npm run verify:correctness
```

The checked-in [correctness report](benchmarks/v1-correctness.json) records the
actual finding count, false positives, false negatives, precision, recall, LOC,
and scan duration. A perfect score proves the generated distribution and
tested semantics; it does not prove all real-world repositories.

Run the reproducible synthetic performance checkpoints with:

```sh
npm run perf
```

The script records full-scan duration and heap growth for 100, 1,000, and
5,000-file repositories. On the development machine, the 1,001-file fixture
completed in about 0.3 seconds and the 5,001-file fixture in about 3.6 seconds;
results vary by hardware and Node.js version.

A one-minute demo:

1. Open `fixtures/simple-project` in the Extension Development Host.
2. Scan the workspace and expand **Unused Files**.
3. Select `src/orphan.ts` to see its reachability evidence.
4. Select the `unusedGreeting` export to see its reference evidence.
5. Import and call `unusedGreeting` from `src/index.ts`.
6. Save the file; after the debounced rescan, the export finding disappears.

## V1 boundaries

The scanner targets one workspace folder with one root `tsconfig.json`.
CommonJS `require`, framework-specific route discovery, monorepos, runtime
dependency injection, decorators/metadata, and arbitrary dynamic property
access are not proven by static references. Results affected by detectable
risks are deliberately downgraded.

JavaScript and JSX are analyzed when the project enables `allowJs` and includes
those files in `tsconfig.json`; JSDoc-aware projects can additionally enable
`checkJs`. Vue support extracts the first inline `<script>` or `<script setup>`
block, supports JavaScript and TypeScript, and maps declaration ranges back to
the `.vue` file. Vue template references and multiple/external script blocks
are not resolved yet, so Vue findings receive the framework-convention risk
penalty.

Python, Go, Rust, Java, and other ecosystems require language-specific
frontends for parsing, module resolution, entry-point conventions, and symbol
identity. Reusing only the UI and confidence engine is safe; pretending the
TypeScript resolver applies to those languages is not.
