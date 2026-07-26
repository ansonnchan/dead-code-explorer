export const orphanedValue = 42;

function orphanedHelper(): number {
  return orphanedValue * 2;
}

void orphanedHelper;
