function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function textValue(value) {
  return String(value || '').trim();
}

function cloneProvider(provider = {}) {
  return {
    id: textValue(provider.id),
    title: textValue(provider.title),
    description: textValue(provider.description),
    mode: textValue(provider.mode),
    buildPayload: provider.buildPayload,
  };
}

function providerDescriptor(provider = {}) {
  return {
    id: textValue(provider.id),
    title: textValue(provider.title),
    description: textValue(provider.description),
    mode: textValue(provider.mode),
  };
}

function sortProviders(providers = []) {
  return asArray(providers)
    .map(cloneProvider)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeRegistry(registry = {}) {
  return {
    providers: sortProviders(registry.providers),
  };
}

function validateProvider(provider = {}) {
  const normalized = cloneProvider(provider);
  if (!normalized.id) throw new Error('Audit debug provider requires id');
  if (!normalized.title) throw new Error(`Audit debug provider ${normalized.id} requires title`);
  if (!normalized.mode) throw new Error(`Audit debug provider ${normalized.id} requires mode`);
  if (typeof normalized.buildPayload !== 'function') {
    throw new Error(`Audit debug provider ${normalized.id} requires buildPayload function`);
  }
  return normalized;
}

export function createAuditDebugRegistry() {
  return { providers: [] };
}

export function registerAuditDebugProvider(registry = createAuditDebugRegistry(), provider = {}) {
  const normalizedRegistry = normalizeRegistry(registry);
  const normalizedProvider = validateProvider(provider);
  if (normalizedRegistry.providers.some(existing => existing.id === normalizedProvider.id)) {
    throw new Error(`Duplicate audit debug provider id: ${normalizedProvider.id}`);
  }
  return {
    providers: sortProviders([...normalizedRegistry.providers, normalizedProvider]),
  };
}

export function listAuditDebugProviders(registry = createAuditDebugRegistry()) {
  return normalizeRegistry(registry).providers.map(providerDescriptor);
}

export function getAuditDebugProvider(registry = createAuditDebugRegistry(), id = '') {
  const key = textValue(id);
  const provider = normalizeRegistry(registry).providers.find(candidate => candidate.id === key);
  return provider ? cloneProvider(provider) : null;
}

export function buildAuditDebugPayload(registry = createAuditDebugRegistry(), id = '', options = {}) {
  const key = textValue(id);
  const provider = getAuditDebugProvider(registry, key);
  if (!provider) {
    return {
      ok: false,
      mode: 'audit-debug',
      providerId: key,
      error: {
        code: 'provider_not_found',
        message: `Audit debug provider not found: ${key}`,
      },
    };
  }
  return provider.buildPayload(options);
}
