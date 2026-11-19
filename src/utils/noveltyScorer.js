import { newsIdentityKey } from '../services/newsStoryIdentity.js';

function tokenize(text) {
    return [...new Set(String(text).toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3))];
}

export function createNoveltyCorpus(items) {
    const corpus = new Map();
    const documents = new Map();
    for (const item of items) {
        const key = newsIdentityKey(item);
        const tokens = documents.get(key) || new Set();
        for (const token of tokenize([item.title, item.description || item.summary].filter(Boolean).join(' '))) {
            tokens.add(token);
        }
        documents.set(key, tokens);
    }
    for (const tokens of documents.values()) {
        for (const token of tokens) {
            corpus.set(token, (corpus.get(token) || 0) + 1);
        }
    }
    return corpus;
}

// The scoring pass only reads its corpus. Repeated scoring cannot age a topic.
export function calculateNoveltyScore(title, description, _section, corpus = new Map()) {
    const tokens = tokenize([title, description].filter(Boolean).join(' '));
    if (!tokens.length) return 1;
    const rareCount = tokens.filter(token => (corpus.get(token) || 0) <= 1).length;
    return 1 + 0.5 * rareCount / tokens.length;
}

export function getCorpusSize(corpus = new Map()) {
    return corpus.size;
}
