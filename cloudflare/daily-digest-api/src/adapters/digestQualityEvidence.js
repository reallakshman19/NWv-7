import { decodeHtml, extractAnchors, htmlToText } from './html.js';
import { observedQualityEvidence, unavailableQualityEvidence } from '../qualityClassifier.js';

function uniqueUseful(items) {
  const seen = new Set();
  return (items || []).map(item => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(item => item.length >= 20 && item.length <= 260)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function lineText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/li|\/div|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function flatHeadlineFallback(html) {
  const text = htmlToText(html);
  const match = text.match(/\bTHE HEADLINES\b([\s\S]{20,3500}?)(?:\bTHE NEWS\b|\bNEWS IN DETAIL\b|$)/i);
  if (!match) return [];
  return match[1].split(/(?:\s*[•●]\s*|(?<=[.!?])\s+(?=[A-Z]))/).map(value => value.trim());
}

export function extractAkashvaniDigestQualityEvidence(html) {
  const lines = lineText(html);
  const start = lines.findIndex(line => /^(?:THE )?HEADLINES:?$/i.test(line));
  let items = [];
  if (start >= 0) {
    for (const line of lines.slice(start + 1)) {
      if (/^(?:THE NEWS|NEWS IN DETAIL|THE DETAILS|NEWS):?$/i.test(line)) break;
      items.push(line.replace(/^[•●\-–—]\s*/, ''));
    }
  }
  items = uniqueUseful(items.length ? items : flatHeadlineFallback(html));
  return items.length
    ? observedQualityEvidence(items, 'AKASHVANI_HEADLINES')
    : unavailableQualityEvidence('AKASHVANI_HEADLINE_BLOCK_NOT_FOUND');
}

function isExpressStoryAnchor(anchor) {
  try {
    const url = new URL(anchor.url);
    const text = String(anchor.text || '').trim();
    if (url.hostname.replace(/^www\./, '') !== 'indianexpress.com') return false;
    if (!url.pathname.startsWith('/article/')) return false;
    if (/^Daily Briefing\b/i.test(text)) return false;
    if (/^(read more|click here|subscribe|sign up|newsletter)/i.test(text)) return false;
    return text.length >= 20;
  } catch {
    return false;
  }
}

function expressHeadings(html) {
  const output = [];
  for (const match of String(html || '').matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)) {
    const text = htmlToText(match[1]);
    if (!/^Daily Briefing\b/i.test(text)) output.push(text);
  }
  return output;
}

export function extractIndianExpressDigestQualityEvidence(html, articleUrl) {
  const anchors = extractAnchors(html, articleUrl).filter(isExpressStoryAnchor).map(anchor => anchor.text);
  const items = uniqueUseful([...anchors, ...expressHeadings(html)]);
  return items.length
    ? observedQualityEvidence(items, 'INDIAN_EXPRESS_DAILY_BRIEFING_BODY')
    : unavailableQualityEvidence('INDIAN_EXPRESS_STORY_ITEMS_NOT_FOUND');
}
