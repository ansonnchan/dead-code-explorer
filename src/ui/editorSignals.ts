import * as path from "node:path";
import * as vscode from "vscode";
import type { Finding, ScanResult } from "../model";
import { toPosixPath } from "../analysis/paths";

export class EditorSignals
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private readonly codeLensChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.codeLensChanged.event;
  private readonly decorationType =
    vscode.window.createTextEditorDecorationType({
      opacity: "0.58",
      textDecoration: "underline dotted"
    });
  private result?: ScanResult;
  private rootPath?: string;

  setResult(rootPath: string, result?: ScanResult): void {
    this.rootPath = rootPath;
    this.result = result;
    this.codeLensChanged.fire();
    this.refreshDecorations();
  }

  refreshDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const findings = this.findingsForDocument(editor.document);
      editor.setDecorations(
        this.decorationType,
        findings
          .filter((finding) => finding.kind !== "unreachable-file")
          .map((finding) => ({
            range: rangeForFinding(editor.document, finding),
            hoverMessage: new vscode.MarkdownString(
              [
                `**Dead Code Explorer: ${finding.confidence} confidence**`,
                "",
                ...finding.evidence.map((evidence) => `- ${evidence}`)
              ].join("\n")
            )
          }))
      );
    }
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return this.findingsForDocument(document)
      .filter((finding) => finding.kind !== "unreachable-file")
      .flatMap((finding) => {
        const range = new vscode.Range(
          Math.max(0, finding.startLine - 1),
          0,
          Math.max(0, finding.startLine - 1),
          0
        );
        return [
          new vscode.CodeLens(range, {
            title: "No references found",
            command: "deadCodeExplorer.showFinding",
            arguments: [finding]
          }),
          new vscode.CodeLens(range, {
            title: "View analysis",
            command: "deadCodeExplorer.showFinding",
            arguments: [finding]
          }),
          new vscode.CodeLens(range, {
            title: "Ignore",
            command: "deadCodeExplorer.ignoreFinding",
            arguments: [finding]
          })
        ];
      });
  }

  dispose(): void {
    this.decorationType.dispose();
    this.codeLensChanged.dispose();
  }

  private findingsForDocument(document: vscode.TextDocument): Finding[] {
    if (!this.result || !this.rootPath || document.uri.scheme !== "file") {
      return [];
    }
    const relative = toPosixPath(
      path.relative(this.rootPath, document.uri.fsPath)
    );
    return this.result.findings.filter(
      (finding) => finding.filePath === relative
    );
  }
}

export function rangeForFinding(
  document: vscode.TextDocument,
  finding: Finding
): vscode.Range {
  if (finding.start === 0 && finding.end === 0) {
    return new vscode.Range(0, 0, 0, 0);
  }
  return new vscode.Range(
    document.positionAt(finding.start),
    document.positionAt(Math.min(document.getText().length, finding.end))
  );
}
