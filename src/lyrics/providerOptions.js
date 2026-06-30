export function resolveProviderOptions(optionsOrFetch = {}) {
  if (typeof optionsOrFetch === "function") {
    return {
      fetchImpl: optionsOrFetch,
      signal: undefined,
    };
  }

  return {
    fetchImpl: typeof optionsOrFetch?.fetchImpl === "function" ? optionsOrFetch.fetchImpl : defaultFetchImpl(),
    signal: optionsOrFetch?.signal,
  };
}

export function withFetchSignal(options = {}, signal) {
  return signal
    ? { ...options, signal }
    : options;
}

export function defaultFetchImpl() {
  if (typeof globalThis?.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error("fetch is unavailable");
}
