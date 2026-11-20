/**
 * Private research notes store for equity symbols.
 * Stores unencrypted text locally in the browser profile.
 * Text is limited to 2,000 characters per symbol.
 * Excluded strictly from external links, telemetry, and news searches.
 */
import { useSyncExternalStore, useCallback } from 'react';

export const NOTES_STORAGE_KEY = 'nw7.market-equity-notes.v1';
export const MAX_NOTE_LENGTH = 2000;

export function createNotesStore({
  storage = (typeof window !== 'undefined' ? window.localStorage : null),
  storageKey = NOTES_STORAGE_KEY,
} = {}) {
  let notesMap = {};
  let isPersistent = true;
  const subscribers = new Set();

  function notify() {
    subscribers.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('NotesStore subscriber error:', err);
      }
    });
  }

  function init() {
    if (!storage) {
      isPersistent = false;
      return;
    }
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.notes === 'object' && parsed.notes !== null) {
          notesMap = { ...parsed.notes };
          isPersistent = true;
          return;
        }
      }
    } catch {
      isPersistent = false;
    }
  }

  function trySave() {
    if (!storage) {
      isPersistent = false;
      return;
    }
    try {
      const payload = {
        schemaVersion: 1,
        exchange: 'NSE',
        notes: notesMap,
        updatedAt: new Date().toISOString(),
      };
      storage.setItem(storageKey, JSON.stringify(payload));
      isPersistent = true;
    } catch {
      isPersistent = false;
    }
  }

  init();

  return {
    getNote(canonicalKey) {
      return notesMap[canonicalKey] || null;
    },
    saveNote(canonicalKey, rawText) {
      if (typeof rawText !== 'string') {
        return { ok: false, reason: 'Note must be a text string' };
      }
      const trimmed = rawText.slice(0, MAX_NOTE_LENGTH);
      if (trimmed.trim().length === 0) {
        delete notesMap[canonicalKey];
      } else {
        notesMap[canonicalKey] = {
          text: trimmed,
          updatedAt: new Date().toISOString(),
          isPersistent,
        };
      }
      trySave();
      notify();
      return { ok: true, isPersistent, note: notesMap[canonicalKey] || null };
    },
    deleteNote(canonicalKey) {
      if (notesMap[canonicalKey]) {
        delete notesMap[canonicalKey];
        trySave();
        notify();
      }
      return { ok: true };
    },
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}

export const defaultNotesStore = createNotesStore();

export function useEquityNote(canonicalKey, store = defaultNotesStore) {
  const subscribe = useCallback((cb) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.getNote(canonicalKey), [canonicalKey, store]);

  const noteState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    note: noteState,
    saveNote: (text) => store.saveNote(canonicalKey, text),
    deleteNote: () => store.deleteNote(canonicalKey),
  };
}
