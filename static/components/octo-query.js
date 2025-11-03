var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
function noop() {
}
function run(fn) {
  return fn();
}
function blank_object() {
  return /* @__PURE__ */ Object.create(null);
}
function run_all(fns) {
  fns.forEach(run);
}
function is_function(thing) {
  return typeof thing === "function";
}
function safe_not_equal(a, b) {
  return a != a ? b == b : a !== b || a && typeof a === "object" || typeof a === "function";
}
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
  if (element_src === url)
    return true;
  if (!src_url_equal_anchor) {
    src_url_equal_anchor = document.createElement("a");
  }
  src_url_equal_anchor.href = url;
  return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
  return Object.keys(obj).length === 0;
}
function append(target, node) {
  target.appendChild(node);
}
function append_styles(target, style_sheet_id, styles) {
  const append_styles_to = get_root_for_style(target);
  if (!append_styles_to.getElementById(style_sheet_id)) {
    const style = element("style");
    style.id = style_sheet_id;
    style.textContent = styles;
    append_stylesheet(append_styles_to, style);
  }
}
function get_root_for_style(node) {
  if (!node)
    return document;
  const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
  if (root && /** @type {ShadowRoot} */
  root.host) {
    return (
      /** @type {ShadowRoot} */
      root
    );
  }
  return node.ownerDocument;
}
function append_stylesheet(node, style) {
  append(
    /** @type {Document} */
    node.head || node,
    style
  );
  return style.sheet;
}
function insert(target, node, anchor) {
  target.insertBefore(node, anchor || null);
}
function detach(node) {
  if (node.parentNode) {
    node.parentNode.removeChild(node);
  }
}
function destroy_each(iterations, detaching) {
  for (let i = 0; i < iterations.length; i += 1) {
    if (iterations[i])
      iterations[i].d(detaching);
  }
}
function element(name) {
  return document.createElement(name);
}
function text(data) {
  return document.createTextNode(data);
}
function space() {
  return text(" ");
}
function empty() {
  return text("");
}
function listen(node, event, handler, options) {
  node.addEventListener(event, handler, options);
  return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
  if (value == null)
    node.removeAttribute(attribute);
  else if (node.getAttribute(attribute) !== value)
    node.setAttribute(attribute, value);
}
function children(element2) {
  return Array.from(element2.childNodes);
}
function set_data(text2, data) {
  data = "" + data;
  if (text2.data === data)
    return;
  text2.data = /** @type {string} */
  data;
}
function toggle_class(element2, name, toggle) {
  element2.classList.toggle(name, !!toggle);
}
function get_custom_elements_slots(element2) {
  const result = {};
  element2.childNodes.forEach(
    /** @param {Element} node */
    (node) => {
      result[node.slot || "default"] = true;
    }
  );
  return result;
}
let current_component;
function set_current_component(component) {
  current_component = component;
}
function get_current_component() {
  if (!current_component)
    throw new Error("Function called outside component initialization");
  return current_component;
}
function onMount(fn) {
  get_current_component().$$.on_mount.push(fn);
}
const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
  if (!update_scheduled) {
    update_scheduled = true;
    resolved_promise.then(flush);
  }
}
function add_render_callback(fn) {
  render_callbacks.push(fn);
}
const seen_callbacks = /* @__PURE__ */ new Set();
let flushidx = 0;
function flush() {
  if (flushidx !== 0) {
    return;
  }
  const saved_component = current_component;
  do {
    try {
      while (flushidx < dirty_components.length) {
        const component = dirty_components[flushidx];
        flushidx++;
        set_current_component(component);
        update(component.$$);
      }
    } catch (e) {
      dirty_components.length = 0;
      flushidx = 0;
      throw e;
    }
    set_current_component(null);
    dirty_components.length = 0;
    flushidx = 0;
    while (binding_callbacks.length)
      binding_callbacks.pop()();
    for (let i = 0; i < render_callbacks.length; i += 1) {
      const callback = render_callbacks[i];
      if (!seen_callbacks.has(callback)) {
        seen_callbacks.add(callback);
        callback();
      }
    }
    render_callbacks.length = 0;
  } while (dirty_components.length);
  while (flush_callbacks.length) {
    flush_callbacks.pop()();
  }
  update_scheduled = false;
  seen_callbacks.clear();
  set_current_component(saved_component);
}
function update($$) {
  if ($$.fragment !== null) {
    $$.update();
    run_all($$.before_update);
    const dirty = $$.dirty;
    $$.dirty = [-1];
    $$.fragment && $$.fragment.p($$.ctx, dirty);
    $$.after_update.forEach(add_render_callback);
  }
}
function flush_render_callbacks(fns) {
  const filtered = [];
  const targets = [];
  render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
  targets.forEach((c) => c());
  render_callbacks = filtered;
}
const outroing = /* @__PURE__ */ new Set();
function transition_in(block, local) {
  if (block && block.i) {
    outroing.delete(block);
    block.i(local);
  }
}
function ensure_array_like(array_like_or_iterator) {
  return (array_like_or_iterator == null ? void 0 : array_like_or_iterator.length) !== void 0 ? array_like_or_iterator : Array.from(array_like_or_iterator);
}
function mount_component(component, target, anchor) {
  const { fragment, after_update } = component.$$;
  fragment && fragment.m(target, anchor);
  add_render_callback(() => {
    const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
    if (component.$$.on_destroy) {
      component.$$.on_destroy.push(...new_on_destroy);
    } else {
      run_all(new_on_destroy);
    }
    component.$$.on_mount = [];
  });
  after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
  const $$ = component.$$;
  if ($$.fragment !== null) {
    flush_render_callbacks($$.after_update);
    run_all($$.on_destroy);
    $$.fragment && $$.fragment.d(detaching);
    $$.on_destroy = $$.fragment = null;
    $$.ctx = [];
  }
}
function make_dirty(component, i) {
  if (component.$$.dirty[0] === -1) {
    dirty_components.push(component);
    schedule_update();
    component.$$.dirty.fill(0);
  }
  component.$$.dirty[i / 31 | 0] |= 1 << i % 31;
}
function init(component, options, instance2, create_fragment2, not_equal, props, append_styles2 = null, dirty = [-1]) {
  const parent_component = current_component;
  set_current_component(component);
  const $$ = component.$$ = {
    fragment: null,
    ctx: [],
    // state
    props,
    update: noop,
    not_equal,
    bound: blank_object(),
    // lifecycle
    on_mount: [],
    on_destroy: [],
    on_disconnect: [],
    before_update: [],
    after_update: [],
    context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
    // everything else
    callbacks: blank_object(),
    dirty,
    skip_bound: false,
    root: options.target || parent_component.$$.root
  };
  append_styles2 && append_styles2($$.root);
  let ready = false;
  $$.ctx = instance2 ? instance2(component, options.props || {}, (i, ret, ...rest) => {
    const value = rest.length ? rest[0] : ret;
    if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
      if (!$$.skip_bound && $$.bound[i])
        $$.bound[i](value);
      if (ready)
        make_dirty(component, i);
    }
    return ret;
  }) : [];
  $$.update();
  ready = true;
  run_all($$.before_update);
  $$.fragment = create_fragment2 ? create_fragment2($$.ctx) : false;
  if (options.target) {
    if (options.hydrate) {
      const nodes = children(options.target);
      $$.fragment && $$.fragment.l(nodes);
      nodes.forEach(detach);
    } else {
      $$.fragment && $$.fragment.c();
    }
    if (options.intro)
      transition_in(component.$$.fragment);
    mount_component(component, options.target, options.anchor);
    flush();
  }
  set_current_component(parent_component);
}
let SvelteElement;
if (typeof HTMLElement === "function") {
  SvelteElement = class extends HTMLElement {
    constructor($$componentCtor, $$slots, use_shadow_dom) {
      super();
      /** The Svelte component constructor */
      __publicField(this, "$$ctor");
      /** Slots */
      __publicField(this, "$$s");
      /** The Svelte component instance */
      __publicField(this, "$$c");
      /** Whether or not the custom element is connected */
      __publicField(this, "$$cn", false);
      /** Component props data */
      __publicField(this, "$$d", {});
      /** `true` if currently in the process of reflecting component props back to attributes */
      __publicField(this, "$$r", false);
      /** @type {Record<string, CustomElementPropDefinition>} Props definition (name, reflected, type etc) */
      __publicField(this, "$$p_d", {});
      /** @type {Record<string, Function[]>} Event listeners */
      __publicField(this, "$$l", {});
      /** @type {Map<Function, Function>} Event listener unsubscribe functions */
      __publicField(this, "$$l_u", /* @__PURE__ */ new Map());
      this.$$ctor = $$componentCtor;
      this.$$s = $$slots;
      if (use_shadow_dom) {
        this.attachShadow({ mode: "open" });
      }
    }
    addEventListener(type, listener, options) {
      this.$$l[type] = this.$$l[type] || [];
      this.$$l[type].push(listener);
      if (this.$$c) {
        const unsub = this.$$c.$on(type, listener);
        this.$$l_u.set(listener, unsub);
      }
      super.addEventListener(type, listener, options);
    }
    removeEventListener(type, listener, options) {
      super.removeEventListener(type, listener, options);
      if (this.$$c) {
        const unsub = this.$$l_u.get(listener);
        if (unsub) {
          unsub();
          this.$$l_u.delete(listener);
        }
      }
    }
    async connectedCallback() {
      this.$$cn = true;
      if (!this.$$c) {
        let create_slot = function(name) {
          return () => {
            let node;
            const obj = {
              c: function create() {
                node = element("slot");
                if (name !== "default") {
                  attr(node, "name", name);
                }
              },
              /**
               * @param {HTMLElement} target
               * @param {HTMLElement} [anchor]
               */
              m: function mount(target, anchor) {
                insert(target, node, anchor);
              },
              d: function destroy(detaching) {
                if (detaching) {
                  detach(node);
                }
              }
            };
            return obj;
          };
        };
        await Promise.resolve();
        if (!this.$$cn || this.$$c) {
          return;
        }
        const $$slots = {};
        const existing_slots = get_custom_elements_slots(this);
        for (const name of this.$$s) {
          if (name in existing_slots) {
            $$slots[name] = [create_slot(name)];
          }
        }
        for (const attribute of this.attributes) {
          const name = this.$$g_p(attribute.name);
          if (!(name in this.$$d)) {
            this.$$d[name] = get_custom_element_value(name, attribute.value, this.$$p_d, "toProp");
          }
        }
        for (const key in this.$$p_d) {
          if (!(key in this.$$d) && this[key] !== void 0) {
            this.$$d[key] = this[key];
            delete this[key];
          }
        }
        this.$$c = new this.$$ctor({
          target: this.shadowRoot || this,
          props: {
            ...this.$$d,
            $$slots,
            $$scope: {
              ctx: []
            }
          }
        });
        const reflect_attributes = () => {
          this.$$r = true;
          for (const key in this.$$p_d) {
            this.$$d[key] = this.$$c.$$.ctx[this.$$c.$$.props[key]];
            if (this.$$p_d[key].reflect) {
              const attribute_value = get_custom_element_value(
                key,
                this.$$d[key],
                this.$$p_d,
                "toAttribute"
              );
              if (attribute_value == null) {
                this.removeAttribute(this.$$p_d[key].attribute || key);
              } else {
                this.setAttribute(this.$$p_d[key].attribute || key, attribute_value);
              }
            }
          }
          this.$$r = false;
        };
        this.$$c.$$.after_update.push(reflect_attributes);
        reflect_attributes();
        for (const type in this.$$l) {
          for (const listener of this.$$l[type]) {
            const unsub = this.$$c.$on(type, listener);
            this.$$l_u.set(listener, unsub);
          }
        }
        this.$$l = {};
      }
    }
    // We don't need this when working within Svelte code, but for compatibility of people using this outside of Svelte
    // and setting attributes through setAttribute etc, this is helpful
    attributeChangedCallback(attr2, _oldValue, newValue) {
      var _a;
      if (this.$$r)
        return;
      attr2 = this.$$g_p(attr2);
      this.$$d[attr2] = get_custom_element_value(attr2, newValue, this.$$p_d, "toProp");
      (_a = this.$$c) == null ? void 0 : _a.$set({ [attr2]: this.$$d[attr2] });
    }
    disconnectedCallback() {
      this.$$cn = false;
      Promise.resolve().then(() => {
        if (!this.$$cn) {
          this.$$c.$destroy();
          this.$$c = void 0;
        }
      });
    }
    $$g_p(attribute_name) {
      return Object.keys(this.$$p_d).find(
        (key) => this.$$p_d[key].attribute === attribute_name || !this.$$p_d[key].attribute && key.toLowerCase() === attribute_name
      ) || attribute_name;
    }
  };
}
function get_custom_element_value(prop, value, props_definition, transform) {
  var _a;
  const type = (_a = props_definition[prop]) == null ? void 0 : _a.type;
  value = type === "Boolean" && typeof value !== "boolean" ? value != null : value;
  if (!transform || !props_definition[prop]) {
    return value;
  } else if (transform === "toAttribute") {
    switch (type) {
      case "Object":
      case "Array":
        return value == null ? null : JSON.stringify(value);
      case "Boolean":
        return value ? "" : null;
      case "Number":
        return value == null ? null : value;
      default:
        return value;
    }
  } else {
    switch (type) {
      case "Object":
      case "Array":
        return value && JSON.parse(value);
      case "Boolean":
        return value;
      case "Number":
        return value != null ? +value : value;
      default:
        return value;
    }
  }
}
function create_custom_element(Component, props_definition, slots, accessors, use_shadow_dom, extend) {
  let Class = class extends SvelteElement {
    constructor() {
      super(Component, slots, use_shadow_dom);
      this.$$p_d = props_definition;
    }
    static get observedAttributes() {
      return Object.keys(props_definition).map(
        (key) => (props_definition[key].attribute || key).toLowerCase()
      );
    }
  };
  Object.keys(props_definition).forEach((prop) => {
    Object.defineProperty(Class.prototype, prop, {
      get() {
        return this.$$c && prop in this.$$c ? this.$$c[prop] : this.$$d[prop];
      },
      set(value) {
        var _a;
        value = get_custom_element_value(prop, value, props_definition);
        this.$$d[prop] = value;
        (_a = this.$$c) == null ? void 0 : _a.$set({ [prop]: value });
      }
    });
  });
  accessors.forEach((accessor) => {
    Object.defineProperty(Class.prototype, accessor, {
      get() {
        var _a;
        return (_a = this.$$c) == null ? void 0 : _a[accessor];
      }
    });
  });
  if (extend) {
    Class = extend(Class);
  }
  Component.element = /** @type {any} */
  Class;
  return Class;
}
class SvelteComponent {
  constructor() {
    /**
     * ### PRIVATE API
     *
     * Do not use, may change at any time
     *
     * @type {any}
     */
    __publicField(this, "$$");
    /**
     * ### PRIVATE API
     *
     * Do not use, may change at any time
     *
     * @type {any}
     */
    __publicField(this, "$$set");
  }
  /** @returns {void} */
  $destroy() {
    destroy_component(this, 1);
    this.$destroy = noop;
  }
  /**
   * @template {Extract<keyof Events, string>} K
   * @param {K} type
   * @param {((e: Events[K]) => void) | null | undefined} callback
   * @returns {() => void}
   */
  $on(type, callback) {
    if (!is_function(callback)) {
      return noop;
    }
    const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
    callbacks.push(callback);
    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1)
        callbacks.splice(index, 1);
    };
  }
  /**
   * @param {Partial<Props>} props
   * @returns {void}
   */
  $set(props) {
    if (this.$$set && !is_empty(props)) {
      this.$$.skip_bound = true;
      this.$$set(props);
      this.$$.skip_bound = false;
    }
  }
}
const PUBLIC_VERSION = "4";
if (typeof window !== "undefined")
  (window.__svelte || (window.__svelte = { v: /* @__PURE__ */ new Set() })).v.add(PUBLIC_VERSION);
