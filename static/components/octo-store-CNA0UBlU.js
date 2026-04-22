import { n as noop, s as safe_not_equal } from "./index-D1Aw16Um.js";
function ensure_array_like(array_like_or_iterator) {
  return (array_like_or_iterator == null ? void 0 : array_like_or_iterator.length) !== void 0 ? array_like_or_iterator : Array.from(array_like_or_iterator);
}
const subscriber_queue = [];
function writable(value, start = noop) {
  let stop;
  const subscribers = /* @__PURE__ */ new Set();
  function set(new_value) {
    if (safe_not_equal(value, new_value)) {
      value = new_value;
      if (stop) {
        const run_queue = !subscriber_queue.length;
        for (const subscriber of subscribers) {
          subscriber[1]();
          subscriber_queue.push(subscriber, value);
        }
        if (run_queue) {
          for (let i = 0; i < subscriber_queue.length; i += 2) {
            subscriber_queue[i][0](subscriber_queue[i + 1]);
          }
          subscriber_queue.length = 0;
        }
      }
    }
  }
  function update(fn) {
    set(fn(value));
  }
  function subscribe(run, invalidate = noop) {
    const subscriber = [run, invalidate];
    subscribers.add(subscriber);
    if (subscribers.size === 1) {
      stop = start(set, update) || noop;
    }
    run(value);
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0 && stop) {
        stop();
        stop = null;
      }
    };
  }
  return { set, update, subscribe };
}
function createOctoQuery(what, by) {
  const { subscribe, set, update } = writable({
    results: [],
    loading: false,
    error: null,
    count: 0
  });
  async function fetch(params = {}) {
    const {
      server = "https://octothorp.es",
      s = "",
      o = "",
      nots = "",
      noto = "",
      match = "",
      limit = "10",
      offset = "0",
      when = "",
      rt = "",
      subtype = ""
    } = params;
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      const searchParams = new URLSearchParams();
      if (s)
        searchParams.set("s", Array.isArray(s) ? s.join(",") : s);
      if (o)
        searchParams.set("o", Array.isArray(o) ? o.join(",") : o);
      if (nots)
        searchParams.set("not-s", Array.isArray(nots) ? nots.join(",") : nots);
      if (noto)
        searchParams.set("not-o", Array.isArray(noto) ? noto.join(",") : noto);
      if (match)
        searchParams.set("match", match);
      if (limit)
        searchParams.set("limit", limit);
      if (offset)
        searchParams.set("offset", offset);
      if (when)
        searchParams.set("when", when);
      if (rt)
        searchParams.set("rt", Array.isArray(rt) ? rt.join(",") : rt);
      if (subtype)
        searchParams.set("subtype", subtype);
      const queryString = searchParams.toString();
      const normalizedServer = server.replace(/\/$/, "");
      const url = `${normalizedServer}/get/${what}/${by}${queryString ? "?" + queryString : ""}`;
      const response = await globalThis.fetch(url, {
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const results = data.results || [];
      set({
        results,
        loading: false,
        error: null,
        count: results.length
      });
      return results;
    } catch (error) {
      const errorMessage = error.message || "Unknown error occurred";
      set({
        results: [],
        loading: false,
        error: errorMessage,
        count: 0
      });
      throw error;
    }
  }
  function reset() {
    set({
      results: [],
      loading: false,
      error: null,
      count: 0
    });
  }
  return {
    subscribe,
    fetch,
    reset
  };
}
export {
  createOctoQuery as c,
  ensure_array_like as e
};
//# sourceMappingURL=octo-store-CNA0UBlU.js.map
