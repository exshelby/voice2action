const baseUrl = new URL(process.env.SMOKE_BASE_URL || "http://localhost:3000");

async function waitForServer(attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(new URL("/api/health", baseUrl));
      if (response.ok) return response;
    } catch {
      // The application may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Voice2Action did not become healthy at ${baseUrl}.`);
}

async function expectStatus(path, expectedStatus, init) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    ...init,
  });

  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}.`);
  }

  return response;
}

const healthResponse = await waitForServer();
const health = await healthResponse.json();
if (health.status !== "ok" || health.database !== "connected") {
  throw new Error(`Health response was not ready: ${JSON.stringify(health)}`);
}

const operationsResponse = await expectStatus("/operations", 307);
if (operationsResponse.headers.get("location") !== "/operations/login") {
  throw new Error("Unauthenticated operations access did not redirect to sign-in.");
}

await expectStatus("/operations/login", 200);
await expectStatus("/api/feedback", 400, {
  method: "POST",
  body: new FormData(),
});

const unsupported = new FormData();
unsupported.set("audio", new Blob(["not audio"], { type: "text/plain" }), "feedback.txt");
await expectStatus("/api/feedback", 415, {
  method: "POST",
  body: unsupported,
});

console.log(`Smoke checks passed for ${baseUrl}.`);
