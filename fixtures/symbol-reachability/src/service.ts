export function runApplication(): string {
  return liveHelper();
}

function liveHelper(): string {
  return "live";
}

export function abandonedFeature(): string {
  return deadHelper();
}

function deadHelper(): string {
  return "unreachable";
}

function cycleA(): string {
  return cycleB();
}

function cycleB(): string {
  return cycleA();
}
