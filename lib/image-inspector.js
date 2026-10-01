const dns = require("node:dns");
const axios = require("axios");
const { imageSize } = require("image-size");
const {
  TargetUrlError,
  createSafeLookup,
  normalizeTargetUrl,
  validateRedirect,
} = require("./safe-fetch");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 7_000;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

class ImageFetchError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "ImageFetchError";
    this.statusCode = statusCode;
  }
}

async function fetchImage(value, { client = axios, lookup = dns.lookup } = {}) {
  const url = normalizeTargetUrl(value);
  try {
    const response = await client.get(url, {
      beforeRedirect: validateRedirect,
      headers: {
        Accept: "image/webp,image/png,image/jpeg,image/gif",
        "User-Agent": "MetaScope/2.0 (+https://github.com/alianjum0/ogpreview-node)",
      },
      lookup: createSafeLookup(lookup),
      maxBodyLength: MAX_IMAGE_BYTES,
      maxContentLength: MAX_IMAGE_BYTES,
      maxRedirects: 5,
      proxy: false,
      responseType: "arraybuffer",
      timeout: IMAGE_TIMEOUT_MS,
    });

    const contentType = String(response.headers["content-type"] || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
      throw new ImageFetchError("The image URL did not return a supported image.", 422);
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new ImageFetchError("The image is larger than 5 MB.", 422);
    }
    return { buffer, contentType, url };
  } catch (error) {
    if (error instanceof TargetUrlError || error instanceof ImageFetchError) throw error;
    if (error.cause instanceof TargetUrlError) throw error.cause;
    if (error.code === "ECONNABORTED") {
      throw new ImageFetchError("The image took too long to respond.");
    }
    if (
      error.code === "ERR_BAD_RESPONSE" &&
      String(error.message).includes("maxContentLength")
    ) {
      throw new ImageFetchError("The image is larger than 5 MB.", 422);
    }
    throw new ImageFetchError("The image could not be inspected.");
  }
}

async function inspectImage(value, options = {}) {
  const { buffer, contentType, url } = await fetchImage(value, options);
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw new ImageFetchError("The image data is invalid or unsupported.", 422);
  }
  if (!dimensions.width || !dimensions.height) {
    throw new ImageFetchError("The image dimensions could not be determined.", 422);
  }

  return {
    url,
    reachable: true,
    https: new URL(url).protocol === "https:",
    contentType,
    bytes: buffer.length,
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: Math.round((dimensions.width / dimensions.height) * 100) / 100,
    recommendedDimensions: dimensions.width === 1200 && dimensions.height === 630,
  };
}

module.exports = {
  IMAGE_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  ImageFetchError,
  fetchImage,
  inspectImage,
};
