const ENDPOINT_PATH = '/api/datasets/upAhead';
const INPUT_ENV_KEYS = ['VITE_API_BASE_URL', 'UP_AHEAD_API_BASE_URL'];

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    allowEmpty: false,
    smoke: false,
    positional: [],
  };

  for (const arg of argv) {
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
    } else if (arg === '--smoke') {
      options.smoke = true;
    } else {
      options.positional.push(arg);
    }
  }

  return options;
}

function readInputUrl(options = parseArgs(), env = process.env) {
  return options.positional[0]
    || env.VITE_API_BASE_URL
    || env.UP_AHEAD_API_BASE_URL
    || '';
}

export function buildEndpointUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}${ENDPOINT_PATH}`;
}

export function verifyActivationConfig(inputUrl, { allowEmpty = false } = {}) {
  const raw = String(inputUrl || '').trim();
  if (!raw) {
    return allowEmpty
      ? { ok: true, baseUrl: '', endpointUrl: '', message: 'empty URL allowed' }
      : { ok: false, error: 'URL is required. Set VITE_API_BASE_URL, UP_AHEAD_API_BASE_URL, pass a CLI URL, or use --allow-empty.' };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: `Invalid URL: ${raw}` };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'URL must use http or https.' };
  }

  if (parsed.search) {
    return { ok: false, error: 'URL must not include a query string.' };
  }

  if (parsed.hash) {
    return { ok: false, error: 'URL must not include a hash fragment.' };
  }

  if (parsed.pathname.includes(ENDPOINT_PATH)) {
    return { ok: false, error: `Base URL must not include ${ENDPOINT_PATH}; provide only the Worker base URL.` };
  }

  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  const baseUrl = `${parsed.origin}${path}`;
  const endpointUrl = buildEndpointUrl(baseUrl);

  if (!endpointUrl.endsWith(ENDPOINT_PATH) || endpointUrl.split(ENDPOINT_PATH).length !== 2) {
    return { ok: false, error: `Normalized endpoint must append ${ENDPOINT_PATH} exactly once.` };
  }

  return { ok: true, baseUrl, endpointUrl, message: 'valid activation config' };
}

function printResult(result, { smoke = false } = {}) {
  if (!result.ok) {
    console.error('Up Ahead edge activation config: FAIL');
    console.error(result.error);
    return;
  }

  console.log('Up Ahead edge activation config: PASS');
  console.log(`Base URL: ${result.baseUrl || '(empty allowed)'}`);
  console.log(`Endpoint: ${result.endpointUrl || '(not built)'}`);
  console.log(`Network: ${smoke ? 'smoke requested' : 'not used'}`);
}

export async function runActivationVerifier({ argv = process.argv.slice(2), env = process.env } = {}) {
  const options = parseArgs(argv);
  const inputUrl = readInputUrl(options, env);
  const result = verifyActivationConfig(inputUrl, { allowEmpty: options.allowEmpty });
  printResult(result, { smoke: options.smoke });

  if (!result.ok) return 1;
  if (!result.baseUrl || !options.smoke) return 0;

  const { runSmoke } = await import('./smoke_up_ahead_edge_api.mjs');
  return await runSmoke({ inputBaseUrl: result.baseUrl });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runActivationVerifier().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error('Up Ahead edge activation config: FAIL');
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}

export { ENDPOINT_PATH, INPUT_ENV_KEYS, parseArgs, readInputUrl };
