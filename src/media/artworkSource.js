const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:", "blob:"]);

export function cleanArtworkSource(value, depth = 0) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value) || depth >= 4) return "";

  for (const key of ["value", "file", "url", "path", "src", "thumbnail", "artwork"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const nested = cleanArtworkSource(value[key], depth + 1);
      if (nested) return nested;
    }
  }

  return "";
}

export function normalizeArtworkSource(value) {
  const source = cleanArtworkSource(value);
  if (!source || hasUnsafeImageCharacters(source)) return "";
  if (isDataImageUrl(source)) return source;
  if (/^data:/i.test(source)) return "";
  if (/^file:/i.test(source)) return normalizeFileUrl(source);

  if (hasSafeImageProtocol(source)) return source;

  const decodedPath = safeDecode(source).replaceAll("\\", "/");
  const localPath = extractLastWindowsPath(decodedPath);
  if (localPath) return windowsPathToFileUrl(localPath);
  if (hasExplicitProtocol(source)) return "";

  return source.replaceAll("\\", "/");
}

function hasSafeImageProtocol(value) {
  try {
    return SAFE_IMAGE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function hasExplicitProtocol(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function hasUnsafeImageCharacters(value) {
  return /["'<>]|[\u0000-\u001f\u007f]/.test(value);
}

function isDataImageUrl(value) {
  return /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9.+-]+=[a-z0-9.+-]+)*;base64,[a-z0-9+/=_-]+$/i.test(value);
}

function windowsPathToFileUrl(value) {
  const normalized = safeDecode(value).replaceAll("\\", "/").replace(/^\/(?=[A-Za-z]:\/)/, "");
  return /^[A-Za-z]:\//.test(normalized) ? `file:///${normalized}` : normalized;
}

function normalizeFileUrl(value) {
  const localPath = fileUrlToWindowsPath(value);
  return localPath ? windowsPathToFileUrl(localPath) : value;
}

function fileUrlToWindowsPath(value) {
  try {
    const url = new URL(value);
    const decodedPath = safeDecode(url.pathname || "").replace(/\\/g, "/").replace(/^\//, "");
    return extractLastWindowsPath(decodedPath);
  } catch {
    const decodedPath = safeDecode(value).replace(/^file:\/*/i, "").replace(/\\/g, "/").replace(/^\//, "");
    return extractLastWindowsPath(decodedPath);
  }
}

function extractLastWindowsPath(value) {
  const normalized = safeDecode(value).replaceAll("\\", "/");
  const matches = [...String(normalized).matchAll(/[A-Za-z]:\//g)];
  if (matches.length === 0) return "";
  return normalized.slice(matches[matches.length - 1].index);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
