import * as fs from "node:fs";
import * as path from "node:path";
import {
  Node,
  SyntaxKind,
  ts,
  type Identifier,
  type SourceFile,
  type Symbol as MorphSymbol,
  type VariableDeclaration
} from "ts-morph";
import type {
  ExplorerConfig,
  ProjectContext,
  RepositoryIndex,
  SymbolKind,
  SymbolNode
} from "../model";
import { relativePath } from "./paths";

interface Candidate {
  declaration: Node;
  nameNode: Identifier;
  name: string;
  kind: SymbolKind;
}

export function indexSymbols(
  index: RepositoryIndex,
  context: ProjectContext,
  config: ExplorerConfig
): void {
  const publicFiles = findPublicPackageFiles(context.rootPath);
  const symbolIdsByCompilerSymbol = new Map<ts.Symbol, Set<string>>();
  const declarationNameKeys = new Set<string>();

  for (const sourceFile of context.sourceFiles) {
    const filePath = context.relativePathBySource.get(sourceFile)!;
    const exportedDeclarationKeys = getExportedDeclarationKeys(
      sourceFile,
      context
    );
    const symbolIds = new Set<string>();

    for (const candidate of collectCandidates(sourceFile, config)) {
      const { declaration, nameNode, name, kind } = candidate;
      const sourceOffset = context.sourceOffsetBySource.get(sourceFile) ?? {
        characterOffset: 0,
        lineOffset: 0
      };
      const start = declaration.getStart() + sourceOffset.characterOffset;
      const startLine =
        declaration.getStartLineNumber() + sourceOffset.lineOffset;
      const id = `${filePath}:${startLine}:${kind}:${start}`;
      const isExported = exportedDeclarationKeys.has(
        declarationKey(filePath, declaration)
      );
      const referenceIds = new Set<string>();

      const symbol: SymbolNode = {
        id,
        name,
        kind,
        filePath,
        startLine,
        endLine: declaration.getEndLineNumber() + sourceOffset.lineOffset,
        start,
        end: declaration.getEnd() + sourceOffset.characterOffset,
        isExported,
        isPublicPackageExport: isExported && publicFiles.has(filePath),
        referenceIds,
        usageReferences: 0,
        declarationText: declaration.getText().slice(0, 200),
        inlineIgnored: hasInlineSuppression(declaration)
      };

      index.symbols.set(id, symbol);
      index.symbolReferences.set(id, referenceIds);
      symbolIds.add(id);
      if (isExported) {
        index.files.get(filePath)?.exportedSymbols.add(id);
      }

      const compilerSymbol = resolveCompilerSymbol(nameNode.getSymbol());
      if (compilerSymbol) {
        const ids = symbolIdsByCompilerSymbol.get(compilerSymbol) ?? new Set();
        ids.add(id);
        symbolIdsByCompilerSymbol.set(compilerSymbol, ids);
      }
      declarationNameKeys.add(nodeKey(filePath, nameNode));
    }
    index.symbolsByFile.set(filePath, symbolIds);
  }

  indexReferences(
    index,
    context,
    symbolIdsByCompilerSymbol,
    declarationNameKeys
  );
}

