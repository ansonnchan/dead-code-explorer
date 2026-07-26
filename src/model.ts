import type { Project, SourceFile } from "ts-morph";

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "variable"
  | "interface"
  | "type"
  | "enum";

export interface FileNode {
  id: string;
  path: string;
  imports: Set<string>;
  importedBy: Set<string>;
  exportedSymbols: Set<string>;
  isEntryPoint: boolean;
  containsDynamicImport: boolean;
}

export interface SymbolNode {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  start: number;
  end: number;
  isExported: boolean;
  isPublicPackageExport: boolean;
  referenceIds: Set<string>;
  usageReferences: number;
  declarationText: string;
  inlineIgnored: boolean;
}

export interface RepositoryIndex {
  files: Map<string, FileNode>;
  symbols: Map<string, SymbolNode>;
  symbolsByFile: Map<string, Set<string>>;
  symbolReferences: Map<string, Set<string>>;
}

export type Confidence = "low" | "medium" | "high";
export type FindingKind =
  | "unreachable-file"
  | "unused-export"
  | "unused-type"
  | "unused-local";

export type RiskCategory =
  | "dynamic-import"
  | "public-api"
  | "framework-convention"
  | "preserved"
  | "inline-suppression";

export interface Finding {
  id: string;
  kind: FindingKind;
  name: string;
  filePath: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  start: number;
  end: number;
  confidence: Confidence;
  score: number;
  evidence: string[];
  risks: RiskCategory[];
  ignored: boolean;
  ignoredReason?: string;
}

export interface ScanMetrics {
  filesAnalyzed: number;
  symbolsIndexed: number;
  graphEdges: number;
  durationMs: number;
}

export interface ScanResult {
  index: RepositoryIndex;
  findings: Finding[];
  ignoredFindings: Finding[];
  entryPoints: string[];
  inferredEntryPoints: boolean;
  warnings: string[];
  metrics: ScanMetrics;
}

export interface ProjectContext {
  project: Project;
  rootPath: string;
  tsconfigPath: string;
  sourceFiles: SourceFile[];
  relativePathBySource: Map<SourceFile, string>;
  sourceOffsetBySource: Map<
    SourceFile,
    { characterOffset: number; lineOffset: number }
  >;
}

export interface ExplorerConfig {
  entryPoints: string[];
  exclude: string[];
  preserve: string[];
  includeTypeOnlySymbols: boolean;
  minimumConfidence: Confidence;
  scanOnSave: boolean;
}
