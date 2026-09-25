import type { Draft } from "./finance";
const KEY = "shamsy-draft-v3";
export function getDraft(): Draft | null { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
export function saveDraft(draft: Draft) { localStorage.setItem(KEY, JSON.stringify(draft)); }
export function clearDraft() { localStorage.removeItem(KEY); }