class OctothorpesAPIClient {
  constructor(baseUrl = "https://octothorp.es") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  /**
   * Generic fetch wrapper with error handling
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} JSON response
   */
  async fetch(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Accept": "application/json",
          ...options.headers
        }
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("API fetch failed:", error);
      throw error;
    }
  }
  /**
   * Build query string from multiPass-like parameters
   * @param {Object} params - Query parameters
   * @returns {string} Query string
   */
  buildQueryString(params) {
    const searchParams = new URLSearchParams();
    if (params.s && params.s.length > 0) {
      searchParams.set("s", Array.isArray(params.s) ? params.s.join(",") : params.s);
    }
    if (params.notS && params.notS.length > 0) {
      searchParams.set("not-s", Array.isArray(params.notS) ? params.notS.join(",") : params.notS);
    }
    if (params.o && params.o.length > 0) {
      searchParams.set("o", Array.isArray(params.o) ? params.o.join(",") : params.o);
    }
    if (params.notO && params.notO.length > 0) {
      searchParams.set("not-o", Array.isArray(params.notO) ? params.notO.join(",") : params.notO);
    }
    if (params.match) {
      searchParams.set("match", params.match);
    }
    if (params.limit !== void 0) {
      searchParams.set("limit", params.limit);
    }
    if (params.offset !== void 0) {
      searchParams.set("offset", params.offset);
    }
    if (params.when) {
      searchParams.set("when", params.when);
    }
    if (params.feedtitle) {
      searchParams.set("feedtitle", params.feedtitle);
    }
    if (params.feeddescription) {
      searchParams.set("feeddescription", params.feeddescription);
    }
    if (params.feedauthor) {
      searchParams.set("feedauthor", params.feedauthor);
    }
    if (params.feedimage) {
      searchParams.set("feedimage", params.feedimage);
    }
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : "";
  }
  /**
   * Query the /get API with multiPass-like parameters
   * @param {string} what - What to get (pages, thorpes, everything, etc.)
   * @param {string} by - How to filter (thorped, linked, posted, etc.)
   * @param {Object} params - Query parameters (s, o, not-s, not-o, match, limit, etc.)
   * @param {string} as - Output format (optional: 'rss', 'debug')
   * @returns {Promise<Object>} API response
   */
  async query(what = "everything", by = "posted", params = {}, as = "") {
    const queryString = this.buildQueryString(params);
    const asPath = as ? `/${as}` : "";
    const endpoint = `/get/${what}/${by}${asPath}${queryString}`;
    return this.fetch(endpoint);
  }
  /**
   * Get pages tagged with specific terms
   * @param {string|Array<string>} terms - Terms to filter by
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getPagesThorped(terms, options = {}) {
    return this.query("pages", "thorped", {
      o: terms,
      ...options
    });
  }
  /**
   * Get everything tagged with specific terms
   * @param {string|Array<string>} terms - Terms to filter by
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getEverythingThorped(terms, options = {}) {
    return this.query("everything", "thorped", {
      o: terms,
      ...options
    });
  }
  /**
   * Get pages linked to specific URLs
   * @param {string|Array<string>} urls - URLs to filter by
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getPagesLinked(urls, options = {}) {
    return this.query("pages", "linked", {
      o: urls,
      ...options
    });
  }
  /**
   * Get pages from specific subjects
   * @param {string|Array<string>} subjects - Subject URLs to filter by
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getPagesPosted(subjects, options = {}) {
    return this.query("pages", "posted", {
      s: subjects,
      ...options
    });
  }
  /**
   * Get domains in a webring
   * @param {string} webringUrl - Webring index URL
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getDomainsInWebring(webringUrl, options = {}) {
    return this.query("domains", "in-webring", {
      s: webringUrl,
      ...options
    });
  }
  /**
   * Get pages in a webring
   * @param {string} webringUrl - Webring index URL
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getPagesInWebring(webringUrl, options = {}) {
    return this.query("pages", "in-webring", {
      s: webringUrl,
      ...options
    });
  }
  /**
   * Get data for a specific octothorpe/term
   * @param {string} thorpe - The octothorpe/term to look up
   * @returns {Promise<Object>} API response
   */
  async getThorpe(thorpe) {
    return this.fetch(`/~/${encodeURIComponent(thorpe)}`);
  }
  /**
   * Get backlinks to specific URLs
   * @param {string|Array<string>} urls - URLs to find backlinks for
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getBacklinks(urls, options = {}) {
    return this.query("pages", "backlinked", {
      o: urls,
      ...options
    });
  }
  /**
   * Get bookmarks of specific URLs
   * @param {string|Array<string>} urls - URLs to find bookmarks for
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getBookmarks(urls, options = {}) {
    return this.query("pages", "bookmarked", {
      o: urls,
      ...options
    });
  }
}
new OctothorpesAPIClient();
const createClient = (baseUrl) => new OctothorpesAPIClient(baseUrl);
function add_css(target) {
  append_styles(target, "svelte-e3h7sy", ":host{--octo-primary:#3c7efb;--octo-background:#ffffff;--octo-text:#333333;--octo-border:#e0e0e0;--octo-error:#d32f2f;--octo-spacing:1rem;--octo-radius:4px;display:block;font-family:system-ui, -apple-system, sans-serif;color:var(--octo-text)}.octo-query.svelte-e3h7sy.svelte-e3h7sy{background:var(--octo-background);padding:var(--octo-spacing)}.load-prompt.svelte-e3h7sy.svelte-e3h7sy{text-align:center;padding:calc(var(--octo-spacing) * 2)}.load-button.svelte-e3h7sy.svelte-e3h7sy{background:var(--octo-primary);color:white;border:none;padding:0.75rem 1.5rem;font-size:1rem;border-radius:var(--octo-radius);cursor:pointer;transition:opacity 0.2s}.load-button.svelte-e3h7sy.svelte-e3h7sy:hover{opacity:0.9}.loading-state.svelte-e3h7sy.svelte-e3h7sy{text-align:center;padding:calc(var(--octo-spacing) * 2)}.spinner.svelte-e3h7sy.svelte-e3h7sy{width:40px;height:40px;margin:0 auto var(--octo-spacing);border:4px solid var(--octo-border);border-top-color:var(--octo-primary);border-radius:50%;animation:svelte-e3h7sy-spin 1s linear infinite}@keyframes svelte-e3h7sy-spin{to{transform:rotate(360deg)}}.error-state.svelte-e3h7sy.svelte-e3h7sy{padding:var(--octo-spacing);background:#ffebee;border:1px solid var(--octo-error);border-radius:var(--octo-radius);text-align:center}.error-state.svelte-e3h7sy p.svelte-e3h7sy{color:var(--octo-error);margin:0 0 var(--octo-spacing) 0}.retry-button.svelte-e3h7sy.svelte-e3h7sy{background:var(--octo-error);color:white;border:none;padding:0.5rem 1rem;border-radius:var(--octo-radius);cursor:pointer}.results.svelte-e3h7sy.svelte-e3h7sy{display:flex;flex-direction:column;gap:var(--octo-spacing)}.layout-grid.svelte-e3h7sy.svelte-e3h7sy{display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr))}.layout-compact.svelte-e3h7sy .result-item.svelte-e3h7sy{padding:calc(var(--octo-spacing) / 2)}.result-item.svelte-e3h7sy.svelte-e3h7sy{padding:var(--octo-spacing);border:1px solid var(--octo-border);border-radius:var(--octo-radius);background:var(--octo-background)}.result-title.svelte-e3h7sy.svelte-e3h7sy{margin:0 0 0.5rem 0;font-size:1.25rem}.result-title.svelte-e3h7sy a.svelte-e3h7sy{color:var(--octo-primary);text-decoration:none}.result-title.svelte-e3h7sy a.svelte-e3h7sy:hover{text-decoration:underline}.result-description.svelte-e3h7sy.svelte-e3h7sy{margin:0.5rem 0;color:#666;line-height:1.5}.result-image.svelte-e3h7sy.svelte-e3h7sy{max-width:100%;height:auto;border-radius:var(--octo-radius);margin:0.5rem 0}.result-meta.svelte-e3h7sy.svelte-e3h7sy{margin-top:0.5rem;font-size:0.875rem;color:#666}.result-date.svelte-e3h7sy.svelte-e3h7sy{margin-right:1rem}.result-tags.svelte-e3h7sy.svelte-e3h7sy{display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem}.tag.svelte-e3h7sy.svelte-e3h7sy{display:inline-block;padding:0.25rem 0.5rem;background:#f5f5f5;border-radius:var(--octo-radius);font-size:0.875rem}.tag.bookmark.svelte-e3h7sy.svelte-e3h7sy{background:#fff3e0}.tag.cite.svelte-e3h7sy.svelte-e3h7sy{background:#e8f5e9}.tag.backlink.svelte-e3h7sy.svelte-e3h7sy{background:#e3f2fd}.no-results.svelte-e3h7sy.svelte-e3h7sy{text-align:center;padding:calc(var(--octo-spacing) * 2);color:#666}.load-more.svelte-e3h7sy.svelte-e3h7sy{text-align:center;padding-top:var(--octo-spacing)}.load-more-button.svelte-e3h7sy.svelte-e3h7sy{background:var(--octo-primary);color:white;border:none;padding:0.5rem 1rem;border-radius:var(--octo-radius);cursor:pointer}.load-more-button.svelte-e3h7sy.svelte-e3h7sy:hover{opacity:0.9}");
}
function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[25] = list[i];
  return child_ctx;
}
function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[28] = list[i];
  return child_ctx;
}
function create_if_block_14(ctx) {
  let div;
  let button;
  let t0;
  let t1;
  let t2;
  let t3;
  let t4;
  let t5;
  let mounted;
  let dispose;
  let if_block0 = (
    /*queryParams*/
    ctx[11].s.length > 0 && create_if_block_16(ctx)
  );
  let if_block1 = (
    /*queryParams*/
    ctx[11].o.length > 0 && create_if_block_15(ctx)
  );
  return {
    c() {
      div = element("div");
      button = element("button");
      t0 = text("Load ");
      t1 = text(
        /*what*/
        ctx[1]
      );
      t2 = space();
      t3 = text(
        /*by*/
        ctx[2]
      );
      t4 = space();
      if (if_block0)
        if_block0.c();
      t5 = space();
      if (if_block1)
        if_block1.c();
      attr(button, "class", "load-button svelte-e3h7sy");
      attr(div, "class", "load-prompt svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, div, anchor);
      append(div, button);
      append(button, t0);
      append(button, t1);
      append(button, t2);
      append(button, t3);
      append(button, t4);
      if (if_block0)
        if_block0.m(button, null);
      append(button, t5);
      if (if_block1)
        if_block1.m(button, null);
      if (!mounted) {
        dispose = listen(
          button,
          "click",
          /*loadData*/
          ctx[12]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*what*/
      2)
        set_data(
          t1,
          /*what*/
          ctx2[1]
        );
      if (dirty & /*by*/
      4)
        set_data(
          t3,
          /*by*/
          ctx2[2]
        );
      if (
        /*queryParams*/
        ctx2[11].s.length > 0
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_16(ctx2);
          if_block0.c();
          if_block0.m(button, t5);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*queryParams*/
        ctx2[11].o.length > 0
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_15(ctx2);
          if_block1.c();
          if_block1.m(button, null);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(div);
      }
      if (if_block0)
        if_block0.d();
      if (if_block1)
        if_block1.d();
      mounted = false;
      dispose();
    }
  };
}
function create_if_block_16(ctx) {
  let t0;
  let t1_value = (
    /*queryParams*/
    ctx[11].s.join(", ") + ""
  );
  let t1;
  return {
    c() {
      t0 = text("from ");
      t1 = text(t1_value);
    },
    m(target, anchor) {
      insert(target, t0, anchor);
      insert(target, t1, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*queryParams*/
      2048 && t1_value !== (t1_value = /*queryParams*/
      ctx2[11].s.join(", ") + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(t0);
        detach(t1);
      }
    }
  };
}
function create_if_block_15(ctx) {
  let t0;
  let t1_value = (
    /*queryParams*/
    ctx[11].o.join(", ") + ""
  );
  let t1;
  return {
    c() {
      t0 = text("to ");
      t1 = text(t1_value);
    },
    m(target, anchor) {
      insert(target, t0, anchor);
      insert(target, t1, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*queryParams*/
      2048 && t1_value !== (t1_value = /*queryParams*/
      ctx2[11].o.join(", ") + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(t0);
        detach(t1);
      }
    }
  };
}
function create_if_block_13(ctx) {
  let div1;
  return {
    c() {
      div1 = element("div");
      div1.innerHTML = `<div class="spinner svelte-e3h7sy"></div> <p>Loading...</p>`;
      attr(div1, "class", "loading-state svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, div1, anchor);
    },
    d(detaching) {
      if (detaching) {
        detach(div1);
      }
    }
  };
}
function create_if_block_12(ctx) {
  let div;
  let p;
  let strong;
  let t1;
  let t2;
  let t3;
  let button;
  let mounted;
  let dispose;
  return {
    c() {
      div = element("div");
      p = element("p");
      strong = element("strong");
      strong.textContent = "Error:";
      t1 = space();
      t2 = text(
        /*error*/
        ctx[7]
      );
      t3 = space();
      button = element("button");
      button.textContent = "Retry";
      attr(p, "class", "svelte-e3h7sy");
      attr(button, "class", "retry-button svelte-e3h7sy");
      attr(div, "class", "error-state svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, div, anchor);
      append(div, p);
      append(p, strong);
      append(p, t1);
      append(p, t2);
      append(div, t3);
      append(div, button);
      if (!mounted) {
        dispose = listen(
          button,
          "click",
          /*loadData*/
          ctx[12]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*error*/
      128)
        set_data(
          t2,
          /*error*/
          ctx2[7]
        );
    },
    d(detaching) {
      if (detaching) {
        detach(div);
      }
      mounted = false;
      dispose();
    }
  };
}
function create_if_block(ctx) {
  let div;
  function select_block_type(ctx2, dirty) {
    if (
      /*results*/
      ctx2[10].length === 0
    )
      return create_if_block_1;
    return create_else_block;
  }
  let current_block_type = select_block_type(ctx);
  let if_block = current_block_type(ctx);
  return {
    c() {
      div = element("div");
      if_block.c();
      attr(div, "class", "results svelte-e3h7sy");
      toggle_class(
        div,
        "layout-list",
        /*layout*/
        ctx[4] === "list"
      );
      toggle_class(
        div,
        "layout-grid",
        /*layout*/
        ctx[4] === "grid"
      );
      toggle_class(
        div,
        "layout-compact",
        /*layout*/
        ctx[4] === "compact"
      );
    },
    m(target, anchor) {
      insert(target, div, anchor);
      if_block.m(div, null);
    },
    p(ctx2, dirty) {
      if (current_block_type === (current_block_type = select_block_type(ctx2)) && if_block) {
        if_block.p(ctx2, dirty);
      } else {
        if_block.d(1);
        if_block = current_block_type(ctx2);
        if (if_block) {
          if_block.c();
          if_block.m(div, null);
        }
      }
      if (dirty & /*layout*/
      16) {
        toggle_class(
          div,
          "layout-list",
          /*layout*/
          ctx2[4] === "list"
        );
      }
      if (dirty & /*layout*/
      16) {
        toggle_class(
          div,
          "layout-grid",
          /*layout*/
          ctx2[4] === "grid"
        );
      }
      if (dirty & /*layout*/
      16) {
        toggle_class(
          div,
          "layout-compact",
          /*layout*/
          ctx2[4] === "compact"
        );
      }
    },
    d(detaching) {
      if (detaching) {
        detach(div);
      }
      if_block.d();
    }
  };
}
function create_else_block(ctx) {
  let t;
  let if_block_anchor;
  let each_value = ensure_array_like(
    /*results*/
    ctx[10]
  );
  let each_blocks = [];
  for (let i = 0; i < each_value.length; i += 1) {
    each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
  }
  let if_block = (
    /*results*/
    ctx[10].length >= /*queryParams*/
    ctx[11].limit && create_if_block_2(ctx)
  );
  return {
    c() {
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      t = space();
      if (if_block)
        if_block.c();
      if_block_anchor = empty();
    },
    m(target, anchor) {
      for (let i = 0; i < each_blocks.length; i += 1) {
        if (each_blocks[i]) {
          each_blocks[i].m(target, anchor);
        }
      }
      insert(target, t, anchor);
      if (if_block)
        if_block.m(target, anchor);
      insert(target, if_block_anchor, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*results, formatDate, getTitle, showMetadata, getUrl*/
      1536) {
        each_value = ensure_array_like(
          /*results*/
          ctx2[10]
        );
        let i;
        for (i = 0; i < each_value.length; i += 1) {
          const child_ctx = get_each_context(ctx2, each_value, i);
          if (each_blocks[i]) {
            each_blocks[i].p(child_ctx, dirty);
          } else {
            each_blocks[i] = create_each_block(child_ctx);
            each_blocks[i].c();
            each_blocks[i].m(t.parentNode, t);
          }
        }
        for (; i < each_blocks.length; i += 1) {
          each_blocks[i].d(1);
        }
        each_blocks.length = each_value.length;
      }
      if (
        /*results*/
        ctx2[10].length >= /*queryParams*/
        ctx2[11].limit
      ) {
        if (if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block = create_if_block_2(ctx2);
          if_block.c();
          if_block.m(if_block_anchor.parentNode, if_block_anchor);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(t);
        detach(if_block_anchor);
      }
      destroy_each(each_blocks, detaching);
      if (if_block)
        if_block.d(detaching);
    }
  };
}
function create_if_block_1(ctx) {
  let div;
  return {
    c() {
      div = element("div");
      div.innerHTML = `<p>No results found</p>`;
      attr(div, "class", "no-results svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, div, anchor);
    },
    p: noop,
    d(detaching) {
      if (detaching) {
        detach(div);
      }
    }
  };
}
function create_if_block_3(ctx) {
  let t0;
  let t1;
  let div;
  let t2;
  let if_block0 = (
    /*item*/
    ctx[25].description && create_if_block_11(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[25].image && create_if_block_10(ctx)
  );
  let if_block2 = (
    /*item*/
    ctx[25].date && create_if_block_9(ctx)
  );
  let if_block3 = (
    /*item*/
    ctx[25].octothorpes && /*item*/
    ctx[25].octothorpes.length > 0 && create_if_block_4(ctx)
  );
  return {
    c() {
      if (if_block0)
        if_block0.c();
      t0 = space();
      if (if_block1)
        if_block1.c();
      t1 = space();
      div = element("div");
      if (if_block2)
        if_block2.c();
      t2 = space();
      if (if_block3)
        if_block3.c();
      attr(div, "class", "result-meta svelte-e3h7sy");
    },
    m(target, anchor) {
      if (if_block0)
        if_block0.m(target, anchor);
      insert(target, t0, anchor);
      if (if_block1)
        if_block1.m(target, anchor);
      insert(target, t1, anchor);
      insert(target, div, anchor);
      if (if_block2)
        if_block2.m(div, null);
      append(div, t2);
      if (if_block3)
        if_block3.m(div, null);
    },
    p(ctx2, dirty) {
      if (
        /*item*/
        ctx2[25].description
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_11(ctx2);
          if_block0.c();
          if_block0.m(t0.parentNode, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*item*/
        ctx2[25].image
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_10(ctx2);
          if_block1.c();
          if_block1.m(t1.parentNode, t1);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*item*/
        ctx2[25].date
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_9(ctx2);
          if_block2.c();
          if_block2.m(div, t2);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
      if (
        /*item*/
        ctx2[25].octothorpes && /*item*/
        ctx2[25].octothorpes.length > 0
      ) {
        if (if_block3) {
          if_block3.p(ctx2, dirty);
        } else {
          if_block3 = create_if_block_4(ctx2);
          if_block3.c();
          if_block3.m(div, null);
        }
      } else if (if_block3) {
        if_block3.d(1);
        if_block3 = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(t0);
        detach(t1);
        detach(div);
      }
      if (if_block0)
        if_block0.d(detaching);
      if (if_block1)
        if_block1.d(detaching);
      if (if_block2)
        if_block2.d();
      if (if_block3)
        if_block3.d();
    }
  };
}
function create_if_block_11(ctx) {
  let p;
  let t_value = (
    /*item*/
    ctx[25].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "result-description svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024 && t_value !== (t_value = /*item*/
      ctx2[25].description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_10(ctx) {
  let img;
  let img_src_value;
  let img_alt_value;
  return {
    c() {
      img = element("img");
      if (!src_url_equal(img.src, img_src_value = /*item*/
      ctx[25].image))
        attr(img, "src", img_src_value);
      attr(img, "alt", img_alt_value = getTitle(
        /*item*/
        ctx[25]
      ));
      attr(img, "class", "result-image svelte-e3h7sy");
      attr(img, "loading", "lazy");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024 && !src_url_equal(img.src, img_src_value = /*item*/
      ctx2[25].image)) {
        attr(img, "src", img_src_value);
      }
      if (dirty & /*results*/
      1024 && img_alt_value !== (img_alt_value = getTitle(
        /*item*/
        ctx2[25]
      ))) {
        attr(img, "alt", img_alt_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(img);
      }
    }
  };
}
function create_if_block_9(ctx) {
  let span;
  let t_value = formatDate(
    /*item*/
    ctx[25].date
  ) + "";
  let t;
  return {
    c() {
      span = element("span");
      t = text(t_value);
      attr(span, "class", "result-date svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[25].date
      ) + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_if_block_4(ctx) {
  let div;
  let each_value_1 = ensure_array_like(
    /*item*/
    ctx[25].octothorpes
  );
  let each_blocks = [];
  for (let i = 0; i < each_value_1.length; i += 1) {
    each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
  }
  return {
    c() {
      div = element("div");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      attr(div, "class", "result-tags svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, div, anchor);
      for (let i = 0; i < each_blocks.length; i += 1) {
        if (each_blocks[i]) {
          each_blocks[i].m(div, null);
        }
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024) {
        each_value_1 = ensure_array_like(
          /*item*/
          ctx2[25].octothorpes
        );
        let i;
        for (i = 0; i < each_value_1.length; i += 1) {
          const child_ctx = get_each_context_1(ctx2, each_value_1, i);
          if (each_blocks[i]) {
            each_blocks[i].p(child_ctx, dirty);
          } else {
            each_blocks[i] = create_each_block_1(child_ctx);
            each_blocks[i].c();
            each_blocks[i].m(div, null);
          }
        }
        for (; i < each_blocks.length; i += 1) {
          each_blocks[i].d(1);
        }
        each_blocks.length = each_value_1.length;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(div);
      }
      destroy_each(each_blocks, detaching);
    }
  };
}
function create_if_block_8(ctx) {
  let span;
  let t0;
  let t1_value = (
    /*tag*/
    ctx[28].uri + ""
  );
  let t1;
  return {
    c() {
      span = element("span");
      t0 = text("🔗 ");
      t1 = text(t1_value);
      attr(span, "class", "tag backlink svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t0);
      append(span, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024 && t1_value !== (t1_value = /*tag*/
      ctx2[28].uri + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_if_block_7(ctx) {
  let span;
  let t0;
  let t1_value = (
    /*tag*/
    ctx[28].uri + ""
  );
  let t1;
  return {
    c() {
      span = element("span");
      t0 = text("📝 ");
      t1 = text(t1_value);
      attr(span, "class", "tag cite svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t0);
      append(span, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024 && t1_value !== (t1_value = /*tag*/
      ctx2[28].uri + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_if_block_6(ctx) {
  let span;
  let t0;
  let t1_value = (
    /*tag*/
    ctx[28].uri + ""
  );
  let t1;
  return {
    c() {
      span = element("span");
      t0 = text("🔖 ");
      t1 = text(t1_value);
      attr(span, "class", "tag bookmark svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t0);
      append(span, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024 && t1_value !== (t1_value = /*tag*/
      ctx2[28].uri + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_if_block_5(ctx) {
  let span;
  let t0;
  let t1_value = (
    /*tag*/
    ctx[28] + ""
  );
  let t1;
  return {
    c() {
      span = element("span");
      t0 = text("#");
      t1 = text(t1_value);
      attr(span, "class", "tag svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t0);
      append(span, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024 && t1_value !== (t1_value = /*tag*/
      ctx2[28] + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_each_block_1(ctx) {
  let if_block_anchor;
  function select_block_type_1(ctx2, dirty) {
    if (typeof /*tag*/
    ctx2[28] === "string")
      return create_if_block_5;
    if (
      /*tag*/
      ctx2[28].type === "Bookmark"
    )
      return create_if_block_6;
    if (
      /*tag*/
      ctx2[28].type === "Cite"
    )
      return create_if_block_7;
    if (
      /*tag*/
      ctx2[28].type === "Backlink"
    )
      return create_if_block_8;
  }
  let current_block_type = select_block_type_1(ctx);
  let if_block = current_block_type && current_block_type(ctx);
  return {
    c() {
      if (if_block)
        if_block.c();
      if_block_anchor = empty();
    },
    m(target, anchor) {
      if (if_block)
        if_block.m(target, anchor);
      insert(target, if_block_anchor, anchor);
    },
    p(ctx2, dirty) {
      if (current_block_type === (current_block_type = select_block_type_1(ctx2)) && if_block) {
        if_block.p(ctx2, dirty);
      } else {
        if (if_block)
          if_block.d(1);
        if_block = current_block_type && current_block_type(ctx2);
        if (if_block) {
          if_block.c();
          if_block.m(if_block_anchor.parentNode, if_block_anchor);
        }
      }
    },
    d(detaching) {
      if (detaching) {
        detach(if_block_anchor);
      }
      if (if_block) {
        if_block.d(detaching);
      }
    }
  };
}
function create_each_block(ctx) {
  let article;
  let h3;
  let a;
  let t0_value = getTitle(
    /*item*/
    ctx[25]
  ) + "";
  let t0;
  let a_href_value;
  let t1;
  let if_block = (
    /*showMetadata*/
    ctx[9] && create_if_block_3(ctx)
  );
  return {
    c() {
      article = element("article");
      h3 = element("h3");
      a = element("a");
      t0 = text(t0_value);
      t1 = space();
      if (if_block)
        if_block.c();
      attr(a, "href", a_href_value = getUrl(
        /*item*/
        ctx[25]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-e3h7sy");
      attr(h3, "class", "result-title svelte-e3h7sy");
      attr(article, "class", "result-item svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, article, anchor);
      append(article, h3);
      append(h3, a);
      append(a, t0);
      append(article, t1);
      if (if_block)
        if_block.m(article, null);
    },
    p(ctx2, dirty) {
      if (dirty & /*results*/
      1024 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[25]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*results*/
      1024 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[25]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*showMetadata*/
        ctx2[9]
      ) {
        if (if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block = create_if_block_3(ctx2);
          if_block.c();
          if_block.m(article, null);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(article);
      }
      if (if_block)
        if_block.d();
    }
  };
}
function create_if_block_2(ctx) {
  let div;
  let button;
  let mounted;
  let dispose;
  return {
    c() {
      div = element("div");
      button = element("button");
      button.textContent = "Load more";
      attr(button, "class", "load-more-button svelte-e3h7sy");
      attr(div, "class", "load-more svelte-e3h7sy");
    },
    m(target, anchor) {
      insert(target, div, anchor);
      append(div, button);
      if (!mounted) {
        dispose = listen(
          button,
          "click",
          /*click_handler*/
          ctx[22]
        );
        mounted = true;
      }
    },
    p: noop,
    d(detaching) {
      if (detaching) {
        detach(div);
      }
      mounted = false;
      dispose();
    }
  };
}
function create_fragment(ctx) {
  let div;
  let t0;
  let t1;
  let t2;
  let if_block0 = !/*loaded*/
  ctx[8] && !/*loading*/
  ctx[6] && create_if_block_14(ctx);
  let if_block1 = (
    /*loading*/
    ctx[6] && create_if_block_13()
  );
  let if_block2 = (
    /*error*/
    ctx[7] && create_if_block_12(ctx)
  );
  let if_block3 = (
    /*data*/
    ctx[5] && !/*loading*/
    ctx[6] && create_if_block(ctx)
  );
  return {
    c() {
      div = element("div");
      if (if_block0)
        if_block0.c();
      t0 = space();
      if (if_block1)
        if_block1.c();
      t1 = space();
      if (if_block2)
        if_block2.c();
      t2 = space();
      if (if_block3)
        if_block3.c();
      attr(div, "class", "octo-query svelte-e3h7sy");
      toggle_class(
        div,
        "loading",
        /*loading*/
        ctx[6]
      );
      toggle_class(div, "error", !!/*error*/
      ctx[7]);
    },
    m(target, anchor) {
      insert(target, div, anchor);
      if (if_block0)
        if_block0.m(div, null);
      append(div, t0);
      if (if_block1)
        if_block1.m(div, null);
      append(div, t1);
      if (if_block2)
        if_block2.m(div, null);
      append(div, t2);
      if (if_block3)
        if_block3.m(div, null);
    },
    p(ctx2, [dirty]) {
      if (!/*loaded*/
      ctx2[8] && !/*loading*/
      ctx2[6]) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_14(ctx2);
          if_block0.c();
          if_block0.m(div, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*loading*/
        ctx2[6]
      ) {
        if (if_block1)
          ;
        else {
          if_block1 = create_if_block_13();
          if_block1.c();
          if_block1.m(div, t1);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*error*/
        ctx2[7]
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_12(ctx2);
          if_block2.c();
          if_block2.m(div, t2);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
      if (
        /*data*/
        ctx2[5] && !/*loading*/
        ctx2[6]
      ) {
        if (if_block3) {
          if_block3.p(ctx2, dirty);
        } else {
          if_block3 = create_if_block(ctx2);
          if_block3.c();
          if_block3.m(div, null);
        }
      } else if (if_block3) {
        if_block3.d(1);
        if_block3 = null;
      }
      if (dirty & /*loading*/
      64) {
        toggle_class(
          div,
          "loading",
          /*loading*/
          ctx2[6]
        );
      }
      if (dirty & /*error*/
      128) {
        toggle_class(div, "error", !!/*error*/
        ctx2[7]);
      }
    },
    i: noop,
    o: noop,
    d(detaching) {
      if (detaching) {
        detach(div);
      }
      if (if_block0)
        if_block0.d();
      if (if_block1)
        if_block1.d();
      if (if_block2)
        if_block2.d();
      if (if_block3)
        if_block3.d();
    }
  };
}
function formatDate(timestamp) {
  if (!timestamp)
    return "";
  const date = new Date(parseInt(timestamp));
  return date.toLocaleDateString();
}
function getTitle(item) {
  return item.title || item["@id"] || item.uri || "Untitled";
}
function getUrl(item) {
  return item["@id"] || item.uri || "#";
}
function instance($$self, $$props, $$invalidate) {
  let client;
  let queryParams;
  let results;
  let showMetadata;
  let { server = "https://octothorp.es" } = $$props;
  let { what = "everything" } = $$props;
  let { by = "posted" } = $$props;
  let { s = "" } = $$props;
  let { o = "" } = $$props;
  let { nots = "" } = $$props;
  let { noto = "" } = $$props;
  let { match = "" } = $$props;
  let { limit = "10" } = $$props;
  let { offset = "0" } = $$props;
  let { when = "" } = $$props;
  let { autoload = "false" } = $$props;
  let { layout = "list" } = $$props;
  let { showmeta = "true" } = $$props;
  let data = null;
  let loading = false;
  let error = null;
  let loaded = false;
  const parseList = (str) => {
    if (!str || str.trim() === "")
      return [];
    return str.split(",").map((item) => item.trim()).filter(Boolean);
  };
  async function loadData() {
    if (loading)
      return;
    $$invalidate(6, loading = true);
    $$invalidate(7, error = null);
    try {
      const response = await client.query(what, by, queryParams);
      $$invalidate(5, data = response);
      $$invalidate(8, loaded = true);
    } catch (e) {
      $$invalidate(7, error = e.message);
      console.error("OctoQuery error:", e);
    } finally {
      $$invalidate(6, loading = false);
    }
  }
  onMount(() => {
    if (autoload === "true") {
      loadData();
    }
  });
  const click_handler = () => {
    $$invalidate(0, offset = String(parseInt(offset) + parseInt(limit)));
    loadData();
  };
  $$self.$$set = ($$props2) => {
    if ("server" in $$props2)
      $$invalidate(13, server = $$props2.server);
    if ("what" in $$props2)
      $$invalidate(1, what = $$props2.what);
    if ("by" in $$props2)
      $$invalidate(2, by = $$props2.by);
    if ("s" in $$props2)
      $$invalidate(14, s = $$props2.s);
    if ("o" in $$props2)
      $$invalidate(15, o = $$props2.o);
    if ("nots" in $$props2)
      $$invalidate(16, nots = $$props2.nots);
    if ("noto" in $$props2)
      $$invalidate(17, noto = $$props2.noto);
    if ("match" in $$props2)
      $$invalidate(18, match = $$props2.match);
    if ("limit" in $$props2)
      $$invalidate(3, limit = $$props2.limit);
    if ("offset" in $$props2)
      $$invalidate(0, offset = $$props2.offset);
    if ("when" in $$props2)
      $$invalidate(19, when = $$props2.when);
    if ("autoload" in $$props2)
      $$invalidate(20, autoload = $$props2.autoload);
    if ("layout" in $$props2)
      $$invalidate(4, layout = $$props2.layout);
    if ("showmeta" in $$props2)
      $$invalidate(21, showmeta = $$props2.showmeta);
  };
  $$self.$$.update = () => {
    if ($$self.$$.dirty & /*server*/
    8192) {
      client = createClient(server);
    }
    if ($$self.$$.dirty & /*s, o, nots, noto, match, limit, offset, when*/
    1032201) {
      $$invalidate(11, queryParams = {
        s: parseList(s),
        o: parseList(o),
        notS: parseList(nots),
        notO: parseList(noto),
        match: match || void 0,
        limit: parseInt(limit) || 10,
        offset: parseInt(offset) || 0,
        when: when || void 0
      });
    }
    if ($$self.$$.dirty & /*data*/
    32) {
      $$invalidate(10, results = (data == null ? void 0 : data.results) || []);
    }
    if ($$self.$$.dirty & /*showmeta*/
    2097152) {
      $$invalidate(9, showMetadata = showmeta === "true");
    }
  };
  return [
    offset,
    what,
    by,
    limit,
    layout,
    data,
    loading,
    error,
    loaded,
    showMetadata,
    results,
    queryParams,
    loadData,
    server,
    s,
    o,
    nots,
    noto,
    match,
    when,
    autoload,
    showmeta,
    click_handler
  ];
}
class OctoQuery extends SvelteComponent {
  constructor(options) {
    super();
    init(
      this,
      options,
      instance,
      create_fragment,
      safe_not_equal,
      {
        server: 13,
        what: 1,
        by: 2,
        s: 14,
        o: 15,
        nots: 16,
        noto: 17,
        match: 18,
        limit: 3,
        offset: 0,
        when: 19,
        autoload: 20,
        layout: 4,
        showmeta: 21
      },
      add_css
    );
  }
  get server() {
    return this.$$.ctx[13];
  }
  set server(server) {
    this.$$set({ server });
    flush();
  }
  get what() {
    return this.$$.ctx[1];
  }
  set what(what) {
    this.$$set({ what });
    flush();
  }
  get by() {
    return this.$$.ctx[2];
  }
  set by(by) {
    this.$$set({ by });
    flush();
  }
  get s() {
    return this.$$.ctx[14];
  }
  set s(s) {
    this.$$set({ s });
    flush();
  }
  get o() {
    return this.$$.ctx[15];
  }
  set o(o) {
    this.$$set({ o });
    flush();
  }
  get nots() {
    return this.$$.ctx[16];
  }
  set nots(nots) {
    this.$$set({ nots });
    flush();
  }
  get noto() {
    return this.$$.ctx[17];
  }
  set noto(noto) {
    this.$$set({ noto });
    flush();
  }
  get match() {
    return this.$$.ctx[18];
  }
  set match(match) {
    this.$$set({ match });
    flush();
  }
  get limit() {
    return this.$$.ctx[3];
  }
  set limit(limit) {
    this.$$set({ limit });
    flush();
  }
  get offset() {
    return this.$$.ctx[0];
  }
  set offset(offset) {
    this.$$set({ offset });
    flush();
  }
  get when() {
    return this.$$.ctx[19];
  }
  set when(when) {
    this.$$set({ when });
    flush();
  }
  get autoload() {
    return this.$$.ctx[20];
  }
  set autoload(autoload) {
    this.$$set({ autoload });
    flush();
  }
  get layout() {
    return this.$$.ctx[4];
  }
  set layout(layout) {
    this.$$set({ layout });
    flush();
  }
  get showmeta() {
    return this.$$.ctx[21];
  }
  set showmeta(showmeta) {
    this.$$set({ showmeta });
    flush();
  }
}
customElements.define("octo-query", create_custom_element(OctoQuery, { "server": {}, "what": {}, "by": {}, "s": {}, "o": {}, "nots": {}, "noto": {}, "match": {}, "limit": {}, "offset": {}, "when": {}, "autoload": {}, "layout": {}, "showmeta": {} }, [], [], true));
export {
  OctoQuery as default
};
//# sourceMappingURL=octo-query.js.map
