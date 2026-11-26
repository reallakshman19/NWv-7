/**
 * Builds an opaque iframe URL for a TradingView script and its JSON configuration.
 * Use a fixed provider script URL with TRADINGVIEW_FRAME_SANDBOX on the iframe.
 */
export const TRADINGVIEW_FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups';

/**
 * @param {string} scriptUrl TradingView's public widget script.
 * @param {object} config JSON-serializable configuration for that widget.
 * @returns {string} A data URL that keeps the wrapper separate from the app's origin.
 */
export function createTradingViewFrameUrl(scriptUrl, config) {
  const widgetConfig = JSON.stringify(config).replace(/</g, '\\u003c');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head>' +
    '<body style="margin:0;background:#0f172a;">' +
    '<div class="tradingview-widget-container" style="height:100vh;width:100%">' +
    '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>' +
    '<script src="' + scriptUrl + '" type="text/javascript">' +
    widgetConfig + '</script></div></body></html>';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}