function collectCandidates(
  sourceFile: SourceFile,
  config: ExplorerConfig
): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const add = (
    declaration: Node,
    nameNode: Node | undefined,
    kind: SymbolKind
  ) => {
    if (!nameNode || !Node.isIdentifier(nameNode)) {
      return;
    }
    const key = `${declaration.getStart()}:${kind}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      declaration,
      nameNode,
      name: nameNode.getText(),
      kind
    });
  };

  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.FunctionDeclaration
  )) {
    add(declaration, declaration.getNameNode(), "function");
  }
  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.ClassDeclaration
  )) {
    add(declaration, declaration.getNameNode(), "class");
  }
  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.MethodDeclaration
  )) {
    add(declaration, declaration.getNameNode(), "method");
  }
  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.VariableDeclaration
  )) {
    addVariableCandidate(add, declaration);
  }
  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.EnumDeclaration
  )) {
    add(declaration, declaration.getNameNode(), "enum");
  }

  if (config.includeTypeOnlySymbols) {
    for (const declaration of sourceFile.getDescendantsOfKind(
      SyntaxKind.InterfaceDeclaration
    )) {
      add(declaration, declaration.getNameNode(), "interface");
    }
    for (const declaration of sourceFile.getDescendantsOfKind(
      SyntaxKind.TypeAliasDeclaration
    )) {
      add(declaration, declaration.getNameNode(), "type");
    }
  }

  return candidates;
}

function addVariableCandidate(
  add: (declaration: Node, nameNode: Node | undefined, kind: SymbolKind) => void,
  declaration: VariableDeclaration
): void {
  add(declaration, declaration.getNameNode(), "variable");
}

function getExportedDeclarationKeys(
  sourceFile: SourceFile,
  context: ProjectContext
): Set<string> {
  const result = new Set<string>();
  for (const declarations of sourceFile.getExportedDeclarations().values()) {
    for (const declaration of declarations) {
      const declarationSource = declaration.getSourceFile();
      const filePath =
        context.relativePathBySource.get(declarationSource) ??
        relativePath(context.rootPath, declarationSource.getFilePath());
      if (filePath === context.relativePathBySource.get(sourceFile)) {
        result.add(declarationKey(filePath, declaration));
      }
    }
  }
  return result;
}

function declarationKey(filePath: string, declaration: Node): string {
  return `${filePath}:${declaration.getStart()}`;
}

function indexReferences(
  index: RepositoryIndex,
  context: ProjectContext,
  symbolIdsByCompilerSymbol: Map<ts.Symbol, Set<string>>,
  declarationNameKeys: Set<string>
): void {
  for (const sourceFile of context.sourceFiles) {
    const filePath = context.relativePathBySource.get(sourceFile)!;
    for (const identifier of sourceFile.getDescendantsOfKind(
      SyntaxKind.Identifier
    )) {
      if (declarationNameKeys.has(nodeKey(filePath, identifier))) {
        continue;
      }
      const compilerSymbol = resolveCompilerSymbol(identifier.getSymbol());
      if (!compilerSymbol) {
        continue;
      }
      const matchingIds = symbolIdsByCompilerSymbol.get(compilerSymbol);
      if (!matchingIds) {
        continue;
      }
      const sourceOffset = context.sourceOffsetBySource.get(sourceFile) ?? {
        characterOffset: 0,
        lineOffset: 0
      };
      const referenceId = `${filePath}:${identifier.getStartLineNumber() + sourceOffset.lineOffset}:${identifier.getStart() + sourceOffset.characterOffset}`;
      const isPassThrough = isImportOrReExportReference(identifier);
      for (const symbolId of matchingIds) {
        const symbol = index.symbols.get(symbolId);
        if (!symbol) {
          continue;
        }
        symbol.referenceIds.add(referenceId);
        index.symbolReferences.get(symbolId)?.add(referenceId);
        if (!isPassThrough) {
          symbol.usageReferences += 1;
        }
      }
    }
  }
}

function isImportOrReExportReference(reference: Node): boolean {
  if (
    reference.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ||
    reference.getFirstAncestorByKind(SyntaxKind.ExportDeclaration)
  ) {
    return true;
  }
  return Node.isExportAssignment(reference.getParent());
}

function resolveCompilerSymbol(
  symbol: MorphSymbol | undefined
): ts.Symbol | undefined {
  if (!symbol) {
    return undefined;
  }
  let current = symbol;
  const seen = new Set<ts.Symbol>();
  while (
    (current.getFlags() & ts.SymbolFlags.Alias) !== 0 &&
    !seen.has(current.compilerSymbol)
  ) {
    seen.add(current.compilerSymbol);
    const aliased = current.getAliasedSymbol();
    if (!aliased) {
      break;
    }
    current = aliased;
  }
  return current.compilerSymbol;
}

function nodeKey(filePath: string, node: Node): string {
  return `${filePath}:${node.getStart()}`;
}

function hasInlineSuppression(declaration: Node): boolean {
  const sourceText = declaration.getSourceFile().getFullText();
  const prefix = sourceText.slice(
    Math.max(0, declaration.getFullStart() - 240),
    declaration.getStart()
  );
  return /\/\/\s*dead-code-explorer-ignore\s*(?:\r?\n)?\s*$/.test(prefix);
}

function findPublicPackageFiles(rootPath: string): Set<string> {
  const packagePath = path.join(rootPath, "package.json");
  if (!fs.existsSync(packagePath)) {
    return new Set();
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
      main?: unknown;
      module?: unknown;
      types?: unknown;
      exports?: unknown;
    };
    const targets = new Set<string>();
    collectPackageTargets(packageJson.main, targets);
    collectPackageTargets(packageJson.module, targets);
    collectPackageTargets(packageJson.types, targets);
    collectPackageTargets(packageJson.exports, targets);
    return new Set(
      [...targets].map((target) =>
        target.replace(/^\.\//, "").replace(/\.(?:m?js|cjs|d\.ts)$/, ".ts")
      )
    );
  } catch {
    return new Set();
  }
}

function collectPackageTargets(value: unknown, targets: Set<string>): void {
  if (typeof value === "string") {
    targets.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPackageTargets(item, targets);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectPackageTargets(item, targets);
    }
  }
}
