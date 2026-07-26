import * as vscode from "vscode";
import type { Finding, FindingKind, ScanResult } from "../model";

type TreeNode = SummaryNode | MessageNode | GroupNode | FindingNode;

interface SummaryNode {
  type: "summary";
  label: string;
  description?: string;
}

interface MessageNode {
  type: "message";
  label: string;
  icon: "warning" | "info";
}

interface GroupNode {
  type: "group";
  label: string;
  kind: FindingKind | "ignored";
  findings: Finding[];
}

export interface FindingNode {
  type: "finding";
  finding: Finding;
}

const GROUPS: Array<{ label: string; kind: FindingKind }> = [
  { label: "Unused Files", kind: "unreachable-file" },
  { label: "Unused Exports", kind: "unused-export" },
  { label: "Unused Types", kind: "unused-type" },
  { label: "Unused Local Symbols", kind: "unused-local" }
];

export class FindingsTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private readonly changed = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private result?: ScanResult;
  private status = "Run Scan Workspace to analyze this project.";

  setScanning(): void {
    this.status = "Scanning workspace…";
    this.changed.fire(undefined);
  }

  setResult(result: ScanResult): void {
    this.result = result;
    this.status = "";
    this.changed.fire(undefined);
  }

  setError(message: string): void {
    this.result = undefined;
    this.status = message;
    this.changed.fire(undefined);
  }

  clear(): void {
    this.result = undefined;
    this.status = "Analysis cache cleared. Run a scan to analyze the workspace.";
    this.changed.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.type === "summary") {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None
      );
      item.description = element.description;
      item.iconPath = new vscode.ThemeIcon("pulse");
      return item;
    }
    if (element.type === "message") {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None
      );
      item.iconPath = new vscode.ThemeIcon(element.icon);
      item.tooltip = element.label;
      return item;
    }
    if (element.type === "group") {
      const item = new vscode.TreeItem(
        `${element.label} (${element.findings.length})`,
        element.findings.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
      );
      item.contextValue = "deadCodeExplorer.group";
      return item;
    }

    const finding = element.finding;
    const item = new vscode.TreeItem(
      finding.kind === "unreachable-file"
        ? finding.relativePath
        : finding.name,
      vscode.TreeItemCollapsibleState.None
    );
    item.description =
      finding.kind === "unreachable-file"
        ? finding.confidence
        : `${finding.relativePath}:${finding.startLine} · ${finding.confidence}`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**${confidenceLabel(finding.confidence)} confidence** (score ${finding.score})`,
        "",
        ...finding.evidence.map((item) => `- ${item}`)
      ].join("\n")
    );
    item.iconPath = findingIcon(finding);
    item.contextValue = "deadCodeExplorer.finding";
    item.command = {
      command: "deadCodeExplorer.showFinding",
      title: "View Analysis",
      arguments: [finding]
    };
    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element?.type === "group") {
      return element.findings.map((finding) => ({
        type: "finding",
        finding
      }));
    }
    if (element) {
      return [];
    }
    if (!this.result) {
      return [
        {
          type: "message",
          label: this.status,
          icon: this.status.toLowerCase().includes("error") ? "warning" : "info"
        }
      ];
    }

    const { metrics, findings, ignoredFindings } = this.result;
    const root: TreeNode[] = [
      {
        type: "summary",
        label: `${metrics.filesAnalyzed} files · ${metrics.symbolsIndexed} symbols`,
        description: `${metrics.graphEdges} edges · ${metrics.durationMs} ms`
      }
    ];
    root.push(
      ...this.result.warnings.map(
        (warning): MessageNode => ({
          type: "message",
          label: warning,
          icon: "warning"
        })
      )
    );
    root.push(
      ...GROUPS.map(
        (group): GroupNode => ({
          type: "group",
          label: group.label,
          kind: group.kind,
          findings: findings.filter((finding) => finding.kind === group.kind)
        })
      )
    );
    root.push({
      type: "group",
      label: "Ignored Findings",
      kind: "ignored",
      findings: ignoredFindings
    });
    return root;
  }
}

export function unwrapFinding(value: Finding | FindingNode): Finding {
  if ("type" in value && value.type === "finding") {
    return value.finding;
  }
  return value as Finding;
}

function findingIcon(finding: Finding): vscode.ThemeIcon {
  if (finding.ignored) {
    return new vscode.ThemeIcon("eye-closed");
  }
  if (finding.confidence === "high") {
    return new vscode.ThemeIcon(
      finding.kind === "unreachable-file" ? "file" : "symbol-event",
      new vscode.ThemeColor("problemsErrorIcon.foreground")
    );
  }
  if (finding.confidence === "medium") {
    return new vscode.ThemeIcon(
      "warning",
      new vscode.ThemeColor("problemsWarningIcon.foreground")
    );
  }
  return new vscode.ThemeIcon("question");
}

function confidenceLabel(confidence: Finding["confidence"]): string {
  return confidence[0].toUpperCase() + confidence.slice(1);
}
