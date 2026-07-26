import * as vscode from "vscode";
import type { Finding } from "../model";

export class DetailPanel {
  private panel?: vscode.WebviewPanel;
  private currentFinding?: Finding;

  constructor(private readonly ignoreFinding: (finding: Finding) => void) {}

  show(finding: Finding): void {
    this.currentFinding = finding;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "deadCodeExplorer.analysis",
        "Dead Code Analysis",
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.currentFinding = undefined;
      });
      this.panel.webview.onDidReceiveMessage((message: unknown) => {
        if (
          message &&
          typeof message === "object" &&
          "command" in message &&
          message.command === "ignore" &&
          this.currentFinding
        ) {
          this.ignoreFinding(this.currentFinding);
        }
      });
    }
    this.panel.title = `Analysis: ${finding.name}`;
    this.panel.webview.html = renderHtml(finding);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }
}

function renderHtml(finding: Finding): string {
  const evidence = finding.evidence
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const risks =
    finding.risks.length > 0
      ? `<h2>Known risk categories</h2><ul>${finding.risks
          .map((risk) => `<li>${escapeHtml(risk)}</li>`)
          .join("")}</ul>`
      : "<p>No known static-analysis risk category was detected.</p>";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>
      body { padding: 1.5rem; max-width: 760px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
      .confidence { display: inline-block; padding: .2rem .5rem; border: 1px solid var(--vscode-panel-border); border-radius: 999px; }
      code { color: var(--vscode-textPreformat-foreground); }
      li { margin: .45rem 0; }
      button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: .45rem .8rem; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(finding.name)}</h1>
    <p><code>${escapeHtml(finding.relativePath)}:${finding.startLine}</code></p>
    <p class="confidence">${escapeHtml(finding.confidence)} confidence · score ${finding.score}</p>
    <h2>Evidence</h2>
    <ul>${evidence}</ul>
    ${risks}
    ${finding.ignoredReason ? `<h2>Ignored</h2><p>${escapeHtml(finding.ignoredReason)}</p>` : ""}
    ${finding.ignored ? "" : '<button id="ignore" type="button">Ignore finding</button>'}
    <p>Static analysis is evidence, not proof that code is safe to delete.</p>
    <script>
      const vscode = acquireVsCodeApi();
      document.getElementById("ignore")?.addEventListener("click", () => {
        vscode.postMessage({ command: "ignore" });
      });
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]!
  );
}
