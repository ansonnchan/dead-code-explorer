import * as path from "node:path";
import * as vscode from "vscode";
import { readConfig } from "./config";
import type { Finding, ScanResult } from "./model";
import { scanRepository } from "./analysis/scanner";
import { DetailPanel } from "./ui/detailPanel";
import { EditorSignals, rangeForFinding } from "./ui/editorSignals";
import {
  FindingsTreeProvider,
  type FindingNode,
  unwrapFinding
} from "./ui/findingsTree";

const IGNORED_IDS_KEY = "deadCodeExplorer.ignoredFindingIds";

export function activate(context: vscode.ExtensionContext): void {
  const tree = new FindingsTreeProvider();
  const editorSignals = new EditorSignals();
  const output = vscode.window.createOutputChannel("Dead Code Explorer");
  let currentResult: ScanResult | undefined;
  let saveTimer: NodeJS.Timeout | undefined;
  let scanSequence = 0;
  const detailPanel = new DetailPanel((finding) => {
    void ignoreFinding(finding);
  });

  const treeView = vscode.window.createTreeView("deadCodeExplorer.findings", {
    treeDataProvider: tree,
    showCollapseAll: true
  });

  const scan = async (announce = true): Promise<void> => {
    const folder = getWorkspaceFolder();
    if (!folder) {
      void vscode.window.showErrorMessage(
        "Dead Code Explorer requires an open workspace folder."
      );
      return;
    }
    const sequence = ++scanSequence;
    tree.setScanning();
    const config = readConfig();
    const ignoredIds = new Set(
      context.workspaceState.get<string[]>(IGNORED_IDS_KEY, [])
    );

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: "Dead Code Explorer: analyzing workspace",
          cancellable: false
        },
        async () =>
          new Promise<ScanResult>((resolve, reject) => {
            setImmediate(() => {
              try {
                resolve(scanRepository(folder.uri.fsPath, config, ignoredIds));
              } catch (error) {
                reject(error);
              }
            });
          })
      );
      if (sequence !== scanSequence) {
        return;
      }
      currentResult = result;
      tree.setResult(result);
      editorSignals.setResult(folder.uri.fsPath, result);
      output.appendLine(formatScanSummary(result));
      for (const warning of result.warnings) {
        output.appendLine(`Warning: ${warning}`);
      }
      if (announce) {
        void vscode.window.showInformationMessage(
          `Dead Code Explorer found ${result.findings.length} findings across ${result.metrics.filesAnalyzed} files in ${result.metrics.durationMs} ms.`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tree.setError(`Scan error: ${message}`);
      output.appendLine(`Scan failed: ${message}`);
      void vscode.window.showErrorMessage(`Dead Code Explorer: ${message}`);
    }
  };

  const showFinding = async (
    value: Finding | FindingNode
  ): Promise<void> => {
    const finding = unwrapFinding(value);
    const folder = getWorkspaceFolder();
    if (!folder) {
      return;
    }
    const uri = vscode.Uri.file(path.join(folder.uri.fsPath, finding.filePath));
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(
      document,
      vscode.ViewColumn.One
    );
    const range = rangeForFinding(document, finding);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    detailPanel.show(finding);
  };

  async function ignoreFinding(
    value?: Finding | FindingNode
  ): Promise<void> {
    if (!value) {
      void vscode.window.showInformationMessage(
        "Choose Ignore from a finding in the sidebar or CodeLens."
      );
      return;
    }
    const finding = unwrapFinding(value);
    const ignoredIds = new Set(
      context.workspaceState.get<string[]>(IGNORED_IDS_KEY, [])
    );
    ignoredIds.add(finding.id);
    await context.workspaceState.update(IGNORED_IDS_KEY, [...ignoredIds]);
    await scan(false);
  }

  context.subscriptions.push(
    treeView,
    output,
    editorSignals,
    vscode.languages.registerCodeLensProvider(
      [
        { language: "typescript", scheme: "file" },
        { language: "typescriptreact", scheme: "file" },
        { language: "javascript", scheme: "file" },
        { language: "javascriptreact", scheme: "file" }
      ],
      editorSignals
    ),
    vscode.commands.registerCommand("deadCodeExplorer.scanWorkspace", () =>
      scan(true)
    ),
    vscode.commands.registerCommand(
      "deadCodeExplorer.rescanCurrentFile",
      () => scan(true)
    ),
    vscode.commands.registerCommand(
      "deadCodeExplorer.showFinding",
      showFinding
    ),
    vscode.commands.registerCommand(
      "deadCodeExplorer.ignoreFinding",
      ignoreFinding
    ),
    vscode.commands.registerCommand(
      "deadCodeExplorer.configureEntryPoints",
      async () => {
        const config = vscode.workspace.getConfiguration("deadCodeExplorer");
        const current = config.get<string[]>("entryPoints", []);
        const value = await vscode.window.showInputBox({
          title: "Dead Code Explorer Entry Points",
          prompt: "Enter workspace-relative entry points separated by commas",
          value: current.join(", "),
          placeHolder: "src/index.ts, src/worker.ts"
        });
        if (value === undefined) {
          return;
        }
        const entries = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        await config.update(
          "entryPoints",
          entries,
          vscode.ConfigurationTarget.Workspace
        );
        await scan(false);
      }
    ),
    vscode.commands.registerCommand(
      "deadCodeExplorer.clearAnalysisCache",
      async () => {
        scanSequence += 1;
        currentResult = undefined;
        await context.workspaceState.update(IGNORED_IDS_KEY, undefined);
        tree.clear();
        editorSignals.setResult(getWorkspaceFolder()?.uri.fsPath ?? "", undefined);
        void vscode.window.showInformationMessage(
          "Dead Code Explorer analysis cache and ignored finding IDs were cleared."
        );
      }
    ),
    vscode.window.onDidChangeVisibleTextEditors(() =>
      editorSignals.refreshDecorations()
    ),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (
        !readConfig().scanOnSave ||
        !["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(
          document.languageId
        )
      ) {
        return;
      }
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(() => {
        void scan(false);
      }, 450);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("deadCodeExplorer") && currentResult) {
        void scan(false);
      }
    }),
    new vscode.Disposable(() => {
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
    })
  );
}

export function deactivate(): void {}

function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

function formatScanSummary(result: ScanResult): string {
  const { metrics } = result;
  return [
    `Scan completed in ${metrics.durationMs} ms`,
    `${metrics.filesAnalyzed} files analyzed`,
    `${metrics.symbolsIndexed} symbols indexed`,
    `${metrics.graphEdges} graph edges`,
    `${result.findings.length} active findings`,
    `${result.ignoredFindings.length} ignored findings`
  ].join(" · ");
}
