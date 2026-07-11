'use strict';

/**
 * Validate a base64 image data URL for direct DB storage. Returns the URL if it
 * is a recognised raster image type, else null. SVG is intentionally excluded
 * (stored-XSS vector). Mirrors the validator used in userRoutes.saveBase64Image.
 */
function validateImageDataUrl(imageData) {
  if (!imageData) { return null; }
  const valid = /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(imageData);
  return valid ? imageData : null;
}

module.exports = { validateImageDataUrl };
