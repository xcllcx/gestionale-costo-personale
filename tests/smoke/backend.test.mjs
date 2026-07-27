import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp, setAnalyzeImpl } from "../../server/src/index.js";

function listen(app) {
  return new Promise(function (resolve) {
    const server = app.listen(0, "127.0.0.1", function () {
      const { port } = server.address();
      resolve({ server: server, port: port });
    });
  });
}

async function req(port, method, urlPath, body) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise(function (resolve, reject) {
    const r = http.request(
      {
        host: "127.0.0.1",
        port: port,
        path: urlPath,
        method: method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload)
            }
          : {}
      },
      function (res) {
        const chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (err) {
            json = null;
          }
          resolve({ status: res.statusCode, json: json, text: text });
        });
      }
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

test("GET /api/health", async function () {
  const app = createApp({ serveStatic: false });
  const { server, port } = await listen(app);
  try {
    const res = await req(port, "GET", "/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.service, "cv-analyze");
    assert.ok(typeof res.json.openaiConfigured === "boolean");
  } finally {
    server.close();
  }
});

test("POST /api/analyze-cv — payload mancante", async function () {
  setAnalyzeImpl(async function () {
    return { should: "not-run" };
  });
  const app = createApp({ serveStatic: false });
  const { server, port } = await listen(app);
  try {
    const res = await req(port, "POST", "/api/analyze-cv", {});
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, "bad_request");
  } finally {
    server.close();
    setAnalyzeImpl(null);
  }
});

test("POST /api/analyze-cv — mock OK", async function () {
  setAnalyzeImpl(async function () {
    return {
      sourceLanguage: "it",
      outputLanguage: "it",
      primaryInformation: {
        fullName: "Mario Rossi",
        skill: "Technician",
        yearOfBirth: "1990",
        nationality: "Italian",
        languages: ["Italian"],
        address: ""
      },
      summary: "",
      education: [],
      experience: [],
      otherInformation: [],
      warnings: []
    };
  });
  const app = createApp({ serveStatic: false });
  const { server, port } = await listen(app);
  try {
    const res = await req(port, "POST", "/api/analyze-cv", {
      cvText: "Curriculum sintetico di test con contenuto sufficiente.",
      outputLanguage: "same",
      model: "gpt-5.5"
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.analysis.primaryInformation.fullName, "Mario Rossi");
  } finally {
    server.close();
    setAnalyzeImpl(null);
  }
});

test("POST /api/analyze-cv — upstream timeout", async function () {
  setAnalyzeImpl(async function () {
    const err = new Error("timeout");
    err.code = "timeout";
    err.status = 504;
    throw err;
  });
  const app = createApp({ serveStatic: false });
  const { server, port } = await listen(app);
  try {
    const res = await req(port, "POST", "/api/analyze-cv", {
      cvText: "Test timeout payload"
    });
    assert.equal(res.status, 504);
    assert.equal(res.json.error.code, "timeout");
  } finally {
    server.close();
    setAnalyzeImpl(null);
  }
});
