export function barrelOnlyConsumer(): string {
  return "used through the barrel";
}

export function staleExport(): string {
  return "re-exported, but never consumed";
}
