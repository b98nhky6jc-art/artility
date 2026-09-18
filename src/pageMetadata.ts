import { useEffect } from "react";

function setMeta(name: string, content: string, property = false) {
  const attribute = property ? "property" : "name";
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${name}"]`,
  );

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.append(element);
  }

  element.content = content;
}

export function usePageMetadata(title: string, description: string, image?: string | null) {
  useEffect(() => {
    const fullTitle = title === "Artility" ? title : `${title} · Artility`;
    document.title = fullTitle;
    setMeta("description", description);
    setMeta("og:title", fullTitle, true);
    setMeta("og:description", description, true);
    setMeta("og:type", "website", true);
    setMeta("og:url", window.location.href, true);

    const shareImage = new URL(image || "/pwa-512x512.png", window.location.origin).toString();
    setMeta("og:image", shareImage, true);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", description);
    setMeta("twitter:image", shareImage);
  }, [description, image, title]);
}
