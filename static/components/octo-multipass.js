import { c as create_custom_element, S as SvelteComponent, i as init, f as flush, s as safe_not_equal, a as append_styles, e as empty, b as insert, n as noop, d as detach, o as onMount, h as createOctoQuery, w as subscribe, j as element, k as space, l as attr, m as append, t as text, q as set_data, p as listen, r as ensure_array_like, u as destroy_each, v as src_url_equal } from "./octo-store-sa0Q_z2k.js";
import { p as parseMultipass, e as extractWhatBy, m as multipassToParams } from "./multipass-utils-Btdq4M2H.js";
function add_css(target) {
  append_styles(target, "svelte-99us", ":host{--octo-font:system-ui, -apple-system, sans-serif;--octo-primary:#3c7efb;--octo-background:#ffffff;--octo-text:#333333;--octo-border:#e0e0e0;--octo-error:#d32f2f;--octo-spacing:1rem;--octo-radius:4px;display:block;font-family:var(--octo-font);color:var(--octo-text)}.octo-multipass.svelte-99us.svelte-99us{background:var(--octo-background)}.count.svelte-99us.svelte-99us,.count-loading.svelte-99us.svelte-99us,.count-error.svelte-99us.svelte-99us,.count-pending.svelte-99us.svelte-99us{font-weight:bold}.count-loading.svelte-99us.svelte-99us,.count-pending.svelte-99us.svelte-99us{opacity:0.5}.count-error.svelte-99us.svelte-99us{color:var(--octo-error)}.multipass-title.svelte-99us.svelte-99us{margin:0 0 0.5rem 0;font-size:1.5rem;font-weight:bold;color:var(--octo-text)}.multipass-description.svelte-99us.svelte-99us{margin:0 0 0.5rem 0;color:#666;line-height:1.5}.multipass-author.svelte-99us.svelte-99us{margin:0 0 1rem 0;font-size:0.875rem;font-style:italic;color:#999}.load-button.svelte-99us.svelte-99us,.retry-button.svelte-99us.svelte-99us{background:var(--octo-primary);color:white;border:none;padding:0.75rem 1.5rem;font-size:1rem;font-family:var(--octo-font);border-radius:var(--octo-radius);cursor:pointer;transition:opacity 0.2s}.load-button.svelte-99us.svelte-99us:hover,.retry-button.svelte-99us.svelte-99us:hover{opacity:0.9}.retry-button.svelte-99us.svelte-99us{background:var(--octo-error)}.loading.svelte-99us.svelte-99us{text-align:center;padding:calc(var(--octo-spacing) * 2)}.spinner.svelte-99us.svelte-99us{width:40px;height:40px;margin:0 auto var(--octo-spacing);border:4px solid var(--octo-border);border-top-color:var(--octo-primary);border-radius:50%;animation:svelte-99us-spin 1s linear infinite}@keyframes svelte-99us-spin{to{transform:rotate(360deg)}}.loading.svelte-99us p.svelte-99us{margin:0;color:#666}.error-container.svelte-99us.svelte-99us{padding:var(--octo-spacing)}.error.svelte-99us.svelte-99us{padding:var(--octo-spacing);background:#ffebee;border:1px solid var(--octo-error);border-radius:var(--octo-radius);text-align:center}.error.svelte-99us p.svelte-99us{color:var(--octo-error);margin:0 0 var(--octo-spacing) 0}.error.svelte-99us p.svelte-99us:last-child{margin-bottom:0}.list.svelte-99us.svelte-99us{list-style:none;padding:0;margin:0}.list.svelte-99us li.svelte-99us{padding:var(--octo-spacing);border-bottom:1px solid var(--octo-border)}.list.svelte-99us li.svelte-99us:last-child{border-bottom:none}.cards.svelte-99us.svelte-99us{display:grid;grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));gap:var(--octo-spacing)}.card.svelte-99us.svelte-99us{padding:var(--octo-spacing);border:1px solid var(--octo-border);border-radius:var(--octo-radius);background:var(--octo-background)}.card.svelte-99us img.svelte-99us{width:100%;height:auto;border-radius:var(--octo-radius);margin-bottom:0.5rem}.card.svelte-99us h3.svelte-99us{margin:0 0 0.5rem 0;font-size:1.125rem}.compact.svelte-99us.svelte-99us{line-height:1.5}a.svelte-99us.svelte-99us{color:var(--octo-primary);text-decoration:none}a.svelte-99us.svelte-99us:hover{text-decoration:underline}.description.svelte-99us.svelte-99us{margin:0.5rem 0 0 0;color:#666;font-size:0.875rem;line-height:1.4}.date.svelte-99us.svelte-99us{display:block;margin-top:0.25rem;font-size:0.75rem;color:#999}.tags.svelte-99us.svelte-99us{display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.5rem}.tag.svelte-99us.svelte-99us{display:inline-block;padding:0.125rem 0.375rem;background:#f0f0f0;border-radius:var(--octo-radius);font-size:0.75rem;color:#666}.meta.svelte-99us.svelte-99us{margin-top:var(--octo-spacing);padding-top:var(--octo-spacing);border-top:1px solid var(--octo-border);text-align:right;font-size:0.875rem;color:#666}.result-count.svelte-99us.svelte-99us{font-weight:bold}.author-credit.svelte-99us.svelte-99us{font-style:italic}");
}
function get_each_context_3(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[10] = list[i];
  child_ctx[19] = i;
  return child_ctx;
}
function get_each_context_2(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[10] = list[i];
  return child_ctx;
}
function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[10] = list[i];
  return child_ctx;
}
function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[13] = list[i];
  return child_ctx;
}
function create_else_block_1(ctx) {
  var _a, _b, _c;
  let div;
  let t0;
  let t1;
  let t2;
  let t3;
  let t4;
  let t5;
  let if_block0 = (
    /*parsedMultiPass*/
    ((_a = ctx[1].meta) == null ? void 0 : _a.title) && create_if_block_23(ctx)
  );
  let if_block1 = (
    /*parsedMultiPass*/
    ((_b = ctx[1].meta) == null ? void 0 : _b.description) && create_if_block_22(ctx)
  );
  let if_block2 = (
    /*parsedMultiPass*/
    ((_c = ctx[1].meta) == null ? void 0 : _c.author) && create_if_block_21(ctx)
  );
  let if_block3 = (
    /*query*/
    ctx[2] && !/*$query*/
    ctx[3].results.length && !/*$query*/
    ctx[3].loading && !/*$query*/
    ctx[3].error && create_if_block_20(ctx)
  );
  let if_block4 = (
    /*query*/
    ctx[2] && /*$query*/
    ctx[3].loading && create_if_block_19()
  );
  let if_block5 = (
    /*query*/
    ctx[2] && /*$query*/
    ctx[3].error && create_if_block_18(ctx)
  );
  let if_block6 = (
    /*query*/
    ctx[2] && /*$query*/
    ctx[3].results.length > 0 && !/*$query*/
    ctx[3].loading && create_if_block_5(ctx)
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
      t3 = space();
      if (if_block4)
        if_block4.c();
      t4 = space();
      if (if_block5)
        if_block5.c();
      t5 = space();
      if (if_block6)
        if_block6.c();
      attr(div, "class", "octo-multipass svelte-99us");
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
      append(div, t3);
      if (if_block4)
        if_block4.m(div, null);
      append(div, t4);
      if (if_block5)
        if_block5.m(div, null);
      append(div, t5);
      if (if_block6)
        if_block6.m(div, null);
    },
    p(ctx2, dirty) {
      var _a2, _b2, _c2;
      if (
        /*parsedMultiPass*/
        (_a2 = ctx2[1].meta) == null ? void 0 : _a2.title
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_23(ctx2);
          if_block0.c();
          if_block0.m(div, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*parsedMultiPass*/
        (_b2 = ctx2[1].meta) == null ? void 0 : _b2.description
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_22(ctx2);
          if_block1.c();
          if_block1.m(div, t1);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*parsedMultiPass*/
        (_c2 = ctx2[1].meta) == null ? void 0 : _c2.author
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_21(ctx2);
          if_block2.c();
          if_block2.m(div, t2);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
      if (
        /*query*/
        ctx2[2] && !/*$query*/
        ctx2[3].results.length && !/*$query*/
        ctx2[3].loading && !/*$query*/
        ctx2[3].error
      ) {
        if (if_block3) {
          if_block3.p(ctx2, dirty);
        } else {
          if_block3 = create_if_block_20(ctx2);
          if_block3.c();
          if_block3.m(div, t3);
        }
      } else if (if_block3) {
        if_block3.d(1);
        if_block3 = null;
      }
      if (
        /*query*/
        ctx2[2] && /*$query*/
        ctx2[3].loading
      ) {
        if (if_block4)
          ;
        else {
          if_block4 = create_if_block_19();
          if_block4.c();
          if_block4.m(div, t4);
        }
      } else if (if_block4) {
        if_block4.d(1);
        if_block4 = null;
      }
      if (
        /*query*/
        ctx2[2] && /*$query*/
        ctx2[3].error
      ) {
        if (if_block5) {
          if_block5.p(ctx2, dirty);
        } else {
          if_block5 = create_if_block_18(ctx2);
          if_block5.c();
          if_block5.m(div, t5);
        }
      } else if (if_block5) {
        if_block5.d(1);
        if_block5 = null;
      }
      if (
        /*query*/
        ctx2[2] && /*$query*/
        ctx2[3].results.length > 0 && !/*$query*/
        ctx2[3].loading
      ) {
        if (if_block6) {
          if_block6.p(ctx2, dirty);
        } else {
          if_block6 = create_if_block_5(ctx2);
          if_block6.c();
          if_block6.m(div, null);
        }
      } else if (if_block6) {
        if_block6.d(1);
        if_block6 = null;
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
      if (if_block4)
        if_block4.d();
      if (if_block5)
        if_block5.d();
      if (if_block6)
        if_block6.d();
    }
  };
}
function create_if_block_1(ctx) {
  let if_block_anchor;
  function select_block_type_1(ctx2, dirty) {
    if (
      /*query*/
      ctx2[2] && /*$query*/
      ctx2[3].loading
    )
      return create_if_block_2;
    if (
      /*query*/
      ctx2[2] && /*$query*/
      ctx2[3].error
    )
      return create_if_block_3;
    if (
      /*query*/
      ctx2[2] && /*$query*/
      ctx2[3].results
    )
      return create_if_block_4;
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
function create_if_block(ctx) {
  let div1;
  return {
    c() {
      div1 = element("div");
      div1.innerHTML = `<div class="error svelte-99us"><p class="svelte-99us"><strong>Invalid MultiPass</strong></p> <p class="svelte-99us">Component requires a valid MultiPass object.</p></div>`;
      attr(div1, "class", "octo-multipass error-container svelte-99us");
    },
    m(target, anchor) {
      insert(target, div1, anchor);
    },
    p: noop,
    d(detaching) {
      if (detaching) {
        detach(div1);
      }
    }
  };
}
function create_if_block_23(ctx) {
  let h2;
  let t_value = (
    /*parsedMultiPass*/
    ctx[1].meta.title + ""
  );
  let t;
  return {
    c() {
      h2 = element("h2");
      t = text(t_value);
      attr(h2, "class", "multipass-title svelte-99us");
    },
    m(target, anchor) {
      insert(target, h2, anchor);
      append(h2, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*parsedMultiPass*/
      2 && t_value !== (t_value = /*parsedMultiPass*/
      ctx2[1].meta.title + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(h2);
      }
    }
  };
}
function create_if_block_22(ctx) {
  let p;
  let t_value = (
    /*parsedMultiPass*/
    ctx[1].meta.description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "multipass-description svelte-99us");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*parsedMultiPass*/
      2 && t_value !== (t_value = /*parsedMultiPass*/
      ctx2[1].meta.description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_21(ctx) {
  let p;
  let t0;
  let t1_value = (
    /*parsedMultiPass*/
    ctx[1].meta.author + ""
  );
  let t1;
  return {
    c() {
      p = element("p");
      t0 = text("by ");
      t1 = text(t1_value);
      attr(p, "class", "multipass-author svelte-99us");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t0);
      append(p, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*parsedMultiPass*/
      2 && t1_value !== (t1_value = /*parsedMultiPass*/
      ctx2[1].meta.author + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_20(ctx) {
  let button;
  let mounted;
  let dispose;
  return {
    c() {
      button = element("button");
      button.textContent = "Load Results";
      attr(button, "class", "load-button svelte-99us");
    },
    m(target, anchor) {
      insert(target, button, anchor);
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
    p: noop,
    d(detaching) {
      if (detaching) {
        detach(button);
      }
      mounted = false;
      dispose();
    }
  };
}
function create_if_block_19(ctx) {
  let div1;
  return {
    c() {
      div1 = element("div");
      div1.innerHTML = `<div class="spinner svelte-99us"></div> <p class="svelte-99us">Loading...</p>`;
      attr(div1, "class", "loading svelte-99us");
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
function create_if_block_18(ctx) {
  let div;
  let p;
  let strong;
  let t1;
  let t2_value = (
    /*$query*/
    ctx[3].error + ""
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
      attr(p, "class", "svelte-99us");
      attr(button, "class", "retry-button svelte-99us");
      attr(div, "class", "error svelte-99us");
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
      8 && t2_value !== (t2_value = /*$query*/
      ctx2[3].error + ""))
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
function create_if_block_5(ctx) {
  var _a;
  let t0;
  let div;
  let span;
  let t1_value = (
    /*$query*/
    ctx[3].count + ""
  );
  let t1;
  let t2;
  let t3_value = (
    /*$query*/
    ctx[3].count === 1 ? "" : "s"
  );
  let t3;
  let t4;
  function select_block_type_2(ctx2, dirty) {
    if (
      /*render*/
      ctx2[0] === "list"
    )
      return create_if_block_7;
    if (
      /*render*/
      ctx2[0] === "cards"
    )
      return create_if_block_12;
    if (
      /*render*/
      ctx2[0] === "compact"
    )
      return create_if_block_16;
  }
  let current_block_type = select_block_type_2(ctx);
  let if_block0 = current_block_type && current_block_type(ctx);
  let if_block1 = (
    /*parsedMultiPass*/
    ((_a = ctx[1].meta) == null ? void 0 : _a.author) && create_if_block_6(ctx)
  );
  return {
    c() {
      if (if_block0)
        if_block0.c();
      t0 = space();
      div = element("div");
      span = element("span");
      t1 = text(t1_value);
      t2 = text(" result");
      t3 = text(t3_value);
      t4 = space();
      if (if_block1)
        if_block1.c();
      attr(span, "class", "result-count svelte-99us");
      attr(div, "class", "meta svelte-99us");
    },
    m(target, anchor) {
      if (if_block0)
        if_block0.m(target, anchor);
      insert(target, t0, anchor);
      insert(target, div, anchor);
      append(div, span);
      append(span, t1);
      append(span, t2);
      append(span, t3);
      append(div, t4);
      if (if_block1)
        if_block1.m(div, null);
    },
    p(ctx2, dirty) {
      var _a2;
      if (current_block_type === (current_block_type = select_block_type_2(ctx2)) && if_block0) {
        if_block0.p(ctx2, dirty);
      } else {
        if (if_block0)
          if_block0.d(1);
        if_block0 = current_block_type && current_block_type(ctx2);
        if (if_block0) {
          if_block0.c();
          if_block0.m(t0.parentNode, t0);
        }
      }
      if (dirty & /*$query*/
      8 && t1_value !== (t1_value = /*$query*/
      ctx2[3].count + ""))
        set_data(t1, t1_value);
      if (dirty & /*$query*/
      8 && t3_value !== (t3_value = /*$query*/
      ctx2[3].count === 1 ? "" : "s"))
        set_data(t3, t3_value);
      if (
        /*parsedMultiPass*/
        (_a2 = ctx2[1].meta) == null ? void 0 : _a2.author
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_6(ctx2);
          if_block1.c();
          if_block1.m(div, null);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(t0);
        detach(div);
      }
      if (if_block0) {
        if_block0.d(detaching);
      }
      if (if_block1)
        if_block1.d();
    }
  };
}
function create_if_block_16(ctx) {
  let div;
  let each_value_3 = ensure_array_like(
    /*$query*/
    ctx[3].results
  );
  let each_blocks = [];
  for (let i = 0; i < each_value_3.length; i += 1) {
    each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
  }
  return {
    c() {
      div = element("div");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      attr(div, "class", "compact svelte-99us");
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
      8) {
        each_value_3 = ensure_array_like(
          /*$query*/
          ctx2[3].results
        );
        let i;
        for (i = 0; i < each_value_3.length; i += 1) {
          const child_ctx = get_each_context_3(ctx2, each_value_3, i);
          if (each_blocks[i]) {
            each_blocks[i].p(child_ctx, dirty);
          } else {
            each_blocks[i] = create_each_block_3(child_ctx);
            each_blocks[i].c();
            each_blocks[i].m(div, null);
          }
        }
        for (; i < each_blocks.length; i += 1) {
          each_blocks[i].d(1);
        }
        each_blocks.length = each_value_3.length;
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
function create_if_block_12(ctx) {
  let div;
  let each_value_2 = ensure_array_like(
    /*$query*/
    ctx[3].results
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
      attr(div, "class", "cards svelte-99us");
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
      8) {
        each_value_2 = ensure_array_like(
          /*$query*/
          ctx2[3].results
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
  let ul;
  let each_value = ensure_array_like(
    /*$query*/
    ctx[3].results
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
      attr(ul, "class", "list svelte-99us");
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
      if (dirty & /*$query, formatDate, getUrl, getTitle*/
      8) {
        each_value = ensure_array_like(
          /*$query*/
          ctx2[3].results
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
function create_if_block_17(ctx) {
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
function create_each_block_3(ctx) {
  let a;
  let t0_value = getTitle(
    /*item*/
    ctx[10]
  ) + "";
  let t0;
  let t1;
  let a_href_value;
  let if_block_anchor;
  let if_block = (
    /*i*/
    ctx[19] < /*$query*/
    ctx[3].results.length - 1 && create_if_block_17()
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
        ctx[10]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-99us");
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
      8 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[10]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*$query*/
      8 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[10]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*i*/
        ctx2[19] < /*$query*/
        ctx2[3].results.length - 1
      ) {
        if (if_block)
          ;
        else {
          if_block = create_if_block_17();
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
function create_if_block_15(ctx) {
  let img;
  let img_src_value;
  let img_alt_value;
  return {
    c() {
      img = element("img");
      if (!src_url_equal(img.src, img_src_value = /*item*/
      ctx[10].image))
        attr(img, "src", img_src_value);
      attr(img, "alt", img_alt_value = getTitle(
        /*item*/
        ctx[10]
      ));
      attr(img, "loading", "lazy");
      attr(img, "class", "svelte-99us");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      8 && !src_url_equal(img.src, img_src_value = /*item*/
      ctx2[10].image)) {
        attr(img, "src", img_src_value);
      }
      if (dirty & /*$query*/
      8 && img_alt_value !== (img_alt_value = getTitle(
        /*item*/
        ctx2[10]
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
function create_if_block_14(ctx) {
  let p;
  let t_value = (
    /*item*/
    ctx[10].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-99us");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      8 && t_value !== (t_value = /*item*/
      ctx2[10].description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_13(ctx) {
  let time;
  let t_value = formatDate(
    /*item*/
    ctx[10].date
  ) + "";
  let t;
  return {
    c() {
      time = element("time");
      t = text(t_value);
      attr(time, "class", "date svelte-99us");
    },
    m(target, anchor) {
      insert(target, time, anchor);
      append(time, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      8 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[10].date
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
    ctx[10]
  ) + "";
  let t1;
  let a_href_value;
  let t2;
  let t3;
  let t4;
  let if_block0 = (
    /*item*/
    ctx[10].image && create_if_block_15(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[10].description && create_if_block_14(ctx)
  );
  let if_block2 = (
    /*item*/
    ctx[10].date && create_if_block_13(ctx)
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
        ctx[10]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-99us");
      attr(h3, "class", "svelte-99us");
      attr(article, "class", "card svelte-99us");
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
        ctx2[10].image
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_15(ctx2);
          if_block0.c();
          if_block0.m(article, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (dirty & /*$query*/
      8 && t1_value !== (t1_value = getTitle(
        /*item*/
        ctx2[10]
      ) + ""))
        set_data(t1, t1_value);
      if (dirty & /*$query*/
      8 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[10]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[10].description
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_14(ctx2);
          if_block1.c();
          if_block1.m(article, t3);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*item*/
        ctx2[10].date
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_13(ctx2);
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
function create_if_block_11(ctx) {
  let p;
  let t_value = (
    /*item*/
    ctx[10].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-99us");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      8 && t_value !== (t_value = /*item*/
      ctx2[10].description + ""))
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
  let time;
  let t_value = formatDate(
    /*item*/
    ctx[10].date
  ) + "";
  let t;
  return {
    c() {
      time = element("time");
      t = text(t_value);
      attr(time, "class", "date svelte-99us");
    },
    m(target, anchor) {
      insert(target, time, anchor);
      append(time, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      8 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[10].date
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
function create_if_block_8(ctx) {
  let div;
  let each_value_1 = ensure_array_like(
    /*item*/
    ctx[10].octothorpes
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
      attr(div, "class", "tags svelte-99us");
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
      8) {
        each_value_1 = ensure_array_like(
          /*item*/
          ctx2[10].octothorpes
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
function create_if_block_9(ctx) {
  let span;
  let t0;
  let t1_value = (
    /*thorpe*/
    ctx[13] + ""
  );
  let t1;
  return {
    c() {
      span = element("span");
      t0 = text("#");
      t1 = text(t1_value);
      attr(span, "class", "tag svelte-99us");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t0);
      append(span, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      8 && t1_value !== (t1_value = /*thorpe*/
      ctx2[13] + ""))
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
  let if_block = typeof /*thorpe*/
  ctx[13] === "string" && create_if_block_9(ctx);
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
      if (typeof /*thorpe*/
      ctx2[13] === "string") {
        if (if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block = create_if_block_9(ctx2);
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
        detach(if_block_anchor);
      }
      if (if_block)
        if_block.d(detaching);
    }
  };
}
function create_each_block(ctx) {
  let li;
  let a;
  let t0_value = getTitle(
    /*item*/
    ctx[10]
  ) + "";
  let t0;
  let a_href_value;
  let t1;
  let t2;
  let t3;
  let t4;
  let if_block0 = (
    /*item*/
    ctx[10].description && create_if_block_11(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[10].date && create_if_block_10(ctx)
  );
  let if_block2 = (
    /*item*/
    ctx[10].octothorpes && /*item*/
    ctx[10].octothorpes.length > 0 && create_if_block_8(ctx)
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
      if (if_block2)
        if_block2.c();
      t4 = space();
      attr(a, "href", a_href_value = getUrl(
        /*item*/
        ctx[10]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-99us");
      attr(li, "class", "svelte-99us");
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
      if (if_block2)
        if_block2.m(li, null);
      append(li, t4);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      8 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[10]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*$query*/
      8 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[10]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[10].description
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_11(ctx2);
          if_block0.c();
          if_block0.m(li, t2);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*item*/
        ctx2[10].date
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_10(ctx2);
          if_block1.c();
          if_block1.m(li, t3);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*item*/
        ctx2[10].octothorpes && /*item*/
        ctx2[10].octothorpes.length > 0
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_8(ctx2);
          if_block2.c();
          if_block2.m(li, t4);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
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
      if (if_block2)
        if_block2.d();
    }
  };
}
function create_if_block_6(ctx) {
  let span;
  let t0;
  let t1_value = (
    /*parsedMultiPass*/
    ctx[1].meta.author + ""
  );
  let t1;
  return {
    c() {
      span = element("span");
      t0 = text("• curated by ");
      t1 = text(t1_value);
      attr(span, "class", "author-credit svelte-99us");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t0);
      append(span, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*parsedMultiPass*/
      2 && t1_value !== (t1_value = /*parsedMultiPass*/
      ctx2[1].meta.author + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_else_block(ctx) {
  let span;
  return {
    c() {
      span = element("span");
      span.textContent = "?";
      attr(span, "class", "count-pending svelte-99us");
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
function create_if_block_4(ctx) {
  let span;
  let t_value = (
    /*$query*/
    ctx[3].count + ""
  );
  let t;
  return {
    c() {
      span = element("span");
      t = text(t_value);
      attr(span, "class", "count svelte-99us");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      8 && t_value !== (t_value = /*$query*/
      ctx2[3].count + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(span);
      }
    }
  };
}
function create_if_block_3(ctx) {
  let span;
  return {
    c() {
      span = element("span");
      span.textContent = "✗";
      attr(span, "class", "count-error svelte-99us");
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
function create_if_block_2(ctx) {
  let span;
  return {
    c() {
      span = element("span");
      span.textContent = "…";
      attr(span, "class", "count-loading svelte-99us");
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
    if (!/*parsedMultiPass*/
    ctx2[1])
      return create_if_block;
    if (
      /*render*/
      ctx2[0] === "count"
    )
      return create_if_block_1;
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
  return item.title || item["@id"] || item.uri || item.term || "Untitled";
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
  let $query, $$unsubscribe_query = noop, $$subscribe_query = () => ($$unsubscribe_query(), $$unsubscribe_query = subscribe(query, ($$value) => $$invalidate(3, $query = $$value)), query);
  $$self.$$.on_destroy.push(() => $$unsubscribe_query());
  let { multipass = "" } = $$props;
  let { autoload = false } = $$props;
  let { render = "list" } = $$props;
  let parsedMultiPass = null;
  let queryParams = null;
  let what = "pages";
  let by = "thorped";
  let query = null;
  $$subscribe_query();
  async function load() {
    if (!query || !queryParams)
      return;
    await query.fetch(queryParams);
  }
  onMount(() => {
    if (autoload && parsedMultiPass) {
      load();
    }
  });
  $$self.$$set = ($$props2) => {
    if ("multipass" in $$props2)
      $$invalidate(5, multipass = $$props2.multipass);
    if ("autoload" in $$props2)
      $$invalidate(6, autoload = $$props2.autoload);
    if ("render" in $$props2)
      $$invalidate(0, render = $$props2.render);
  };
  $$self.$$.update = () => {
    if ($$self.$$.dirty & /*multipass, parsedMultiPass, what, by*/
    418) {
      {
        $$invalidate(1, parsedMultiPass = parseMultipass(multipass));
        if (parsedMultiPass) {
          $$invalidate(7, { what, by } = extractWhatBy(parsedMultiPass), what, ($$invalidate(8, by), $$invalidate(5, multipass), $$invalidate(1, parsedMultiPass), $$invalidate(7, what)));
          queryParams = multipassToParams(parsedMultiPass);
          $$subscribe_query($$invalidate(2, query = createOctoQuery(what, by)));
        } else {
          $$subscribe_query($$invalidate(2, query = null));
          queryParams = null;
        }
      }
    }
  };
  return [render, parsedMultiPass, query, $query, load, multipass, autoload, what, by];
}
class OctoMultipass extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance, create_fragment, safe_not_equal, { multipass: 5, autoload: 6, render: 0 }, add_css);
  }
  get multipass() {
    return this.$$.ctx[5];
  }
  set multipass(multipass) {
    this.$$set({ multipass });
    flush();
  }
  get autoload() {
    return this.$$.ctx[6];
  }
  set autoload(autoload) {
    this.$$set({ autoload });
    flush();
  }
  get render() {
    return this.$$.ctx[0];
  }
  set render(render) {
    this.$$set({ render });
    flush();
  }
}
customElements.define("octo-multipass", create_custom_element(OctoMultipass, { "multipass": {}, "autoload": { "type": "Boolean" }, "render": {} }, [], [], true));
export {
  OctoMultipass as default
};
//# sourceMappingURL=octo-multipass.js.map
