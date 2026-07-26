import * as fs from "node:fs";
import * as path from "node:path";

export interface SyntheticRepoConfig {
  fileCount: number;
  avgLinesPerFile: number;
  avgImportsPerFile: number;
  exportDensity: number;
  reExportChainDepth: number;
  deadCodeRatio: number;
  dynamicImportRatio: number;
  packageCount?: number;
}

export interface ExpectedSyntheticFinding {
  kind: "unused-export";
  filePath: string;
  name: string;
}

export interface SyntheticGroundTruth {
  config: SyntheticRepoConfig;
  expectedFindings: ExpectedSyntheticFinding[];
  sourceFileCount: number;
  approximateLoc: number;
}

export function generateSyntheticRepository(
  rootPath: string,
  config: SyntheticRepoConfig
): SyntheticGroundTruth {
  validateConfig(config);
  fs.mkdirSync(rootPath, { recursive: true });

  const packageCount = config.packageCount ?? 1;
  const filesPerPackage = Math.ceil(config.fileCount / packageCount);
  const expectedFindings: ExpectedSyntheticFinding[] = [];
  let generatedFiles = 0;
  let approximateLoc = 0;

  if (packageCount === 1) {
    writeRootConfig(rootPath, ["src/**/*.ts"]);
    const result = generatePackage(
      rootPath,
      "src",
      "",
      config.fileCount,
      config,
      expectedFindings
    );
    generatedFiles += result.files;
    approximateLoc += result.loc;
  } else {
    const references: Array<{ path: string }> = [];
    for (let packageIndex = 0; packageIndex < packageCount; packageIndex += 1) {
      const remaining = config.fileCount - generatedFiles;
      const count = Math.min(filesPerPackage, remaining);
      if (count <= 0) {
        break;
      }
      const packageName = `package-${packageIndex}`;
      const packageRoot = path.join(rootPath, "packages", packageName);
      references.push({ path: `./packages/${packageName}` });
      writePackageConfig(packageRoot, packageIndex, packageCount);
      const result = generatePackage(
        packageRoot,
        "src",
        `packages/${packageName}/`,
        count,
        config,
        expectedFindings,
        packageIndex
      );
      generatedFiles += result.files;
      approximateLoc += result.loc;
    }
    fs.writeFileSync(
      path.join(rootPath, "tsconfig.json"),
      `${JSON.stringify({ files: [], references }, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(rootPath, "package.json"),
      `${JSON.stringify(
        {
          private: true,
          workspaces: ["packages/*"]
        },
        null,
        2
      )}\n`
    );
  }

  const truth: SyntheticGroundTruth = {
    config,
    expectedFindings: expectedFindings.sort(compareExpected),
    sourceFileCount: generatedFiles,
    approximateLoc
  };
  fs.writeFileSync(
    path.join(rootPath, "expected-findings.json"),
    `${JSON.stringify(truth, null, 2)}\n`
  );
  return truth;
}

function generatePackage(
  packageRoot: string,
  sourceDirectory: string,
  relativePrefix: string,
  fileCount: number,
  config: SyntheticRepoConfig,
  expectedFindings: ExpectedSyntheticFinding[],
  packageIndex = 0
): { files: number; loc: number } {
  const sourceRoot = path.join(packageRoot, sourceDirectory);
  fs.mkdirSync(sourceRoot, { recursive: true });
  const exportCount = Math.max(1, Math.round(config.exportDensity));
  const deadCount = Math.min(
    exportCount,
    Math.max(0, Math.round(exportCount * config.deadCodeRatio))
  );
  const liveCount = Math.max(1, exportCount - deadCount);
  let loc = 0;

  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    const lines: string[] = [];
    if (fileIndex + 1 < fileCount) {
      const nextNames = Array.from(
        { length: liveCount },
        (_, exportIndex) =>
          `p${packageIndex}_live_${fileIndex + 1}_${exportIndex}`
      );
      lines.push(
        `import { ${nextNames.join(", ")} } from "./file-${fileIndex + 1}";`
      );
      for (const name of nextNames) {
        lines.push(`void ${name}();`);
      }
    }
    if (
      config.avgImportsPerFile > 1 &&
      fileIndex + config.avgImportsPerFile < fileCount
    ) {
      const target = fileIndex + config.avgImportsPerFile;
      lines.push(
        `import { p${packageIndex}_live_${target}_0 as distant${fileIndex} } from "./file-${target}";`
      );
      lines.push(`void distant${fileIndex}();`);
    }
    if (
      config.dynamicImportRatio > 0 &&
      fileIndex / Math.max(1, fileCount) < config.dynamicImportRatio
    ) {
      lines.push(`const dynamicTarget${fileIndex} = "./file-${fileIndex}";`);
      lines.push(`void import(dynamicTarget${fileIndex});`);
    }
    for (let exportIndex = 0; exportIndex < liveCount; exportIndex += 1) {
      lines.push(
        `export function p${packageIndex}_live_${fileIndex}_${exportIndex}(): number { return ${fileIndex + exportIndex}; }`
      );
    }
    for (let exportIndex = 0; exportIndex < deadCount; exportIndex += 1) {
      const name = `p${packageIndex}_dead_${fileIndex}_${exportIndex}`;
      lines.push(
        `export function ${name}(): number { return ${fileIndex + exportIndex}; }`
      );
      expectedFindings.push({
        kind: "unused-export",
        filePath: `${relativePrefix}${sourceDirectory}/file-${fileIndex}.ts`,
        name
      });
    }
    while (lines.length < config.avgLinesPerFile) {
      lines.push(`// synthetic padding ${lines.length + 1}`);
    }
    lines.push("");
    fs.writeFileSync(
      path.join(sourceRoot, `file-${fileIndex}.ts`),
      lines.join("\n")
    );
    loc += lines.length;
  }

  const entryLines: string[] = [];
  const entryNames = Array.from(
    { length: liveCount },
    (_, exportIndex) => `p${packageIndex}_live_0_${exportIndex}`
  );
  if (config.reExportChainDepth > 0) {
    fs.writeFileSync(
      path.join(sourceRoot, "barrel-0.ts"),
      `export { ${entryNames.join(", ")} } from "./file-0";\n`
    );
    for (
      let barrelIndex = 1;
      barrelIndex < config.reExportChainDepth;
      barrelIndex += 1
    ) {
      fs.writeFileSync(
        path.join(sourceRoot, `barrel-${barrelIndex}.ts`),
        `export { ${entryNames.join(", ")} } from "./barrel-${barrelIndex - 1}";\n`
      );
    }
    entryLines.push(
      `import { ${entryNames.join(", ")} } from "./barrel-${config.reExportChainDepth - 1}";`
    );
  } else {
    entryLines.push(
      `import { ${entryNames.join(", ")} } from "./file-0";`
    );
  }
  for (const name of entryNames) {
    entryLines.push(`void ${name}();`);
  }
  entryLines.push("");
  fs.writeFileSync(path.join(sourceRoot, "index.ts"), entryLines.join("\n"));
  loc += entryLines.length + config.reExportChainDepth;

  return {
    files: fileCount + config.reExportChainDepth + 1,
    loc
  };
}

