const dns = require("node:dns");
const net = require("node:net");
const axios = require("axios");
const ipaddr = require("ipaddr.js");

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

class TargetUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "TargetUrlError";
    this.statusCode = 400;
  }
}

class FetchPageError extends Error {
  constructor(message) {
    super(message);
    this.name = "FetchPageError";
    this.statusCode = 502;
  }
}

function isBlockedAddress(address) {
  if (!ipaddr.isValid(address)) return true;

  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address();
  }

  return parsed.range() !== "unicast";
}

function normalizeTargetUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TargetUrlError("Enter a valid HTTP or HTTPS URL.");
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new TargetUrlError("Enter a valid HTTP or HTTPS URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new TargetUrlError("Only HTTP and HTTPS URLs are supported.");
  }
  if (parsed.username || parsed.password) {
    throw new TargetUrlError("URLs containing credentials are not supported.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new TargetUrlError(
      "Private and local network addresses are not allowed.",
    );
  }
  if (net.isIP(hostname) && isBlockedAddress(hostname)) {
    throw new TargetUrlError(
      "Private and local network addresses are not allowed.",
    );
  }

  return parsed.toString();
}

function createSafeLookup(lookup = dns.lookup) {
  return (hostname, options, callback) => {
    const requestedOptions =
      typeof options === "number" ? { family: options } : { ...options };

    lookup(
      hostname,
      { ...requestedOptions, all: true, verbatim: true },
      (error, addresses) => {
        if (error) return callback(error);

        const results = Array.isArray(addresses) ? addresses : [addresses];
        if (!results.length || results.some(({ address }) => isBlockedAddress(address))) {
          return callback(
            new TargetUrlError(
              "Private and local network addresses are not allowed.",
            ),
          );
        }

        if (requestedOptions.all) return callback(null, results);
        return callback(null, results[0].address, results[0].family);
      },
    );
  };
}

function validateRedirect(options) {
  const port = options.port ? `:${options.port}` : "";
  normalizeTargetUrl(
    `${options.protocol}//${options.hostname}${port}${options.path || "/"}`,
  );
}

async function fetchTextResource(value, {
  accept,
  allowedContentTypes,
  client = axios,
  fetchMessage,
  invalidTypeMessage,
  lookup = dns.lookup,
  sizeMessage,
  timeoutMessage,
}) {
  const url = normalizeTargetUrl(value);

  try {
    const response = await client.get(url, {
      beforeRedirect: validateRedirect,
      headers: {
        Accept: accept,
        "User-Agent": "OGPreview/1.0 (+https://github.com/alianjum0/ogpreview-node)",
      },
      lookup: createSafeLookup(lookup),
      maxBodyLength: MAX_RESPONSE_BYTES,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxRedirects: 5,
      proxy: false,
      responseType: "text",
      timeout: REQUEST_TIMEOUT_MS,
    });

    const contentType = String(response.headers["content-type"] || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!allowedContentTypes.includes(contentType)) {
      throw new TargetUrlError(invalidTypeMessage);
    }

    return response.data;
  } catch (error) {
    if (error instanceof TargetUrlError) throw error;
    if (error.cause instanceof TargetUrlError) throw error.cause;
    if (error.code === "ECONNABORTED") {
      throw new FetchPageError(timeoutMessage);
    }
    if (
      error.code === "ERR_BAD_RESPONSE" &&
      error.message.includes("maxContentLength")
    ) {
      throw new FetchPageError(sizeMessage);
    }
    throw new FetchPageError(fetchMessage);
  }
}

async function fetchPage(value, options = {}) {
  return fetchTextResource(value, {
    accept: "text/html,application/xhtml+xml",
    allowedContentTypes: ["text/html", "application/xhtml+xml"],
    fetchMessage: "The target website could not be fetched.",
    invalidTypeMessage: "The target URL did not return an HTML page.",
    sizeMessage: "The target page is larger than 2 MB.",
    timeoutMessage: "The target website took too long to respond.",
    ...options,
  });
}

async function fetchSitemap(value, options = {}) {
  return fetchTextResource(value, {
    accept: "application/xml,text/xml,text/plain",
    allowedContentTypes: ["application/xml", "text/xml", "text/plain"],
    fetchMessage: "The sitemap could not be fetched.",
    invalidTypeMessage: "The target URL did not return an XML sitemap.",
    sizeMessage: "The sitemap is larger than 2 MB.",
    timeoutMessage: "The sitemap took too long to respond.",
    ...options,
  });
}

module.exports = {
  FetchPageError,
  TargetUrlError,
  createSafeLookup,
  fetchPage,
  fetchSitemap,
  isBlockedAddress,
  normalizeTargetUrl,
  validateRedirect,
};
