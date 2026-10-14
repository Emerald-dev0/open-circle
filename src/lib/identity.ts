// Remembers which row is "you" on this device. Purely cosmetic; storage can
// be unavailable (private mode, in-app browsers), so every access is guarded.
const KEY = "devechleon:me";

export function readMe(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeMe(login: string): void {
  try {
    localStorage.setItem(KEY, login.toLowerCase());
  } catch {
    // Highlighting just won't survive a reload.
  }
}
