import type {
  ExplorerConfig,
  RepositoryIndex
} from "../model";
import { matchesAny } from "./paths";

export function findReachableSymbols(
  index: RepositoryIndex,
  reachableFiles: Set<string>,
  config: ExplorerConfig
): Set<string> {
  const reachableSymbols = new Set<string>();
  const queue: string[] = [];

  for (const filePath of reachableFiles) {
    queue.push(...(index.topLevelSymbolReferences.get(filePath) ?? []));
  }

  for (const symbol of index.symbols.values()) {
    if (
      symbol.isPublicPackageExport ||
      (symbol.isExported && matchesAny(symbol.filePath, config.preserve))
    ) {
      queue.push(symbol.id);
    }
  }

  while (queue.length > 0) {
    const symbolId = queue.shift()!;
    if (reachableSymbols.has(symbolId)) {
      continue;
    }
    reachableSymbols.add(symbolId);
    for (const dependency of index.symbolEdges.get(symbolId) ?? []) {
      if (!reachableSymbols.has(dependency)) {
        queue.push(dependency);
      }
    }
  }

  return reachableSymbols;
}
