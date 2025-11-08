import { c as create_custom_element, S as SvelteComponent, i as init, f as flush, s as safe_not_equal, a as append_styles, e as empty, b as insert, n as noop, d as detach, g as component_subscribe, o as onMount, h as createOctoQuery, j as element, k as space, l as attr, m as append, t as text, p as listen, q as set_data, r as ensure_array_like, u as destroy_each, v as src_url_equal } from "./octo-store-BQMJOIgq.js";
function add_css(target) {
  append_styles(target, "svelte-10h7usx", ":host{--octo-font:system-ui, -apple-system, sans-serif;--octo-primary:#3c7efb;--octo-background:#ffffff;--octo-text:#333333;--octo-border:#e0e0e0;--octo-error:#d32f2f;--octo-spacing:1rem;--octo-radius:4px;display:block;font-family:var(--octo-font);color:var(--octo-text)}.octo-thorpe.svelte-10h7usx.svelte-10h7usx{background:var(--octo-background)}.count.svelte-10h7usx.svelte-10h7usx,.count-loading.svelte-10h7usx.svelte-10h7usx,.count-error.svelte-10h7usx.svelte-10h7usx{font-weight:bold}.count-loading.svelte-10h7usx.svelte-10h7usx{opacity:0.5}.count-error.svelte-10h7usx.svelte-10h7usx{color:var(--octo-error)}.load-button.svelte-10h7usx.svelte-10h7usx,.retry-button.svelte-10h7usx.svelte-10h7usx{background:var(--octo-primary);color:white;border:none;padding:0.75rem 1.5rem;font-size:1rem;font-family:var(--octo-font);border-radius:var(--octo-radius);cursor:pointer;transition:opacity 0.2s}.load-button.svelte-10h7usx.svelte-10h7usx:hover,.retry-button.svelte-10h7usx.svelte-10h7usx:hover{opacity:0.9}.retry-button.svelte-10h7usx.svelte-10h7usx{background:var(--octo-error)}.loading.svelte-10h7usx.svelte-10h7usx{text-align:center;padding:calc(var(--octo-spacing) * 2)}.spinner.svelte-10h7usx.svelte-10h7usx{width:40px;height:40px;margin:0 auto var(--octo-spacing);border:4px solid var(--octo-border);border-top-color:var(--octo-primary);border-radius:50%;animation:svelte-10h7usx-spin 1s linear infinite}@keyframes svelte-10h7usx-spin{to{transform:rotate(360deg)}}.loading.svelte-10h7usx p.svelte-10h7usx{margin:0;color:#666}.error.svelte-10h7usx.svelte-10h7usx{padding:var(--octo-spacing);background:#ffebee;border:1px solid var(--octo-error);border-radius:var(--octo-radius);text-align:center}.error.svelte-10h7usx p.svelte-10h7usx{color:var(--octo-error);margin:0 0 var(--octo-spacing) 0}.list.svelte-10h7usx.svelte-10h7usx{list-style:none;padding:0;margin:0}.list.svelte-10h7usx li.svelte-10h7usx{padding:var(--octo-spacing);border-bottom:1px solid var(--octo-border)}.list.svelte-10h7usx li.svelte-10h7usx:last-child{border-bottom:none}.cards.svelte-10h7usx.svelte-10h7usx{display:grid;grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));gap:var(--octo-spacing)}.card.svelte-10h7usx.svelte-10h7usx{padding:var(--octo-spacing);border:1px solid var(--octo-border);border-radius:var(--octo-radius);background:var(--octo-background)}.card.svelte-10h7usx img.svelte-10h7usx{width:100%;height:auto;border-radius:var(--octo-radius);margin-bottom:0.5rem}.card.svelte-10h7usx h3.svelte-10h7usx{margin:0 0 0.5rem 0;font-size:1.125rem}.compact.svelte-10h7usx.svelte-10h7usx{line-height:1.5}a.svelte-10h7usx.svelte-10h7usx{color:var(--octo-primary);text-decoration:none}a.svelte-10h7usx.svelte-10h7usx:hover{text-decoration:underline}.description.svelte-10h7usx.svelte-10h7usx{margin:0.5rem 0 0 0;color:#666;font-size:0.875rem;line-height:1.4}.date.svelte-10h7usx.svelte-10h7usx{display:block;margin-top:0.25rem;font-size:0.75rem;color:#999}.meta.svelte-10h7usx.svelte-10h7usx{margin-top:var(--octo-spacing);padding-top:var(--octo-spacing);border-top:1px solid var(--octo-border);text-align:right}.result-count.svelte-10h7usx.svelte-10h7usx{font-size:0.875rem;color:#666}");
}
function get_each_context_2(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[14] = list[i];
  child_ctx[20] = i;
  return child_ctx;
}
function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[14] = list[i];
  return child_ctx;
}
function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[14] = list[i];
  return child_ctx;
}
function create_else_block_1(ctx) {
  let div;
  let t0;
  let t1;
  let t2;
  let if_block0 = !/*$query*/
  ctx[2].results.length && !/*$query*/
  ctx[2].loading && !/*$query*/
  ctx[2].error && create_if_block_15(ctx);
  let if_block1 = (
    /*$query*/
    ctx[2].loading && create_if_block_14()
  );
  let if_block2 = (
    /*$query*/
    ctx[2].error && create_if_block_13(ctx)
  );
  let if_block3 = (
    /*$query*/
    ctx[2].results.length > 0 && !/*$query*/
    ctx[2].loading && create_if_block_3(ctx)
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
      attr(div, "class", "octo-thorpe svelte-10h7usx");
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
    p(ctx2, dirty) {
      if (!/*$query*/
      ctx2[2].results.length && !/*$query*/
      ctx2[2].loading && !/*$query*/
      ctx2[2].error) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_15(ctx2);
          if_block0.c();
          if_block0.m(div, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*$query*/
        ctx2[2].loading
      ) {
        if (if_block1)
          ;
        else {
          if_block1 = create_if_block_14();
          if_block1.c();
          if_block1.m(div, t1);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*$query*/
        ctx2[2].error
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_13(ctx2);
          if_block2.c();
          if_block2.m(div, t2);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
      if (
        /*$query*/
        ctx2[2].results.length > 0 && !/*$query*/
        ctx2[2].loading
      ) {
        if (if_block3) {
          if_block3.p(ctx2, dirty);
        } else {
          if_block3 = create_if_block_3(ctx2);
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
function create_if_block(ctx) {
  let if_block_anchor;
  function select_block_type_1(ctx2, dirty) {
    if (
      /*$query*/
      ctx2[2].loading
    )
      return create_if_block_1;
    if (
      /*$query*/
      ctx2[2].error
    )
      return create_if_block_2;
    return create_else_block;
  }
  let current_block_type = select_block_type_1(ctx);
  let if_block = current_block_type(ctx);
  return {
    c() {
      if_block.c();
      if_block_anchor = empty();
    },
    m(target, anchor) {
      if_block.m(target, anchor);
      insert(target, if_block_anchor, anchor);
    },
    p(ctx2, dirty) {
      if (current_block_type === (current_block_type = select_block_type_1(ctx2)) && if_block) {
        if_block.p(ctx2, dirty);
      } else {
        if_block.d(1);
        if_block = current_block_type(ctx2);
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
      if_block.d(detaching);
    }
  };
}
function create_if_block_15(ctx) {
  let button;
  let t0;
  let t1_value = (
    /*o*/
    (ctx[0] || "octothorpes") + ""
  );
  let t1;
  let t2;
  let mounted;
  let dispose;
  return {
    c() {
      button = element("button");
      t0 = text('Load pages tagged "');
      t1 = text(t1_value);
      t2 = text('"');
      attr(button, "class", "load-button svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, button, anchor);
      append(button, t0);
      append(button, t1);
      append(button, t2);
      if (!mounted) {
        dispose = listen(
          button,
          "click",
          /*load*/
          ctx[4]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*o*/
      1 && t1_value !== (t1_value = /*o*/
      (ctx2[0] || "octothorpes") + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(button);
      }
      mounted = false;
      dispose();
    }
  };
}
function create_if_block_14(ctx) {
  let div1;
  return {
    c() {
      div1 = element("div");
      div1.innerHTML = `<div class="spinner svelte-10h7usx"></div> <p class="svelte-10h7usx">Loading...</p>`;
      attr(div1, "class", "loading svelte-10h7usx");
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
function create_if_block_13(ctx) {
  let div;
  let p;
  let strong;
  let t1;
  let t2_value = (
    /*$query*/
    ctx[2].error + ""
  );
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
      t2 = text(t2_value);
      t3 = space();
      button = element("button");
      button.textContent = "Retry";
      attr(p, "class", "svelte-10h7usx");
      attr(button, "class", "retry-button svelte-10h7usx");
      attr(div, "class", "error svelte-10h7usx");
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
          /*load*/
          ctx[4]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t2_value !== (t2_value = /*$query*/
      ctx2[2].error + ""))
        set_data(t2, t2_value);
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
function create_if_block_3(ctx) {
  let t0;
  let div;
  let span;
  let t1_value = (
    /*$query*/
    ctx[2].count + ""
  );
  let t1;
  let t2;
  let t3_value = (
    /*$query*/
    ctx[2].count === 1 ? "" : "s"
  );
  let t3;
  function select_block_type_2(ctx2, dirty) {
    if (
      /*render*/
      ctx2[1] === "list"
    )
      return create_if_block_4;
    if (
      /*render*/
      ctx2[1] === "cards"
    )
      return create_if_block_7;
    if (
      /*render*/
      ctx2[1] === "compact"
    )
      return create_if_block_11;
  }
  let current_block_type = select_block_type_2(ctx);
  let if_block = current_block_type && current_block_type(ctx);
  return {
    c() {
      if (if_block)
        if_block.c();
      t0 = space();
      div = element("div");
      span = element("span");
      t1 = text(t1_value);
      t2 = text(" result");
      t3 = text(t3_value);
      attr(span, "class", "result-count svelte-10h7usx");
      attr(div, "class", "meta svelte-10h7usx");
    },
    m(target, anchor) {
      if (if_block)
        if_block.m(target, anchor);
      insert(target, t0, anchor);
      insert(target, div, anchor);
      append(div, span);
      append(span, t1);
      append(span, t2);
      append(span, t3);
    },
    p(ctx2, dirty) {
      if (current_block_type === (current_block_type = select_block_type_2(ctx2)) && if_block) {
        if_block.p(ctx2, dirty);
      } else {
        if (if_block)
          if_block.d(1);
        if_block = current_block_type && current_block_type(ctx2);
        if (if_block) {
          if_block.c();
          if_block.m(t0.parentNode, t0);
        }
      }
      if (dirty & /*$query*/
      4 && t1_value !== (t1_value = /*$query*/
      ctx2[2].count + ""))
        set_data(t1, t1_value);
      if (dirty & /*$query*/
      4 && t3_value !== (t3_value = /*$query*/
      ctx2[2].count === 1 ? "" : "s"))
        set_data(t3, t3_value);
    },
    d(detaching) {
      if (detaching) {
        detach(t0);
        detach(div);
      }
      if (if_block) {
        if_block.d(detaching);
      }
    }
  };
}
function create_if_block_11(ctx) {
  let div;
  let each_value_2 = ensure_array_like(
    /*$query*/
    ctx[2].results
  );
  let each_blocks = [];
  for (let i = 0; i < each_value_2.length; i += 1) {
    each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
  }
  return {
    c() {
      div = element("div");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      attr(div, "class", "compact svelte-10h7usx");
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
      if (dirty & /*$query, getUrl, getTitle*/
      4) {
        each_value_2 = ensure_array_like(
          /*$query*/
          ctx2[2].results
        );
        let i;
        for (i = 0; i < each_value_2.length; i += 1) {
          const child_ctx = get_each_context_2(ctx2, each_value_2, i);
          if (each_blocks[i]) {
            each_blocks[i].p(child_ctx, dirty);
          } else {
            each_blocks[i] = create_each_block_2(child_ctx);
            each_blocks[i].c();
            each_blocks[i].m(div, null);
          }
        }
        for (; i < each_blocks.length; i += 1) {
          each_blocks[i].d(1);
        }
        each_blocks.length = each_value_2.length;
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
function create_if_block_7(ctx) {
  let div;
  let each_value_1 = ensure_array_like(
    /*$query*/
    ctx[2].results
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
      attr(div, "class", "cards svelte-10h7usx");
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
      if (dirty & /*formatDate, $query, getUrl, getTitle*/
      4) {
        each_value_1 = ensure_array_like(
          /*$query*/
          ctx2[2].results
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
function create_if_block_4(ctx) {
  let ul;
  let each_value = ensure_array_like(
    /*$query*/
    ctx[2].results
  );
  let each_blocks = [];
  for (let i = 0; i < each_value.length; i += 1) {
    each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
  }
  return {
    c() {
      ul = element("ul");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      attr(ul, "class", "list svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, ul, anchor);
      for (let i = 0; i < each_blocks.length; i += 1) {
        if (each_blocks[i]) {
          each_blocks[i].m(ul, null);
        }
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*formatDate, $query, getUrl, getTitle*/
      4) {
        each_value = ensure_array_like(
          /*$query*/
          ctx2[2].results
        );
        let i;
        for (i = 0; i < each_value.length; i += 1) {
          const child_ctx = get_each_context(ctx2, each_value, i);
          if (each_blocks[i]) {
            each_blocks[i].p(child_ctx, dirty);
          } else {
            each_blocks[i] = create_each_block(child_ctx);
            each_blocks[i].c();
            each_blocks[i].m(ul, null);
          }
        }
        for (; i < each_blocks.length; i += 1) {
          each_blocks[i].d(1);
        }
        each_blocks.length = each_value.length;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(ul);
      }
      destroy_each(each_blocks, detaching);
    }
  };
}
function create_if_block_12(ctx) {
  let t;
  return {
    c() {
      t = text(",");
    },
    m(target, anchor) {
      insert(target, t, anchor);
    },
    d(detaching) {
      if (detaching) {
        detach(t);
      }
    }
  };
}
function create_each_block_2(ctx) {
  let a;
  let t0_value = getTitle(
    /*item*/
    ctx[14]
  ) + "";
  let t0;
  let t1;
  let a_href_value;
  let if_block_anchor;
  let if_block = (
    /*i*/
    ctx[20] < /*$query*/
    ctx[2].results.length - 1 && create_if_block_12()
  );
  return {
    c() {
      a = element("a");
      t0 = text(t0_value);
      t1 = space();
      if (if_block)
        if_block.c();
      if_block_anchor = empty();
      attr(a, "href", a_href_value = getUrl(
        /*item*/
        ctx[14]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, a, anchor);
      append(a, t0);
      append(a, t1);
      if (if_block)
        if_block.m(target, anchor);
      insert(target, if_block_anchor, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[14]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*$query*/
      4 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[14]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*i*/
        ctx2[20] < /*$query*/
        ctx2[2].results.length - 1
      ) {
        if (if_block)
          ;
        else {
          if_block = create_if_block_12();
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
        detach(a);
        detach(if_block_anchor);
      }
      if (if_block)
        if_block.d(detaching);
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
      ctx[14].image))
        attr(img, "src", img_src_value);
      attr(img, "alt", img_alt_value = getTitle(
        /*item*/
        ctx[14]
      ));
      attr(img, "loading", "lazy");
      attr(img, "class", "svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && !src_url_equal(img.src, img_src_value = /*item*/
      ctx2[14].image)) {
        attr(img, "src", img_src_value);
      }
      if (dirty & /*$query*/
      4 && img_alt_value !== (img_alt_value = getTitle(
        /*item*/
        ctx2[14]
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
  let p;
  let t_value = (
    /*item*/
    ctx[14].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = /*item*/
      ctx2[14].description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_8(ctx) {
  let time;
  let t_value = formatDate(
    /*item*/
    ctx[14].date
  ) + "";
  let t;
  return {
    c() {
      time = element("time");
      t = text(t_value);
      attr(time, "class", "date svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, time, anchor);
      append(time, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[14].date
      ) + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(time);
      }
    }
  };
}
function create_each_block_1(ctx) {
  let article;
  let t0;
  let h3;
  let a;
  let t1_value = getTitle(
    /*item*/
    ctx[14]
  ) + "";
  let t1;
  let a_href_value;
  let t2;
  let t3;
  let t4;
  let if_block0 = (
    /*item*/
    ctx[14].image && create_if_block_10(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[14].description && create_if_block_9(ctx)
  );
  let if_block2 = (
    /*item*/
    ctx[14].date && create_if_block_8(ctx)
  );
  return {
    c() {
      article = element("article");
      if (if_block0)
        if_block0.c();
      t0 = space();
      h3 = element("h3");
      a = element("a");
      t1 = text(t1_value);
      t2 = space();
      if (if_block1)
        if_block1.c();
      t3 = space();
      if (if_block2)
        if_block2.c();
      t4 = space();
      attr(a, "href", a_href_value = getUrl(
        /*item*/
        ctx[14]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-10h7usx");
      attr(h3, "class", "svelte-10h7usx");
      attr(article, "class", "card svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, article, anchor);
      if (if_block0)
        if_block0.m(article, null);
      append(article, t0);
      append(article, h3);
      append(h3, a);
      append(a, t1);
      append(article, t2);
      if (if_block1)
        if_block1.m(article, null);
      append(article, t3);
      if (if_block2)
        if_block2.m(article, null);
      append(article, t4);
    },
    p(ctx2, dirty) {
      if (
        /*item*/
        ctx2[14].image
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_10(ctx2);
          if_block0.c();
          if_block0.m(article, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (dirty & /*$query*/
      4 && t1_value !== (t1_value = getTitle(
        /*item*/
        ctx2[14]
      ) + ""))
        set_data(t1, t1_value);
      if (dirty & /*$query*/
      4 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[14]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[14].description
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_9(ctx2);
          if_block1.c();
          if_block1.m(article, t3);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*item*/
        ctx2[14].date
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_8(ctx2);
          if_block2.c();
          if_block2.m(article, t4);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(article);
      }
      if (if_block0)
        if_block0.d();
      if (if_block1)
        if_block1.d();
      if (if_block2)
        if_block2.d();
    }
  };
}
function create_if_block_6(ctx) {
  let p;
  let t_value = (
    /*item*/
    ctx[14].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = /*item*/
      ctx2[14].description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_5(ctx) {
  let time;
  let t_value = formatDate(
    /*item*/
    ctx[14].date
  ) + "";
  let t;
  return {
    c() {
      time = element("time");
      t = text(t_value);
      attr(time, "class", "date svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, time, anchor);
      append(time, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[14].date
      ) + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(time);
      }
    }
  };
}
function create_each_block(ctx) {
  let li;
  let a;
  let t0_value = getTitle(
    /*item*/
    ctx[14]
  ) + "";
  let t0;
  let a_href_value;
  let t1;
  let t2;
  let t3;
  let if_block0 = (
    /*item*/
    ctx[14].description && create_if_block_6(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[14].date && create_if_block_5(ctx)
  );
  return {
    c() {
      li = element("li");
      a = element("a");
      t0 = text(t0_value);
      t1 = space();
      if (if_block0)
        if_block0.c();
      t2 = space();
      if (if_block1)
        if_block1.c();
      t3 = space();
      attr(a, "href", a_href_value = getUrl(
        /*item*/
        ctx[14]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-10h7usx");
      attr(li, "class", "svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, li, anchor);
      append(li, a);
      append(a, t0);
      append(li, t1);
      if (if_block0)
        if_block0.m(li, null);
      append(li, t2);
      if (if_block1)
        if_block1.m(li, null);
      append(li, t3);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[14]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*$query*/
      4 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[14]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[14].description
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_6(ctx2);
          if_block0.c();
          if_block0.m(li, t2);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*item*/
        ctx2[14].date
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_5(ctx2);
          if_block1.c();
          if_block1.m(li, t3);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(li);
      }
      if (if_block0)
        if_block0.d();
      if (if_block1)
        if_block1.d();
    }
  };
}
function create_else_block(ctx) {
  let span;
  let t_value = (
    /*$query*/
    ctx[2].count + ""
  );
  let t;
  return {
    c() {
      span = element("span");
      t = text(t_value);
      attr(span, "class", "count svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = /*$query*/
      ctx2[2].count + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_if_block_2(ctx) {
  let span;
  return {
    c() {
      span = element("span");
      span.textContent = "✗";
      attr(span, "class", "count-error svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, span, anchor);
    },
    p: noop,
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_if_block_1(ctx) {
  let span;
  return {
    c() {
      span = element("span");
      span.textContent = "…";
      attr(span, "class", "count-loading svelte-10h7usx");
    },
    m(target, anchor) {
      insert(target, span, anchor);
    },
    p: noop,
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_fragment(ctx) {
  let if_block_anchor;
  function select_block_type(ctx2, dirty) {
    if (
      /*render*/
      ctx2[1] === "count"
    )
      return create_if_block;
    return create_else_block_1;
  }
  let current_block_type = select_block_type(ctx);
  let if_block = current_block_type(ctx);
  return {
    c() {
      if_block.c();
      if_block_anchor = empty();
    },
    m(target, anchor) {
      if_block.m(target, anchor);
      insert(target, if_block_anchor, anchor);
    },
    p(ctx2, [dirty]) {
      if (current_block_type === (current_block_type = select_block_type(ctx2)) && if_block) {
        if_block.p(ctx2, dirty);
      } else {
        if_block.d(1);
        if_block = current_block_type(ctx2);
        if (if_block) {
          if_block.c();
          if_block.m(if_block_anchor.parentNode, if_block_anchor);
        }
      }
    },
    i: noop,
    o: noop,
    d(detaching) {
      if (detaching) {
        detach(if_block_anchor);
      }
      if_block.d(detaching);
    }
  };
}
function getTitle(item) {
  return item.title || item.uri || "Untitled";
}
function getUrl(item) {
  return item["@id"] || item.uri || "#";
}
function formatDate(timestamp) {
  if (!timestamp)
    return "";
  const date = new Date(parseInt(timestamp));
  return date.toLocaleDateString();
}
function instance($$self, $$props, $$invalidate) {
  let $query;
  let { server = "https://octothorp.es" } = $$props;
  let { o = "" } = $$props;
  let { s = "" } = $$props;
  let { noto = "" } = $$props;
  let { nots = "" } = $$props;
  let { match = "" } = $$props;
  let { limit = "10" } = $$props;
  let { offset = "0" } = $$props;
  let { when = "" } = $$props;
  let { autoload = false } = $$props;
  let { render = "list" } = $$props;
  const query = createOctoQuery("pages", "thorped");
  component_subscribe($$self, query, (value) => $$invalidate(2, $query = value));
  async function load() {
    await query.fetch({
      server,
      s,
      o,
      nots,
      noto,
      match,
      limit,
      offset,
      when
    });
  }
  onMount(() => {
    if (autoload || autoload === "") {
      load();
    }
  });
  $$self.$$set = ($$props2) => {
    if ("server" in $$props2)
      $$invalidate(5, server = $$props2.server);
    if ("o" in $$props2)
      $$invalidate(0, o = $$props2.o);
    if ("s" in $$props2)
      $$invalidate(6, s = $$props2.s);
    if ("noto" in $$props2)
      $$invalidate(7, noto = $$props2.noto);
    if ("nots" in $$props2)
      $$invalidate(8, nots = $$props2.nots);
    if ("match" in $$props2)
      $$invalidate(9, match = $$props2.match);
    if ("limit" in $$props2)
      $$invalidate(10, limit = $$props2.limit);
    if ("offset" in $$props2)
      $$invalidate(11, offset = $$props2.offset);
    if ("when" in $$props2)
      $$invalidate(12, when = $$props2.when);
    if ("autoload" in $$props2)
      $$invalidate(13, autoload = $$props2.autoload);
    if ("render" in $$props2)
      $$invalidate(1, render = $$props2.render);
  };
  return [
    o,
    render,
    $query,
    query,
    load,
    server,
    s,
    noto,
    nots,
    match,
    limit,
    offset,
    when,
    autoload
  ];
}
class OctoThorpe extends SvelteComponent {
  constructor(options) {
    super();
    init(
      this,
      options,
      instance,
      create_fragment,
      safe_not_equal,
      {
        server: 5,
        o: 0,
        s: 6,
        noto: 7,
        nots: 8,
        match: 9,
        limit: 10,
        offset: 11,
        when: 12,
        autoload: 13,
        render: 1
      },
      add_css
    );
  }
  get server() {
    return this.$$.ctx[5];
  }
  set server(server) {
    this.$$set({ server });
    flush();
  }
  get o() {
    return this.$$.ctx[0];
  }
  set o(o) {
    this.$$set({ o });
    flush();
  }
  get s() {
    return this.$$.ctx[6];
  }
  set s(s) {
    this.$$set({ s });
    flush();
  }
  get noto() {
    return this.$$.ctx[7];
  }
  set noto(noto) {
    this.$$set({ noto });
    flush();
  }
  get nots() {
    return this.$$.ctx[8];
  }
  set nots(nots) {
    this.$$set({ nots });
    flush();
  }
  get match() {
    return this.$$.ctx[9];
  }
  set match(match) {
    this.$$set({ match });
    flush();
  }
  get limit() {
    return this.$$.ctx[10];
  }
  set limit(limit) {
    this.$$set({ limit });
    flush();
  }
  get offset() {
    return this.$$.ctx[11];
  }
  set offset(offset) {
    this.$$set({ offset });
    flush();
  }
  get when() {
    return this.$$.ctx[12];
  }
  set when(when) {
    this.$$set({ when });
    flush();
  }
  get autoload() {
    return this.$$.ctx[13];
  }
  set autoload(autoload) {
    this.$$set({ autoload });
    flush();
  }
  get render() {
    return this.$$.ctx[1];
  }
  set render(render) {
    this.$$set({ render });
    flush();
  }
}
customElements.define("octo-thorpe", create_custom_element(OctoThorpe, { "server": {}, "o": {}, "s": {}, "noto": {}, "nots": {}, "match": {}, "limit": {}, "offset": {}, "when": {}, "autoload": { "type": "Boolean" }, "render": {} }, [], [], true));
export {
  OctoThorpe as default
};
//# sourceMappingURL=octo-thorpe.js.map
