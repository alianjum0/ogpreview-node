const assert = require("node:assert/strict");
const test = require("node:test");
const { inspectImage } = require("../lib/image-inspector");

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test("reports safe image type, bytes, dimensions, and aspect ratio", async () => {
  const client = {
    async get(_url, options) {
      assert.equal(options.responseType, "arraybuffer");
      assert.equal(options.maxContentLength, 5 * 1024 * 1024);
      assert.doesNotMatch(options.headers.Accept, /avif/);
      return {
        data: pngHeader(1200, 630),
        headers: { "content-type": "image/png" },
      };
    },
  };

  const report = await inspectImage("https://example.com/social.png", { client });

  assert.equal(report.reachable, true);
  assert.equal(report.contentType, "image/png");
  assert.equal(report.bytes, 24);
  assert.equal(report.width, 1200);
  assert.equal(report.height, 630);
  assert.equal(report.aspectRatio, 1.9);
  assert.equal(report.recommendedDimensions, true);
  assert.equal(report.https, true);
});

test("rejects private targets before requesting image bytes", async () => {
  let requested = false;
  const client = {
    async get() {
      requested = true;
    },
  };

  await assert.rejects(
    inspectImage("http://127.0.0.1/private.png", { client }),
    /Private and local network addresses are not allowed/,
  );
  assert.equal(requested, false);
});

test("rejects non-image and oversized responses", async () => {
  await assert.rejects(
    inspectImage("https://example.com/file", {
      client: {
        async get() {
          return { data: Buffer.from("hello"), headers: { "content-type": "text/plain" } };
        },
      },
    }),
    /did not return a supported image/,
  );

  await assert.rejects(
    inspectImage("https://example.com/large.png", {
      client: {
        async get() {
          return {
            data: Buffer.alloc(5 * 1024 * 1024 + 1),
            headers: { "content-type": "image/png" },
          };
        },
      },
    }),
    /larger than 5 MB/,
  );
});

test("validates every image redirect destination", async () => {
  const client = {
    async get(_url, options) {
      assert.throws(
        () => options.beforeRedirect({ protocol: "http:", hostname: "127.0.0.1", path: "/private.png" }),
        /Private and local network addresses are not allowed/,
      );
      return {
        data: pngHeader(600, 315),
        headers: { "content-type": "image/png" },
      };
    },
  };

  const report = await inspectImage("https://example.com/social.png", { client });
  assert.equal(report.recommendedDimensions, false);
});

test("reads supported JPEG, GIF, and WebP dimensions", async () => {
  const fixtures = [
    ["image/jpeg", "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k="],
    ["image/gif", "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="],
    ["image/webp", "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"],
  ];

  for (const [contentType, base64] of fixtures) {
    const report = await inspectImage(`https://example.com/image.${contentType.split("/")[1]}`, {
      client: {
        async get() {
          return { data: Buffer.from(base64, "base64"), headers: { "content-type": contentType } };
        },
      },
    });
    assert.equal(report.width, 1);
    assert.equal(report.height, 1);
  }
});

test("maps corrupt images and timeouts to safe public errors", async () => {
  await assert.rejects(
    inspectImage("https://example.com/corrupt.png", {
      client: {
        async get() {
          return { data: Buffer.from("not an image"), headers: { "content-type": "image/png" } };
        },
      },
    }),
    /invalid or unsupported/,
  );

  await assert.rejects(
    inspectImage("https://example.com/slow.png", {
      client: {
        async get() {
          const error = new Error("internal timeout details");
          error.code = "ECONNABORTED";
          throw error;
        },
      },
    }),
    /took too long to respond/,
  );
});
