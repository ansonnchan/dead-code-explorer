import * as path from "node:path";
import { minimatch } from "minimatch";

export function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/").replaceAll(path.sep, "/");
}

export function relativePath(rootPath: string, filePath: string): string {
  return toPosixPath(path.relative(rootPath, filePath));
}

export function matchesAny(relativeFilePath: string, patterns: string[]): boolean {
  const normalized = toPosixPath(relativeFilePath).replace(/^\.\//, "");
  return patterns.some((pattern) =>
    minimatch(normalized, toPosixPath(pattern).replace(/^\.\//, ""), {
      dot: true,
      matchBase: false
    })
  );
}

export function isSourceFilePath(filePath: string): boolean {
  return (
    /\.(?:[cm]?[jt]sx?)$/i.test(filePath) &&
    !/\.d\.[cm]?ts$/i.test(filePath)
  );
}
