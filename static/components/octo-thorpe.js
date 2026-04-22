import { c as create_custom_element, S as SvelteComponent, i as init, f as flush, s as safe_not_equal, a as append_styles, e as empty, b as insert, n as noop, d as detach, g as component_subscribe, o as onMount, h as element, j as space, k as attr, l as append, t as text, m as listen, p as set_data, q as destroy_each, r as src_url_equal } from "./index-4UfFXAJg.js";
import { c as createOctoQuery, e as ensure_array_like } from "./octo-store-BZXj-CXL.js";
import { g as getTitle, a as getUrl, f as formatDate } from "./display-helpers-C2Eemnsf.js";
function add_css(target) {
  append_styles(target, "svelte-sa6gj6", ':host{--octo-font:system-ui, -apple-system, sans-serif;--octo-primary:blue;--octo-background:#ffffff;--octo-text:#333333;--octo-border:#e0e0e0;--octo-error:#d32f2f;--octo-spacing:1rem;--octo-radius:4px;display:block;font-family:var(--octo-font);color:var(--octo-text)}.octo-thorpe.svelte-sa6gj6.svelte-sa6gj6{background:var(--octo-background)}.count.svelte-sa6gj6.svelte-sa6gj6,.count-loading.svelte-sa6gj6.svelte-sa6gj6,.count-error.svelte-sa6gj6.svelte-sa6gj6{font-weight:bold}.count-loading.svelte-sa6gj6.svelte-sa6gj6{opacity:0.5}.count-error.svelte-sa6gj6.svelte-sa6gj6{color:var(--octo-error)}.load-button.svelte-sa6gj6.svelte-sa6gj6,.retry-button.svelte-sa6gj6.svelte-sa6gj6{background:var(--octo-primary);color:white;border:none;padding:0.75rem 1.5rem;font-size:1rem;font-family:var(--octo-font);border-radius:var(--octo-radius);cursor:pointer;transition:opacity 0.2s}.load-button.svelte-sa6gj6.svelte-sa6gj6:hover,.retry-button.svelte-sa6gj6.svelte-sa6gj6:hover{opacity:0.9}.retry-button.svelte-sa6gj6.svelte-sa6gj6{background:var(--octo-error)}.loading.svelte-sa6gj6.svelte-sa6gj6{text-align:center;padding:calc(var(--octo-spacing) * 2)}.spinner.svelte-sa6gj6.svelte-sa6gj6{width:10px;height:10px;margin:0 auto var(--octo-spacing);border:4px solid var(--octo-border);border-top-color:var(--octo-primary);border-radius:50%;animation:svelte-sa6gj6-spin 1s linear infinite}@keyframes svelte-sa6gj6-spin{to{transform:rotate(360deg)}}.loading.svelte-sa6gj6 p.svelte-sa6gj6{margin:0;color:#666}.error.svelte-sa6gj6.svelte-sa6gj6{padding:var(--octo-spacing);background:#ffebee;border:1px solid var(--octo-error);border-radius:var(--octo-radius);text-align:center}.error.svelte-sa6gj6 p.svelte-sa6gj6{color:var(--octo-error);margin:0 0 var(--octo-spacing) 0}.list.svelte-sa6gj6.svelte-sa6gj6{list-style:none;padding:0;margin:0}.list.svelte-sa6gj6 li.svelte-sa6gj6{padding:var(--octo-spacing);border-bottom:1px solid var(--octo-border)}.list.svelte-sa6gj6 li.svelte-sa6gj6:last-child{border-bottom:none}.cards.svelte-sa6gj6.svelte-sa6gj6{display:grid;grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));gap:var(--octo-spacing)}.card.svelte-sa6gj6.svelte-sa6gj6{padding:var(--octo-spacing);border:1px solid var(--octo-border);border-radius:var(--octo-radius);background:var(--octo-background)}.card.svelte-sa6gj6 img.svelte-sa6gj6{width:100%;height:auto;border-radius:var(--octo-radius);margin-bottom:0.5rem}.card.svelte-sa6gj6 h3.svelte-sa6gj6{margin:0 0 0.5rem 0;font-size:1.125rem}.compact.svelte-sa6gj6.svelte-sa6gj6{display:inline}.compact[open].svelte-sa6gj6.svelte-sa6gj6{display:block}.compact.svelte-sa6gj6 summary.svelte-sa6gj6{list-style:none;cursor:zoom-in}.compact.svelte-sa6gj6 summary.svelte-sa6gj6::-webkit-details-marker{display:none}.compact.svelte-sa6gj6 summary.svelte-sa6gj6::before{padding-inline-end:0.1em;content:"#";font-weight:bold;display:inline-block;transform:rotate(30deg)}.compact[open].svelte-sa6gj6 summary.svelte-sa6gj6::before{transform:rotate(0)}.compact.svelte-sa6gj6 ul.svelte-sa6gj6{padding:0 0 1em 1em;margin:0}.compact.svelte-sa6gj6 a.svelte-sa6gj6{color:inherit}.compact-status.svelte-sa6gj6.svelte-sa6gj6{padding:0 0 1em 1em;margin:0;font-style:italic;opacity:0.7}.compact-error.svelte-sa6gj6.svelte-sa6gj6{color:var(--octo-error);font-style:normal;opacity:1}a.svelte-sa6gj6.svelte-sa6gj6{color:var(--octo-primary);text-decoration:none}a.svelte-sa6gj6.svelte-sa6gj6:hover{text-decoration:underline}.description.svelte-sa6gj6.svelte-sa6gj6{margin:0.5rem 0 0 0;color:#666;font-size:0.875rem;line-height:1.4}.date.svelte-sa6gj6.svelte-sa6gj6{display:block;margin-top:0.25rem;font-size:0.75rem;color:#999}.meta.svelte-sa6gj6.svelte-sa6gj6{margin-top:var(--octo-spacing);padding-top:var(--octo-spacing);border-top:1px solid var(--octo-border);text-align:right}.result-count.svelte-sa6gj6.svelte-sa6gj6{font-size:0.875rem;color:#666}');
}
function get_each_context_2(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[16] = list[i];
  return child_ctx;
}
function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[16] = list[i];
  return child_ctx;
}
function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[16] = list[i];
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
  ctx[2].error && create_if_block_17(ctx);
  let if_block1 = (
    /*$query*/
    ctx[2].loading && create_if_block_16()
  );
  let if_block2 = (
    /*$query*/
    ctx[2].error && create_if_block_15(ctx)
  );
  let if_block3 = (
    /*$query*/
    ctx[2].results.length > 0 && !/*$query*/
    ctx[2].loading && create_if_block_7(ctx)
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
      attr(div, "class", "octo-thorpe svelte-sa6gj6");
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
          if_block0 = create_if_block_17(ctx2);
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
          if_block1 = create_if_block_16();
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
          if_block2 = create_if_block_15(ctx2);
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
          if_block3 = create_if_block_7(ctx2);
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
function create_if_block_3(ctx) {
  let details;
  let summary;
  let t0_value = (
    /*o*/
    (ctx[0] || "octothorpes") + ""
  );
  let t0;
  let t1;
  let mounted;
  let dispose;
  function select_block_type_2(ctx2, dirty) {
    if (
      /*$query*/
      ctx2[2].loading
    )
      return create_if_block_4;
    if (
      /*$query*/
      ctx2[2].error
    )
      return create_if_block_5;
    if (
      /*$query*/
      ctx2[2].results.length > 0
    )
      return create_if_block_6;
  }
  let current_block_type = select_block_type_2(ctx);
  let if_block = current_block_type && current_block_type(ctx);
  return {
    c() {
      details = element("details");
      summary = element("summary");
      t0 = text(t0_value);
      t1 = space();
      if (if_block)
        if_block.c();
      attr(summary, "class", "svelte-sa6gj6");
      attr(details, "class", "compact svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, details, anchor);
      append(details, summary);
      append(summary, t0);
      append(details, t1);
      if (if_block)
        if_block.m(details, null);
      if (!mounted) {
        dispose = listen(
          details,
          "toggle",
          /*handleToggle*/
          ctx[5]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*o*/
      1 && t0_value !== (t0_value = /*o*/
      (ctx2[0] || "octothorpes") + ""))
        set_data(t0, t0_value);
      if (current_block_type === (current_block_type = select_block_type_2(ctx2)) && if_block) {
        if_block.p(ctx2, dirty);
      } else {
        if (if_block)
          if_block.d(1);
        if_block = current_block_type && current_block_type(ctx2);
        if (if_block) {
          if_block.c();
          if_block.m(details, null);
        }
      }
    },
    d(detaching) {
      if (detaching) {
        detach(details);
      }
      if (if_block) {
        if_block.d();
      }
      mounted = false;
      dispose();
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
function create_if_block_17(ctx) {
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
      attr(button, "class", "load-button svelte-sa6gj6");
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
function create_if_block_16(ctx) {
  let div1;
  return {
    c() {
      div1 = element("div");
      div1.innerHTML = `<div class="spinner svelte-sa6gj6"></div> <p class="svelte-sa6gj6">Loading...</p>`;
      attr(div1, "class", "loading svelte-sa6gj6");
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
function create_if_block_15(ctx) {
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
      attr(p, "class", "svelte-sa6gj6");
      attr(button, "class", "retry-button svelte-sa6gj6");
      attr(div, "class", "error svelte-sa6gj6");
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
function create_if_block_7(ctx) {
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
  function select_block_type_3(ctx2, dirty) {
    if (
      /*render*/
      ctx2[1] === "list"
    )
      return create_if_block_8;
    if (
      /*render*/
      ctx2[1] === "cards"
    )
      return create_if_block_11;
  }
  let current_block_type = select_block_type_3(ctx);
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
      attr(span, "class", "result-count svelte-sa6gj6");
      attr(div, "class", "meta svelte-sa6gj6");
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
      if (current_block_type === (current_block_type = select_block_type_3(ctx2)) && if_block) {
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
      attr(div, "class", "cards svelte-sa6gj6");
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
      if (dirty & /*$query*/
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
function create_if_block_8(ctx) {
  let ul;
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
      ul = element("ul");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      attr(ul, "class", "list svelte-sa6gj6");
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
      if (dirty & /*$query*/
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
            each_blocks[i].m(ul, null);
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
        detach(ul);
      }
      destroy_each(each_blocks, detaching);
    }
  };
}
function create_if_block_14(ctx) {
  let img;
  let img_src_value;
  let img_alt_value;
  return {
    c() {
      img = element("img");
      if (!src_url_equal(img.src, img_src_value = /*item*/
      ctx[16].image))
        attr(img, "src", img_src_value);
      attr(img, "alt", img_alt_value = getTitle(
        /*item*/
        ctx[16]
      ));
      attr(img, "loading", "lazy");
      attr(img, "class", "svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && !src_url_equal(img.src, img_src_value = /*item*/
      ctx2[16].image)) {
        attr(img, "src", img_src_value);
      }
      if (dirty & /*$query*/
      4 && img_alt_value !== (img_alt_value = getTitle(
        /*item*/
        ctx2[16]
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
function create_if_block_13(ctx) {
  let p;
  let t_value = (
    /*item*/
    ctx[16].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = /*item*/
      ctx2[16].description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_12(ctx) {
  let time;
  let t_value = formatDate(
    /*item*/
    ctx[16].date
  ) + "";
  let t;
  return {
    c() {
      time = element("time");
      t = text(t_value);
      attr(time, "class", "date svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, time, anchor);
      append(time, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[16].date
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
function create_each_block_2(ctx) {
  let article;
  let t0;
  let h3;
  let a;
  let t1_value = getTitle(
    /*item*/
    ctx[16]
  ) + "";
  let t1;
  let a_href_value;
  let t2;
  let t3;
  let t4;
  let if_block0 = (
    /*item*/
    ctx[16].image && create_if_block_14(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[16].description && create_if_block_13(ctx)
  );
  let if_block2 = (
    /*item*/
    ctx[16].date && create_if_block_12(ctx)
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
        ctx[16]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-sa6gj6");
      attr(h3, "class", "svelte-sa6gj6");
      attr(article, "class", "card svelte-sa6gj6");
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
        ctx2[16].image
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_14(ctx2);
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
        ctx2[16]
      ) + ""))
        set_data(t1, t1_value);
      if (dirty & /*$query*/
      4 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[16]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[16].description
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_13(ctx2);
          if_block1.c();
          if_block1.m(article, t3);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*item*/
        ctx2[16].date
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_12(ctx2);
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
function create_if_block_10(ctx) {
  let p;
  let t_value = (
    /*item*/
    ctx[16].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = /*item*/
      ctx2[16].description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_9(ctx) {
  let time;
  let t_value = formatDate(
    /*item*/
    ctx[16].date
  ) + "";
  let t;
  return {
    c() {
      time = element("time");
      t = text(t_value);
      attr(time, "class", "date svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, time, anchor);
      append(time, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[16].date
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
  let li;
  let a;
  let t0_value = getTitle(
    /*item*/
    ctx[16]
  ) + "";
  let t0;
  let a_href_value;
  let t1;
  let t2;
  let t3;
  let if_block0 = (
    /*item*/
    ctx[16].description && create_if_block_10(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[16].date && create_if_block_9(ctx)
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
        ctx[16]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-sa6gj6");
      attr(li, "class", "svelte-sa6gj6");
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
        ctx2[16]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*$query*/
      4 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[16]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[16].description
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_10(ctx2);
          if_block0.c();
          if_block0.m(li, t2);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*item*/
        ctx2[16].date
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_9(ctx2);
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
function create_if_block_6(ctx) {
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
      attr(ul, "class", "svelte-sa6gj6");
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
      if (dirty & /*$query*/
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
function create_if_block_5(ctx) {
  let p;
  let t0;
  let t1_value = (
    /*$query*/
    ctx[2].error + ""
  );
  let t1;
  return {
    c() {
      p = element("p");
      t0 = text("Error: ");
      t1 = text(t1_value);
      attr(p, "class", "compact-status compact-error svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t0);
      append(p, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t1_value !== (t1_value = /*$query*/
      ctx2[2].error + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_4(ctx) {
  let p;
  return {
    c() {
      p = element("p");
      p.textContent = "Loading…";
      attr(p, "class", "compact-status svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, p, anchor);
    },
    p: noop,
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_each_block(ctx) {
  let li;
  let a;
  let t0_value = getTitle(
    /*item*/
    ctx[16]
  ) + "";
  let t0;
  let a_href_value;
  let t1;
  return {
    c() {
      li = element("li");
      a = element("a");
      t0 = text(t0_value);
      t1 = space();
      attr(a, "href", a_href_value = getUrl(
        /*item*/
        ctx[16]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-sa6gj6");
    },
    m(target, anchor) {
      insert(target, li, anchor);
      append(li, a);
      append(a, t0);
      append(li, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      4 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[16]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*$query*/
      4 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[16]
      ))) {
        attr(a, "href", a_href_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(li);
      }
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
      attr(span, "class", "count svelte-sa6gj6");
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
      attr(span, "class", "count-error svelte-sa6gj6");
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
      attr(span, "class", "count-loading svelte-sa6gj6");
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
    if (
      /*render*/
      ctx2[1] === "compact"
    )
      return create_if_block_3;
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
  let { render = "compact" } = $$props;
  const query = createOctoQuery("pages", "thorped");
  component_subscribe($$self, query, (value) => $$invalidate(2, $query = value));
  let hasLoaded = false;
  async function load() {
    hasLoaded = true;
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
  function handleToggle(event) {
    if (event.target.open && !hasLoaded) {
      load();
    }
  }
  onMount(() => {
    if (autoload || autoload === "") {
      load();
    }
  });
  $$self.$$set = ($$props2) => {
    if ("server" in $$props2)
      $$invalidate(6, server = $$props2.server);
    if ("o" in $$props2)
      $$invalidate(0, o = $$props2.o);
    if ("s" in $$props2)
      $$invalidate(7, s = $$props2.s);
    if ("noto" in $$props2)
      $$invalidate(8, noto = $$props2.noto);
    if ("nots" in $$props2)
      $$invalidate(9, nots = $$props2.nots);
    if ("match" in $$props2)
      $$invalidate(10, match = $$props2.match);
    if ("limit" in $$props2)
      $$invalidate(11, limit = $$props2.limit);
    if ("offset" in $$props2)
      $$invalidate(12, offset = $$props2.offset);
    if ("when" in $$props2)
      $$invalidate(13, when = $$props2.when);
    if ("autoload" in $$props2)
      $$invalidate(14, autoload = $$props2.autoload);
    if ("render" in $$props2)
      $$invalidate(1, render = $$props2.render);
  };
  return [
    o,
    render,
    $query,
    query,
    load,
    handleToggle,
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
        server: 6,
        o: 0,
        s: 7,
        noto: 8,
        nots: 9,
        match: 10,
        limit: 11,
        offset: 12,
        when: 13,
        autoload: 14,
        render: 1
      },
      add_css
    );
  }
  get server() {
    return this.$$.ctx[6];
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
    return this.$$.ctx[7];
  }
  set s(s) {
    this.$$set({ s });
    flush();
  }
  get noto() {
    return this.$$.ctx[8];
  }
  set noto(noto) {
    this.$$set({ noto });
    flush();
  }
  get nots() {
    return this.$$.ctx[9];
  }
  set nots(nots) {
    this.$$set({ nots });
    flush();
  }
  get match() {
    return this.$$.ctx[10];
  }
  set match(match) {
    this.$$set({ match });
    flush();
  }
  get limit() {
    return this.$$.ctx[11];
  }
  set limit(limit) {
    this.$$set({ limit });
    flush();
  }
  get offset() {
    return this.$$.ctx[12];
  }
  set offset(offset) {
    this.$$set({ offset });
    flush();
  }
  get when() {
    return this.$$.ctx[13];
  }
  set when(when) {
    this.$$set({ when });
    flush();
  }
  get autoload() {
    return this.$$.ctx[14];
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