function writeRootConfig(rootPath: string, include: string[]): void {
  fs.writeFileSync(
    path.join(rootPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "CommonJS",
          moduleResolution: "Node",
          strict: true
        },
        include
      },
      null,
      2
    )}\n`
  );
}

function writePackageConfig(
  packageRoot: string,
  packageIndex: number,
  packageCount: number
): void {
  fs.mkdirSync(packageRoot, { recursive: true });
  const references =
    packageIndex + 1 < packageCount
      ? [{ path: `../package-${packageIndex + 1}` }]
      : undefined;
  fs.writeFileSync(
    path.join(packageRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          composite: true,
          declaration: true,
          rootDir: "src",
          outDir: "dist"
        },
        include: ["src/**/*.ts"],
        references
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: `@synthetic/package-${packageIndex}`,
        version: "1.0.0",
        exports: { ".": "./src/index.ts" }
      },
      null,
      2
    )}\n`
  );
}

function validateConfig(config: SyntheticRepoConfig): void {
  if (!Number.isInteger(config.fileCount) || config.fileCount < 1) {
    throw new Error("fileCount must be a positive integer");
  }
  if (!Number.isInteger(config.packageCount ?? 1) || (config.packageCount ?? 1) < 1) {
    throw new Error("packageCount must be a positive integer");
  }
  for (const [name, value] of [
    ["deadCodeRatio", config.deadCodeRatio],
    ["dynamicImportRatio", config.dynamicImportRatio]
  ] as const) {
    if (value < 0 || value > 1) {
      throw new Error(`${name} must be between 0 and 1`);
    }
  }
}

function compareExpected(
  left: ExpectedSyntheticFinding,
  right: ExpectedSyntheticFinding
): number {
  return (
    left.filePath.localeCompare(right.filePath) ||
    left.name.localeCompare(right.name)
  );
}
