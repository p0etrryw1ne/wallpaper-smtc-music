export function installArtworkFallback(root) {
  if (!root || root.__weSmtcArtworkFallbackInstalled === true || typeof root.addEventListener !== "function") return;

  root.__weSmtcArtworkFallbackInstalled = true;
  root.addEventListener("error", (event) => {
    const target = event?.target;
    if (target && typeof target.matches === "function" && target.matches("[data-artwork-image]")) {
      showArtworkFallback(target);
    }
  }, true);
}

export function showArtworkFallback(image) {
  if (!image) return;

  image.hidden = true;
  if (typeof image.removeAttribute === "function") {
    image.removeAttribute("src");
    image.removeAttribute("srcset");
  }

  const fallback = image.nextElementSibling;
  if (fallback && typeof fallback.matches === "function" && fallback.matches("[data-artwork-fallback]")) {
    fallback.hidden = false;
  }
}
