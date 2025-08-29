const handler = require("../api/weather-summary.js");

describe("computeSummary", () => {
  const { computeSummary } = handler._internal;

  test("hot and windy", () => {
    expect(computeSummary(33, 40)).toBe("Hot + Windy");
  });
  test("mild and breezy", () => {
    expect(computeSummary(18, 20)).toBe("Mild + Breezy");
  });
  test("cold and calm", () => {
    expect(computeSummary(0, 5)).toBe("Cold + Calm");
  });
  test("warm threshold", () => {
    expect(computeSummary(22, 14.9)).toBe("Warm + Calm");
  });
});

function makeFetchMock(sequence) {
  let i = 0;
  return jest.fn(async () => {
    const item = sequence[i++];
    if (!item) throw new Error("Unexpected fetch call");
    return {
      ok: item.ok !== false,
      status: item.status ?? 200,
      async json() { return item.json; },
    };
  });
}

function makeRes() {
  return {
    headers: {},
    statusCode: 0,
    body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = JSON.stringify(obj); return this; },
  };
}

describe("handler with mocked upstream", () => {
  test("returns 200 with Prague", async () => {
    global.fetch = makeFetchMock([
      { json: { results: [{ latitude: 50.08, longitude: 14.43 }] } },
      { json: { current: { temperature_2m: 22.1, wind_speed_10m: 12.3 } } },
    ]);

    const req = { method: "GET", query: { city: "Prague" } };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.city).toBe("Prague");
    expect(body.temp_c).toBe(22.1);
    expect(body.wind_kph).toBe(12.3);
    expect(["Mild + Breezy", "Warm + Breezy"]).toContain(body.summary);
  });

  test("400 when missing city", async () => {
    const req = { method: "GET", query: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});
