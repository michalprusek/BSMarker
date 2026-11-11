import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { TOKEN_KEY } from "../../utils/storage";

/** An unsigned JWT that expires `seconds` from now (the client never verifies it). */
const tokenExpiringIn = (seconds: number, sub = "1") => {
  const payload = { sub, exp: Math.floor(Date.now() / 1000) + seconds };
  return `x.${btoa(JSON.stringify(payload))}.x`;
};

/** Load a fresh copy of the API module (it schedules the refresh on import). */
const loadApi = (adapter: AxiosAdapter) => {
  let api!: typeof import("../api").default;
  jest.isolateModules(() => {
    api = require("../api").default;
  });
  api.defaults.adapter = adapter;
  return api;
};

/** Advance fake timers, then let the axios promise chain settle (Jest 27 has no *Async variant). */
const advance = async (ms: number) => {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const ok = (config: InternalAxiosRequestConfig, data: unknown) =>
  Promise.resolve({ data, status: 200, statusText: "OK", headers: {}, config });

describe("session keep-alive", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => jest.useRealTimers());

  it("refreshes a token restored from storage (page reload) before it expires", async () => {
    localStorage.setItem(TOKEN_KEY, tokenExpiringIn(10 * 60));
    const fresh = tokenExpiringIn(30 * 60);
    const adapter = jest.fn((config: InternalAxiosRequestConfig) =>
      ok(config, { access_token: fresh, token_type: "bearer" }),
    );
    loadApi(adapter);

    await advance(4 * 60 * 1000);
    expect(adapter).not.toHaveBeenCalled();

    await advance(60 * 1000 + 1);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].url).toBe("/auth/refresh");
    expect(localStorage.getItem(TOKEN_KEY)).toBe(fresh);
  });

  it("keeps the session and retries when the refresh fails on the network", async () => {
    const original = tokenExpiringIn(5 * 60);
    localStorage.setItem(TOKEN_KEY, original);
    const fresh = tokenExpiringIn(30 * 60);
    const adapter = jest
      .fn()
      .mockImplementationOnce(() =>
        Promise.reject(Object.assign(new Error("Network Error"), { isAxiosError: true })),
      )
      .mockImplementation((config: InternalAxiosRequestConfig) =>
        ok(config, { access_token: fresh, token_type: "bearer" }),
      );
    loadApi(adapter);

    await advance(1);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(original);

    await advance(30 * 1000);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(fresh);
  });

  it("keeps retrying through a server error (e.g. a backend redeploy)", async () => {
    localStorage.setItem(TOKEN_KEY, tokenExpiringIn(5 * 60));
    const fresh = tokenExpiringIn(30 * 60);
    const adapter = jest
      .fn()
      .mockImplementationOnce((config: InternalAxiosRequestConfig) =>
        Promise.reject(
          Object.assign(new Error("Bad Gateway"), {
            isAxiosError: true,
            config,
            response: { status: 502, data: {}, headers: {}, config },
          }),
        ),
      )
      .mockImplementation((config: InternalAxiosRequestConfig) =>
        ok(config, { access_token: fresh, token_type: "bearer" }),
      );
    loadApi(adapter);

    await advance(1);
    await advance(30 * 1000);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(fresh);
  });

  it("does not bring a token back after a logout during the refresh", async () => {
    localStorage.setItem(TOKEN_KEY, tokenExpiringIn(5 * 60));
    let respond!: () => void;
    const adapter = jest.fn(
      (config: InternalAxiosRequestConfig) =>
        new Promise<Awaited<ReturnType<typeof ok>>>((resolve) => {
          respond = () =>
            resolve(ok(config, { access_token: tokenExpiringIn(1800), token_type: "bearer" }));
        }),
    );
    loadApi(adapter);

    await advance(1);
    expect(adapter).toHaveBeenCalledTimes(1);
    localStorage.removeItem(TOKEN_KEY); // logout while the request is in flight
    respond();
    await advance(1);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("does nothing without a token or with an already expired one", async () => {
    const adapter = jest.fn();
    loadApi(adapter);
    localStorage.setItem(TOKEN_KEY, tokenExpiringIn(-60));
    loadApi(adapter);
    await advance(60 * 60 * 1000);
    expect(adapter).not.toHaveBeenCalled();
  });
});
