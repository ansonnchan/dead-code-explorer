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
    }
    return included;
  });

  return {
    project,
    context: {
      project,
      rootPath,
      tsconfigPath,
      sourceFiles,
      relativePathBySource
    }
  };
}
