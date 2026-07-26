import * as fs from "node:fs";
import * as path from "node:path";
import { Project } from "ts-morph";
import type { ExplorerConfig, ProjectContext } from "../model";
import { isSourceFilePath, matchesAny, relativePath } from "./paths";

export function loadProject(
  rootPath: string,
  config: ExplorerConfig
): { project: Project; context: ProjectContext } {
  const tsconfigPath = path.join(rootPath, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error(
      `No tsconfig.json was found at the workspace root: ${rootPath}`
    );
  }

  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: false
  });

  const relativePathBySource = new Map();
  const sourceOffsetBySource = new Map<
    import("ts-morph").SourceFile,
    { characterOffset: number; lineOffset: number }
  >();
  const sourceFiles = project.getSourceFiles().filter((sourceFile) => {
    const filePath = sourceFile.getFilePath();
    const relative = relativePath(rootPath, filePath);
    const insideWorkspace =
      relative !== "" &&
      relative !== ".." &&
      !relative.startsWith("../") &&
      !path.isAbsolute(relative);
    const included =
      insideWorkspace &&
      isSourceFilePath(filePath) &&
      !matchesAny(relative, config.exclude);

    if (included) {
      relativePathBySource.set(sourceFile, relative);
      sourceOffsetBySource.set(sourceFile, {
        characterOffset: 0,
        lineOffset: 0
      });
    }
    return included;
  });

  for (const vuePath of findVueFiles(rootPath, config)) {
    const source = extractVueScript(fs.readFileSync(vuePath, "utf8"));
    if (!source) {
      continue;
    }
    const virtualSource = project.createSourceFile(
      `${vuePath}.${source.language}`,
      source.text,
      { overwrite: true }
    );
    sourceFiles.push(virtualSource);
    relativePathBySource.set(
      virtualSource,
      relativePath(rootPath, vuePath)
    );
    sourceOffsetBySource.set(virtualSource, {
      characterOffset: source.characterOffset,
      lineOffset: source.lineOffset
    });
  }

  return {
    project,
    context: {
      project,
      rootPath,
      tsconfigPath,
      sourceFiles,
      relativePathBySource,
      sourceOffsetBySource
    }
  };
}

function findVueFiles(
  rootPath: string,
  config: ExplorerConfig
): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relative = relativePath(rootPath, absolutePath);
      if (entry.isDirectory()) {
        if (!matchesAny(`${relative}/placeholder`, config.exclude)) {
          visit(absolutePath);
        }
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".vue") &&
        !matchesAny(relative, config.exclude)
      ) {
        result.push(absolutePath);
      }
    }
  };
  visit(rootPath);
  return result;
}

function extractVueScript(
  contents: string
):
  | {
      text: string;
      language: "ts" | "js";
      characterOffset: number;
      lineOffset: number;
    }
  | undefined {
  const opening = /<script\b([^>]*)>/i.exec(contents);
  if (!opening || opening.index === undefined) {
    return undefined;
  }
  const contentStart = opening.index + opening[0].length;
  const closingIndex = contents.indexOf("</script>", contentStart);
  if (closingIndex < 0 || /\bsrc\s*=/.test(opening[1])) {
    return undefined;
  }
  const before = contents.slice(0, contentStart);
  return {
    text: contents.slice(contentStart, closingIndex),
    language: /\blang\s*=\s*["']ts["']/i.test(opening[1]) ? "ts" : "js",
    characterOffset: contentStart,
    lineOffset: (before.match(/\n/g) ?? []).length
  };
}
