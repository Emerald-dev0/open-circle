import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

export function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) loadEnvFile(file);
  }
}
