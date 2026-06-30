export function deriveInitialMediaInput(query, options = {}) {
  if (query?.has?.("mock")) {
    return options.createMockMedia?.(query.get("mock")) ?? {};
  }

  return {};
}
