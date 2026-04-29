import { c as create_custom_element, S as SvelteComponent, i as init, f as flush, s as safe_not_equal, a as append_styles, e as empty, b as insert, n as noop, d as detach, o as onMount, j as element, u as src_url_equal, l as attr, m as append } from "./index-C1gcNmBK.js";
function add_css(target) {
  append_styles(target, "svelte-mne1ep", "a.svelte-mne1ep{display:inline-block;line-height:0}img.svelte-mne1ep{image-rendering:pixelated}");
}
function create_if_block(ctx) {
  let a;
  let img;
  let img_src_value;
  return {
    c() {
      a = element("a");
      img = element("img");
      if (!src_url_equal(img.src, img_src_value = /*badgeUrl*/
      ctx[1]))
        attr(img, "src", img_src_value);
      attr(img, "alt", "Octothorpes Protocol");
      attr(img, "width", "88");
      attr(img, "height", "31");
      attr(img, "class", "svelte-mne1ep");
      attr(
        a,
        "href",
        /*server*/
        ctx[0]
      );
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-mne1ep");
    },
    m(target, anchor) {
      insert(target, a, anchor);
      append(a, img);
    },
    p(ctx2, dirty) {
      if (dirty & /*badgeUrl*/
      2 && !src_url_equal(img.src, img_src_value = /*badgeUrl*/
      ctx2[1])) {
        attr(img, "src", img_src_value);
      }
      if (dirty & /*server*/
      1) {
        attr(
          a,
          "href",
          /*server*/
          ctx2[0]
        );
      }
    },
    d(detaching) {
      if (detaching) {
        detach(a);
      }
    }
  };
}
function create_fragment(ctx) {
  let if_block_anchor;
  let if_block = (
    /*badgeUrl*/
    ctx[1] && create_if_block(ctx)
  );
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
    p(ctx2, [dirty]) {
      if (
        /*badgeUrl*/
        ctx2[1]
      ) {
        if (if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block = create_if_block(ctx2);
          if_block.c();
          if_block.m(if_block_anchor.parentNode, if_block_anchor);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }
    },
    i: noop,
    o: noop,
    d(detaching) {
      if (detaching) {
        detach(if_block_anchor);
      }
      if (if_block)
        if_block.d(detaching);
    }
  };
}
function instance($$self, $$props, $$invalidate) {
  let { server = "https://octothorp.es" } = $$props;
  let { uri = "" } = $$props;
  let { as = "" } = $$props;
  let badgeUrl = "";
  onMount(() => {
    const pageUri = uri || window.location.href;
    const params = new URLSearchParams();
    params.set("uri", pageUri);
    if (as)
      params.set("as", as);
    $$invalidate(1, badgeUrl = `${server.replace(/\/+$/, "")}/badge?${params.toString()}`);
  });
  $$self.$$set = ($$props2) => {
    if ("server" in $$props2)
      $$invalidate(0, server = $$props2.server);
    if ("uri" in $$props2)
      $$invalidate(2, uri = $$props2.uri);
    if ("as" in $$props2)
      $$invalidate(3, as = $$props2.as);
  };
  return [server, badgeUrl, uri, as];
}
class OctoBadge extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance, create_fragment, safe_not_equal, { server: 0, uri: 2, as: 3 }, add_css);
  }
  get server() {
    return this.$$.ctx[0];
  }
  set server(server) {
    this.$$set({ server });
    flush();
  }
  get uri() {
    return this.$$.ctx[2];
  }
  set uri(uri) {
    this.$$set({ uri });
    flush();
  }
  get as() {
    return this.$$.ctx[3];
  }
  set as(as) {
    this.$$set({ as });
    flush();
  }
}
customElements.define("octo-badge", create_custom_element(OctoBadge, { "server": {}, "uri": {}, "as": {} }, [], [], true));
export {
  OctoBadge as default
};
//# sourceMappingURL=octo-badge.js.map
