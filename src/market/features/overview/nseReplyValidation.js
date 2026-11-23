/** Only display explicitly qualified NSE CM or dated Bhavcopy observations. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function validateNseReply(data, symbol) {
  const quote = data?.quote;
  if (!quote || quote.symbol !== symbol || !Number.isFinite(quote.value) || quote.value <= 0) return null;
  if (quote.sourceTier === 'NSE_EOD_FALLBACK' && quote.priceType === 'END_OF_DAY_CLOSE') {
    if (typeof quote.priceDate !== 'string' || !DATE_ONLY.test(quote.priceDate) ||
        !Number.isFinite(Date.parse(quote.priceDate + 'T00:00:00Z')) ||
        new Date(quote.priceDate + 'T00:00:00Z').toISOString().slice(0, 10) !== quote.priceDate) return null;
    return quote;
  }
  if (quote.sourceTier === 'NSE_CM_PRIMARY' && quote.priceType === 'INTRADAY_OBSERVATION') {
    if (typeof quote.quoteAt !== 'string' || !Number.isFinite(Date.parse(quote.quoteAt))) return null;
    return quote;
  }
  return null;
}
