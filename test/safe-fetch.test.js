const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createSafeLookup,
  fetchPage,
  isBlockedAddress,
  normalizeTargetUrl,
} = require("../lib/safe-fetch");

test("accepts public HTTP URLs and rejects unsafe targets", () => {
  assert.equal(
    normalizeTargetUrl("https://example.com/path"),
    "https://example.com/path",
  );

  for (const value of [
    "file:///etc/passwd",
    "http://localhost/",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "https://user:password@example.com/",
  ]) {
    assert.throws(() => normalizeTargetUrl(value));
  }
});

test("classifies private, reserved, and public IP addresses", () => {
  assert.equal(isBlockedAddress("127.0.0.1"), true);
  assert.equal(isBlockedAddress("169.254.1.1"), true);
  assert.equal(isBlockedAddress("192.168.1.1"), true);
  assert.equal(isBlockedAddress("::1"), true);
  assert.equal(isBlockedAddress("fc00::1"), true);
  assert.equal(isBlockedAddress("8.8.8.8"), false);
  assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
});

test("rejects a hostname when DNS resolves to a private address", async () => {
  const lookup = (_hostname, _options, callback) =>
    callback(null, [{ address: "127.0.0.1", family: 4 }]);
  const safeLookup = createSafeLookup(lookup);

  await assert.rejects(
    new Promise((resolve, reject) => {
      safeLookup("example.test", { all: true }, (error, addresses) =>
        error ? reject(error) : resolve(addresses),
      );
    }),
    /Private and local network addresses are not allowed/,
  );
});

test("returns public DNS results", async () => {
  const lookup = (_hostname, _options, callback) =>
    callback(null, [{ address: "8.8.8.8", family: 4 }]);
  const safeLookup = createSafeLookup(lookup);

  const addresses = await new Promise((resolve, reject) => {
    safeLookup("example.test", { all: true }, (error, results) =>
      error ? reject(error) : resolve(results),
    );
  });

  assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
});

test("applies bounded request settings and accepts HTML", async () => {
  let request;
  const client = {
    async get(url, options) {
      request = { url, options };
      return {
        data: "<html><title>Fixture</title></html>",
        headers: { "content-type": "text/html; charset=utf-8" },
      };
    },
  };

  const html = await fetchPage("https://example.test/page", { client });

  assert.equal(html, "<html><title>Fixture</title></html>");
  assert.equal(request.url, "https://example.test/page");
  assert.equal(request.options.timeout, 10_000);
  assert.equal(request.options.maxContentLength, 2 * 1024 * 1024);
  assert.equal(request.options.maxRedirects, 5);
  assert.equal(request.options.proxy, false);
});

test("rejects non-HTML responses", async () => {
  const client = {
    async get() {
      return {
        data: "not html",
        headers: { "content-type": "application/json" },
      };
    },
  };

  await assert.rejects(
    fetchPage("https://example.test/data", { client }),
    /did not return an HTML page/,
  );
});

test("maps request timeouts to a safe public error", async () => {
  const client = {
    async get() {
      const error = new Error("internal timeout details");
      error.code = "ECONNABORTED";
      throw error;
    },
  };

  await assert.rejects(
    fetchPage("https://example.test/slow", { client }),
    /took too long to respond/,
  );
});
