const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function unusedPort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function waitForStartup(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Application did not start in time")),
      5000,
    );

    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Server is running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      clearTimeout(timeout);
      reject(new Error(chunk.toString()));
    });
  });
}

test("rejects requests to private network targets", async (t) => {
  const fixture = http.createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<title>Private fixture must not be fetched</title>");
  });
  const fixturePort = await listen(fixture);
  t.after(() => new Promise((resolve) => fixture.close(resolve)));

  const appPort = await unusedPort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(appPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForStartup(child);

  const target = encodeURIComponent(`http://127.0.0.1:${fixturePort}/`);
  const response = await fetch(`http://127.0.0.1:${appPort}/?url=${target}`);
  const body = await response.text();

  assert.match(body, /Private and local network addresses are not allowed/);
  assert.doesNotMatch(body, /Private fixture must not be fetched/);
});
