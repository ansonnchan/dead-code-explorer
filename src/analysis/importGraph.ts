import {
  Node,
  SyntaxKind,
  ts,
  type CallExpression,
  type SourceFile
} from "ts-morph";
import type {
  ExplorerConfig,
  FileNode,
  ProjectContext,
  RepositoryIndex
} from "../model";
import { matchesAny, relativePath } from "./paths";

export interface EntryPointResolution {
  entryPoints: string[];
  inferred: boolean;
  warnings: string[];
}

const DEFAULT_ENTRY_POINTS = [
  "src/index.ts",
  "src/index.tsx",
  "src/main.ts",
  "src/main.tsx",
  "src/server.ts"
];

export function resolveEntryPoints(
  context: ProjectContext,
  config: ExplorerConfig
): EntryPointResolution {
  const available = new Set(context.relativePathBySource.values());
  const requested =
    config.entryPoints.length > 0
      ? config.entryPoints
      : DEFAULT_ENTRY_POINTS.filter((candidate) => available.has(candidate));
  const entryPoints = requested.filter((candidate) => available.has(candidate));
  const missing = requested.filter((candidate) => !available.has(candidate));
  const inferred = config.entryPoints.length === 0;
  const warnings: string[] = [];

  if (inferred && entryPoints.length > 0) {
    warnings.push(
      `Entry points were inferred: ${entryPoints.join(", ")}. Configure them before relying on reachability results.`
    );
  }
  if (inferred && entryPoints.length === 0) {
    warnings.push(
      "No common entry point could be inferred. Configure deadCodeExplorer.entryPoints to enable meaningful reachability analysis."
    );
  }
  if (missing.length > 0) {
    warnings.push(`Configured entry points were not found: ${missing.join(", ")}`);
  }

  return { entryPoints, inferred, warnings };
}

export function buildImportGraph(
  context: ProjectContext,
  entryPoints: string[]
): RepositoryIndex {
  const files = new Map<string, FileNode>();
  const knownFiles = new Set(context.relativePathBySource.values());
  const entrySet = new Set(entryPoints);

  for (const sourceFile of context.sourceFiles) {
    const filePath = context.relativePathBySource.get(sourceFile)!;
    files.set(filePath, {
      id: filePath,
      path: filePath,
      imports: new Set(),
      importedBy: new Set(),
      exportedSymbols: new Set(),
      isEntryPoint: entrySet.has(filePath),
      containsDynamicImport: containsNonStaticDynamicImport(sourceFile)
    });
  }

  for (const sourceFile of context.sourceFiles) {
    const fromPath = context.relativePathBySource.get(sourceFile)!;
    const from = files.get(fromPath)!;
    const moduleDeclarations = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations()
    ];

    for (const declaration of moduleDeclarations) {
      const target = declaration.getModuleSpecifierSourceFile();
      if (!target) {
        continue;
      }
      const targetPath =
        context.relativePathBySource.get(target) ??
        relativePath(context.rootPath, target.getFilePath());
      if (knownFiles.has(targetPath) && targetPath !== fromPath) {
        from.imports.add(targetPath);
      }
    }

    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    )) {
      const dynamicTarget = resolveStaticDynamicImport(call, context);
      if (dynamicTarget && knownFiles.has(dynamicTarget)) {
        from.imports.add(dynamicTarget);
      }
    }
  }

  for (const file of files.values()) {
    for (const importedPath of file.imports) {
      files.get(importedPath)?.importedBy.add(file.path);
    }
  }

  return {
    files,
    symbols: new Map(),
    symbolsByFile: new Map(),
    symbolReferences: new Map(),
    symbolEdges: new Map(),
    topLevelSymbolReferences: new Map()
  };
}

export function findReachableFiles(
  files: Map<string, FileNode>,
  entryPoints: string[]
): Set<string> {
  const reachable = new Set<string>();
  const queue = entryPoints.filter((entryPoint) => files.has(entryPoint));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    for (const imported of files.get(current)?.imports ?? []) {
      if (!reachable.has(imported)) {
        queue.push(imported);
      }
    }
  }

  return reachable;
}

export function isPreserved(
  relativeFilePath: string,
  config: ExplorerConfig
): boolean {
  return matchesAny(relativeFilePath, config.preserve);
}

function containsNonStaticDynamicImport(sourceFile: SourceFile): boolean {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((call) => {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
        return false;
      }
      const argument = call.getArguments()[0];
      return (
        !argument ||
        (!Node.isStringLiteral(argument) &&
          !Node.isNoSubstitutionTemplateLiteral(argument))
      );
    });
}

function resolveStaticDynamicImport(
  call: CallExpression,
  context: ProjectContext
): string | undefined {
  if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
    return undefined;
  }
  const argument = call.getArguments()[0];
  if (
    !argument ||
    (!Node.isStringLiteral(argument) &&
      !Node.isNoSubstitutionTemplateLiteral(argument))
  ) {
    return undefined;
  }

  const resolved = ts.resolveModuleName(
    argument.getLiteralValue(),
    call.getSourceFile().getFilePath(),
    context.project.getCompilerOptions(),
    ts.sys
  ).resolvedModule;
  if (!resolved) {
    return undefined;
  }
  return relativePath(context.rootPath, resolved.resolvedFileName);
}
