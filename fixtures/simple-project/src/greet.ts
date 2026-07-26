export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function unusedGreeting(): string {
  return "Nobody calls this";
}

// dead-code-explorer-ignore
export function metadataDiscoveredGreeting(): string {
  return "Loaded by an external registry";
}
