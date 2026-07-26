import type {
  ExplorerConfig,
  Finding,
  RepositoryIndex,
  RiskCategory,
  SymbolNode
} from "../model";
import { matchesAny } from "./paths";
import { scoreToConfidence } from "./confidence";

const FRAMEWORK_PATTERNS = [
  "**/pages/**",
  "**/routes/**",
  "**/*.stories.*",
  "**/migrations/**",
  "**/commands/**"
];

export function createFindings(
  index: RepositoryIndex,
  reachable: Set<string>,
  config: ExplorerConfig,
  ignoredIds: Set<string>
): { findings: Finding[]; ignoredFindings: Finding[] } {
  const findings: Finding[] = [];
  const ignoredFindings: Finding[] = [];
  const hasDynamicImport = [...index.files.values()].some(
    (file) => file.containsDynamicImport
  );

  for (const file of index.files.values()) {
    if (file.isEntryPoint || reachable.has(file.path)) {
      continue;
    }
    const evidence = ["File is not reachable from any configured entry point."];
    let score = 3;
    if (file.importedBy.size === 0) {
      score += 2;
      evidence.push("No static imports of this file were found.");
    }
    score += 1;
    evidence.push("The file is not a configured entry point.");
    const risks: RiskCategory[] = [];
    score = applyRepositoryRisks(score, file.path, hasDynamicImport, risks, evidence);

    storeFinding(
      {
        id: `file:${file.path}`,
        kind: "unreachable-file",
        name: file.path.split("/").at(-1) ?? file.path,
        filePath: file.path,
        relativePath: file.path,
        startLine: 1,
        endLine: 1,
        start: 0,
        end: 0,
        confidence: scoreToConfidence(score),
        score,
        evidence,
        risks,
        ignored: false
      },
      config,
      ignoredIds,
      findings,
      ignoredFindings
    );
  }

  for (const symbol of index.symbols.values()) {
    if (symbol.usageReferences > 0) {
      continue;
    }
    const evidence = [
      `No static usage references were found for this ${symbol.kind}.`
    ];
    let score = 3;
    const file = index.files.get(symbol.filePath);
    if (file && !reachable.has(file.path)) {
      score += 3;
      evidence.push("Its file is unreachable from configured entry points.");
    }
    if (!symbol.isExported) {
      score += 1;
      evidence.push("The symbol is not publicly exported from its file.");
    }
    const risks: RiskCategory[] = [];
    if (symbol.isPublicPackageExport) {
      score -= 3;
      risks.push("public-api");
      evidence.push(
        "It is exported from a package entry, so external consumers may use it."
      );
    }
    score = applyRepositoryRisks(
      score,
      symbol.filePath,
      hasDynamicImport,
      risks,
      evidence
    );

    const finding = symbolFinding(symbol, score, evidence, risks);
    storeFinding(
      finding,
      config,
      ignoredIds,
      findings,
      ignoredFindings
    );
  }

  return {
    findings: findings.sort(compareFindings),
    ignoredFindings: ignoredFindings.sort(compareFindings)
  };
}

function symbolFinding(
  symbol: SymbolNode,
  score: number,
  evidence: string[],
  risks: RiskCategory[]
): Finding {
  const typeOnly = symbol.kind === "type" || symbol.kind === "interface";
  return {
    id: `symbol:${symbol.id}`,
    kind: symbol.isExported
      ? typeOnly
        ? "unused-type"
        : "unused-export"
      : typeOnly
        ? "unused-type"
        : "unused-local",
    name: symbol.name,
    filePath: symbol.filePath,
    relativePath: symbol.filePath,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    start: symbol.start,
    end: symbol.end,
    confidence: scoreToConfidence(score),
    score,
    evidence,
    risks,
    ignored: symbol.inlineIgnored,
    ignoredReason: symbol.inlineIgnored
      ? "Inline dead-code-explorer-ignore suppression"
      : undefined
  };
}

function applyRepositoryRisks(
  initialScore: number,
  filePath: string,
  hasDynamicImport: boolean,
  risks: RiskCategory[],
  evidence: string[]
): number {
  let score = initialScore;
  if (hasDynamicImport) {
    score -= 3;
    risks.push("dynamic-import");
    evidence.push(
      "A non-static dynamic import exists in the repository and may hide references."
    );
  }
  if (matchesAny(filePath, FRAMEWORK_PATTERNS)) {
    score -= 2;
    risks.push("framework-convention");
    evidence.push(
      "The file matches a convention commonly discovered by frameworks or tooling."
    );
  }
  return score;
}

function storeFinding(
  finding: Finding,
  config: ExplorerConfig,
  ignoredIds: Set<string>,
  active: Finding[],
  ignored: Finding[]
): void {
  if (matchesAny(finding.filePath, config.preserve)) {
    finding.ignored = true;
    finding.ignoredReason = "Matched deadCodeExplorer.preserve";
    finding.risks.push("preserved");
  } else if (ignoredIds.has(finding.id)) {
    finding.ignored = true;
    finding.ignoredReason = "Ignored from the Dead Code Explorer sidebar";
  }

  if (finding.ignored) {
    ignored.push(finding);
  } else {
    active.push(finding);
  }
}

function compareFindings(left: Finding, right: Finding): number {
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  return (
    confidenceRank[left.confidence] - confidenceRank[right.confidence] ||
    left.filePath.localeCompare(right.filePath) ||
    left.startLine - right.startLine
  );
}
