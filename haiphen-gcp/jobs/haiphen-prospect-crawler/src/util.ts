import { randomUUID as nodeUUID } from "crypto";

export function randomUUID(): string {
  return nodeUUID();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
