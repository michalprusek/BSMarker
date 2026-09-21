import { ApiBoxPayload } from "../core/boxes";
import { storageKey } from "../../utils/storage";

/**
 * Safety nets for saving across page changes:
 *
 * - saves still running after the editor left a recording are tracked, so
 *   re-opening that recording waits for them instead of loading stale data;
 * - if saving finally fails (or the tab closes with unsaved changes), the
 *   boxes are kept in localStorage and offered back the next time.
 */

const pending = new Map<number, Promise<unknown>>();

export function trackPendingSave(recordingId: number, save: Promise<unknown>): void {
  pending.set(recordingId, save);
  void save.finally(() => {
    if (pending.get(recordingId) === save) pending.delete(recordingId);
  });
}

export function waitForPendingSave(recordingId: number): Promise<unknown> {
  return pending.get(recordingId) ?? Promise.resolve();
}

const backupKey = (recordingId: number) =>
  storageKey(`bsmarker:unsaved-boxes:${recordingId}`);

export interface LocalBackup {
  savedAt: string;
  boxes: ApiBoxPayload[];
}

export function writeBackup(recordingId: number, boxes: ApiBoxPayload[]): void {
  try {
    const backup: LocalBackup = { savedAt: new Date().toISOString(), boxes };
    localStorage.setItem(backupKey(recordingId), JSON.stringify(backup));
  } catch (error) {
    console.error("Could not keep a local copy of unsaved annotations:", error);
  }
}

export function readBackup(recordingId: number): LocalBackup | null {
  try {
    const raw = localStorage.getItem(backupKey(recordingId));
    return raw ? (JSON.parse(raw) as LocalBackup) : null;
  } catch {
    return null;
  }
}

export function clearBackup(recordingId: number): void {
  try {
    localStorage.removeItem(backupKey(recordingId));
  } catch {
    // storage unavailable — nothing to clear
  }
}
