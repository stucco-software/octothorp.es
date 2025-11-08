import { c as create_custom_element, S as SvelteComponent, i as init, f as flush, s as safe_not_equal, a as append_styles, e as empty, b as insert, n as noop, d as detach, w as subscribe, h as createOctoQuery, j as element, k as space, l as attr, m as append, p as listen, t as text, x as set_style, y as toggle_class, q as set_data, z as run_all, v as src_url_equal, r as ensure_array_like, u as destroy_each } from "./octo-store-BQMJOIgq.js";
import { p as parseMultipass, e as extractWhatBy, m as multipassToParams } from "./multipass-utils-Btdq4M2H.js";
function add_css(target) {
  append_styles(target, "svelte-19miub8", ":host{--octo-font:system-ui, -apple-system, sans-serif;--octo-primary:#3c7efb;--octo-background:#ffffff;--octo-text:#333333;--octo-border:#e0e0e0;--octo-error:#d32f2f;--octo-spacing:1rem;--octo-radius:4px;display:block;font-family:var(--octo-font);color:var(--octo-text)}.upload-zone.svelte-19miub8.svelte-19miub8{min-height:300px;border:3px dashed var(--octo-border);border-radius:var(--octo-radius);background:var(--octo-background);display:flex;align-items:center;justify-content:center;padding:var(--octo-spacing);transition:all 0.2s ease;cursor:pointer}.upload-zone.svelte-19miub8.svelte-19miub8:hover{border-color:var(--octo-primary);background:#f8f9fa}.upload-zone.dragging.svelte-19miub8.svelte-19miub8{border-color:var(--octo-primary);border-style:solid;background:#e3f2fd;transform:scale(1.02)}.upload-content.svelte-19miub8.svelte-19miub8{text-align:center;max-width:400px}.upload-icon.svelte-19miub8.svelte-19miub8{font-size:4rem;margin-bottom:var(--octo-spacing)}.upload-text.svelte-19miub8.svelte-19miub8{font-size:1.125rem;font-weight:bold;margin:0 0 0.5rem 0;color:var(--octo-text)}.upload-subtext.svelte-19miub8.svelte-19miub8{font-size:0.875rem;color:#666;margin:0 0 var(--octo-spacing) 0}.upload-button.svelte-19miub8.svelte-19miub8{display:inline-block;padding:0.75rem 1.5rem;background:var(--octo-primary);color:white;border-radius:var(--octo-radius);cursor:pointer;font-weight:bold;transition:opacity 0.2s}.upload-button.svelte-19miub8.svelte-19miub8:hover{opacity:0.9}.upload-error.svelte-19miub8.svelte-19miub8{margin-top:var(--octo-spacing);padding:var(--octo-spacing);background:#ffebee;border:1px solid var(--octo-error);border-radius:var(--octo-radius)}.upload-error.svelte-19miub8 p.svelte-19miub8{margin:0;color:var(--octo-error)}.results-container.svelte-19miub8.svelte-19miub8{background:var(--octo-background)}.results-header.svelte-19miub8.svelte-19miub8{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--octo-spacing);padding-bottom:var(--octo-spacing);border-bottom:2px solid var(--octo-border);margin-bottom:var(--octo-spacing)}.header-content.svelte-19miub8.svelte-19miub8{display:flex;gap:var(--octo-spacing);flex:1;min-width:0}.gif-preview.svelte-19miub8.svelte-19miub8{width:100px;height:100px;object-fit:cover;border:1px solid var(--octo-border);border-radius:var(--octo-radius);flex-shrink:0}.header-text.svelte-19miub8.svelte-19miub8{flex:1;min-width:0}.multipass-title.svelte-19miub8.svelte-19miub8{margin:0 0 0.5rem 0;font-size:1.5rem;font-weight:bold}.multipass-description.svelte-19miub8.svelte-19miub8{margin:0 0 0.5rem 0;color:#666;line-height:1.5}.multipass-author.svelte-19miub8.svelte-19miub8{margin:0;font-size:0.875rem;font-style:italic;color:#999}.reset-button.svelte-19miub8.svelte-19miub8{padding:0.5rem 1rem;background:var(--octo-background);border:1px solid var(--octo-border);border-radius:var(--octo-radius);cursor:pointer;font-size:0.875rem;white-space:nowrap}.reset-button.svelte-19miub8.svelte-19miub8:hover{background:#f8f9fa}.loading.svelte-19miub8.svelte-19miub8{text-align:center;padding:calc(var(--octo-spacing) * 2)}.spinner.svelte-19miub8.svelte-19miub8{width:40px;height:40px;margin:0 auto var(--octo-spacing);border:4px solid var(--octo-border);border-top-color:var(--octo-primary);border-radius:50%;animation:svelte-19miub8-spin 1s linear infinite}@keyframes svelte-19miub8-spin{to{transform:rotate(360deg)}}.loading.svelte-19miub8 p.svelte-19miub8{margin:0;color:#666}.error.svelte-19miub8.svelte-19miub8{padding:var(--octo-spacing);background:#ffebee;border:1px solid var(--octo-error);border-radius:var(--octo-radius);text-align:center;margin-bottom:var(--octo-spacing)}.error.svelte-19miub8 p.svelte-19miub8{color:var(--octo-error);margin:0 0 var(--octo-spacing) 0}.retry-button.svelte-19miub8.svelte-19miub8{padding:0.5rem 1rem;background:var(--octo-error);color:white;border:none;border-radius:var(--octo-radius);cursor:pointer}.list.svelte-19miub8.svelte-19miub8{list-style:none;padding:0;margin:0}.list.svelte-19miub8 li.svelte-19miub8{padding:var(--octo-spacing);border-bottom:1px solid var(--octo-border)}.list.svelte-19miub8 li.svelte-19miub8:last-child{border-bottom:none}.cards.svelte-19miub8.svelte-19miub8{display:grid;grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));gap:var(--octo-spacing)}.card.svelte-19miub8.svelte-19miub8{padding:var(--octo-spacing);border:1px solid var(--octo-border);border-radius:var(--octo-radius)}.card.svelte-19miub8 img.svelte-19miub8{width:100%;height:auto;border-radius:var(--octo-radius);margin-bottom:0.5rem}.card.svelte-19miub8 h3.svelte-19miub8{margin:0 0 0.5rem 0;font-size:1.125rem}.compact.svelte-19miub8.svelte-19miub8{line-height:1.5;padding:var(--octo-spacing)}a.svelte-19miub8.svelte-19miub8{color:var(--octo-primary);text-decoration:none}a.svelte-19miub8.svelte-19miub8:hover{text-decoration:underline}.description.svelte-19miub8.svelte-19miub8{margin:0.5rem 0 0 0;color:#666;font-size:0.875rem;line-height:1.4}.date.svelte-19miub8.svelte-19miub8{display:block;margin-top:0.25rem;font-size:0.75rem;color:#999}.tags.svelte-19miub8.svelte-19miub8{display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.5rem}.tag.svelte-19miub8.svelte-19miub8{display:inline-block;padding:0.125rem 0.375rem;background:#f0f0f0;border-radius:var(--octo-radius);font-size:0.75rem}.meta.svelte-19miub8.svelte-19miub8{margin-top:var(--octo-spacing);padding-top:var(--octo-spacing);border-top:1px solid var(--octo-border);text-align:right;font-size:0.875rem;color:#666}.result-count.svelte-19miub8.svelte-19miub8{font-weight:bold}");
}
function get_each_context_3(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[18] = list[i];
  child_ctx[27] = i;
  return child_ctx;
}
function get_each_context_2(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[18] = list[i];
  return child_ctx;
}
function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[18] = list[i];
  return child_ctx;
}
function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[21] = list[i];
  return child_ctx;
}
function create_else_block(ctx) {
  var _a, _b, _c;
  let div3;
  let div2;
  let div1;
  let t0;
  let div0;
  let t1;
  let t2;
  let t3;
  let button;
  let t5;
  let t6;
  let t7;
  let mounted;
  let dispose;
  let if_block0 = (
    /*gifPreview*/
    ctx[6] && create_if_block_18(ctx)
  );
  let if_block1 = (
    /*parsedMultiPass*/
    ((_a = ctx[2].meta) == null ? void 0 : _a.title) && create_if_block_17(ctx)
  );
  let if_block2 = (
    /*parsedMultiPass*/
    ((_b = ctx[2].meta) == null ? void 0 : _b.description) && create_if_block_16(ctx)
  );
  let if_block3 = (
    /*parsedMultiPass*/
    ((_c = ctx[2].meta) == null ? void 0 : _c.author) && create_if_block_15(ctx)
  );
  let if_block4 = (
    /*query*/
    ctx[3] && /*$query*/
    ctx[7].loading && create_if_block_14()
  );
  let if_block5 = (
    /*query*/
    ctx[3] && /*$query*/
    ctx[7].error && create_if_block_13(ctx)
  );
  let if_block6 = (
    /*query*/
    ctx[3] && /*$query*/
    ctx[7].results.length > 0 && !/*$query*/
    ctx[7].loading && create_if_block_2(ctx)
  );
  return {
    c() {
      div3 = element("div");
      div2 = element("div");
      div1 = element("div");
      if (if_block0)
        if_block0.c();
      t0 = space();
      div0 = element("div");
      if (if_block1)
        if_block1.c();
      t1 = space();
      if (if_block2)
        if_block2.c();
      t2 = space();
      if (if_block3)
        if_block3.c();
      t3 = space();
      button = element("button");
      button.textContent = "Load Different MultiPass";
      t5 = space();
      if (if_block4)
        if_block4.c();
      t6 = space();
      if (if_block5)
        if_block5.c();
      t7 = space();
      if (if_block6)
        if_block6.c();
      attr(div0, "class", "header-text svelte-19miub8");
      attr(div1, "class", "header-content svelte-19miub8");
      attr(button, "class", "reset-button svelte-19miub8");
      attr(div2, "class", "results-header svelte-19miub8");
      attr(div3, "class", "results-container svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, div3, anchor);
      append(div3, div2);
      append(div2, div1);
      if (if_block0)
        if_block0.m(div1, null);
      append(div1, t0);
      append(div1, div0);
      if (if_block1)
        if_block1.m(div0, null);
      append(div0, t1);
      if (if_block2)
        if_block2.m(div0, null);
      append(div0, t2);
      if (if_block3)
        if_block3.m(div0, null);
      append(div2, t3);
      append(div2, button);
      append(div3, t5);
      if (if_block4)
        if_block4.m(div3, null);
      append(div3, t6);
      if (if_block5)
        if_block5.m(div3, null);
      append(div3, t7);
      if (if_block6)
        if_block6.m(div3, null);
      if (!mounted) {
        dispose = listen(
          button,
          "click",
          /*reset*/
          ctx[13]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      var _a2, _b2, _c2;
      if (
        /*gifPreview*/
        ctx2[6]
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_18(ctx2);
          if_block0.c();
          if_block0.m(div1, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*parsedMultiPass*/
        (_a2 = ctx2[2].meta) == null ? void 0 : _a2.title
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_17(ctx2);
          if_block1.c();
          if_block1.m(div0, t1);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*parsedMultiPass*/
        (_b2 = ctx2[2].meta) == null ? void 0 : _b2.description
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_16(ctx2);
          if_block2.c();
          if_block2.m(div0, t2);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
      if (
        /*parsedMultiPass*/
        (_c2 = ctx2[2].meta) == null ? void 0 : _c2.author
      ) {
        if (if_block3) {
          if_block3.p(ctx2, dirty);
        } else {
          if_block3 = create_if_block_15(ctx2);
          if_block3.c();
          if_block3.m(div0, null);
        }
      } else if (if_block3) {
        if_block3.d(1);
        if_block3 = null;
      }
      if (
        /*query*/
        ctx2[3] && /*$query*/
        ctx2[7].loading
      ) {
        if (if_block4)
          ;
        else {
          if_block4 = create_if_block_14();
          if_block4.c();
          if_block4.m(div3, t6);
        }
      } else if (if_block4) {
        if_block4.d(1);
        if_block4 = null;
      }
      if (
        /*query*/
        ctx2[3] && /*$query*/
        ctx2[7].error
      ) {
        if (if_block5) {
          if_block5.p(ctx2, dirty);
        } else {
          if_block5 = create_if_block_13(ctx2);
          if_block5.c();
          if_block5.m(div3, t7);
        }
      } else if (if_block5) {
        if_block5.d(1);
        if_block5 = null;
      }
      if (
        /*query*/
        ctx2[3] && /*$query*/
        ctx2[7].results.length > 0 && !/*$query*/
        ctx2[7].loading
      ) {
        if (if_block6) {
          if_block6.p(ctx2, dirty);
        } else {
          if_block6 = create_if_block_2(ctx2);
          if_block6.c();
          if_block6.m(div3, null);
        }
      } else if (if_block6) {
        if_block6.d(1);
        if_block6 = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(div3);
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
      mounted = false;
      dispose();
    }
  };
}
function create_if_block(ctx) {
  let div2;
  let div1;
  let div0;
  let t1;
  let p0;
  let t2;
  let t3;
  let p1;
  let t5;
  let label;
  let t6;
  let input;
  let t7;
  let mounted;
  let dispose;
  let if_block = (
    /*error*/
    ctx[5] && create_if_block_1(ctx)
  );
  return {
    c() {
      div2 = element("div");
      div1 = element("div");
      div0 = element("div");
      div0.textContent = "📄";
      t1 = space();
      p0 = element("p");
      t2 = text(
        /*placeholder*/
        ctx[1]
      );
      t3 = space();
      p1 = element("p");
      p1.textContent = "JSON or GIF files accepted";
      t5 = space();
      label = element("label");
      t6 = text("Browse Files\n        ");
      input = element("input");
      t7 = space();
      if (if_block)
        if_block.c();
      attr(div0, "class", "upload-icon svelte-19miub8");
      attr(p0, "class", "upload-text svelte-19miub8");
      attr(p1, "class", "upload-subtext svelte-19miub8");
      attr(input, "type", "file");
      attr(input, "accept", ".json,.gif,application/json,image/gif");
      set_style(input, "display", "none");
      attr(label, "class", "upload-button svelte-19miub8");
      attr(div1, "class", "upload-content svelte-19miub8");
      attr(div2, "class", "upload-zone svelte-19miub8");
      attr(div2, "role", "button");
      attr(div2, "tabindex", "0");
      toggle_class(
        div2,
        "dragging",
        /*isDragging*/
        ctx[4]
      );
    },
    m(target, anchor) {
      insert(target, div2, anchor);
      append(div2, div1);
      append(div1, div0);
      append(div1, t1);
      append(div1, p0);
      append(p0, t2);
      append(div1, t3);
      append(div1, p1);
      append(div1, t5);
      append(div1, label);
      append(label, t6);
      append(label, input);
      append(div1, t7);
      if (if_block)
        if_block.m(div1, null);
      if (!mounted) {
        dispose = [
          listen(
            input,
            "change",
            /*handleFileInput*/
            ctx[12]
          ),
          listen(
            div2,
            "dragover",
            /*handleDragOver*/
            ctx[9]
          ),
          listen(
            div2,
            "dragleave",
            /*handleDragLeave*/
            ctx[10]
          ),
          listen(
            div2,
            "drop",
            /*handleDrop*/
            ctx[11]
          )
        ];
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*placeholder*/
      2)
        set_data(
          t2,
          /*placeholder*/
          ctx2[1]
        );
      if (
        /*error*/
        ctx2[5]
      ) {
        if (if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block = create_if_block_1(ctx2);
          if_block.c();
          if_block.m(div1, null);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }
      if (dirty & /*isDragging*/
      16) {
        toggle_class(
          div2,
          "dragging",
          /*isDragging*/
          ctx2[4]
        );
      }
    },
    d(detaching) {
      if (detaching) {
        detach(div2);
      }
      if (if_block)
        if_block.d();
      mounted = false;
      run_all(dispose);
    }
  };
}
function create_if_block_18(ctx) {
  let img;
  let img_src_value;
  return {
    c() {
      img = element("img");
      if (!src_url_equal(img.src, img_src_value = /*gifPreview*/
      ctx[6]))
        attr(img, "src", img_src_value);
      attr(img, "alt", "MultiPass GIF");
      attr(img, "class", "gif-preview svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*gifPreview*/
      64 && !src_url_equal(img.src, img_src_value = /*gifPreview*/
      ctx2[6])) {
        attr(img, "src", img_src_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(img);
      }
    }
  };
}
function create_if_block_17(ctx) {
  let h2;
  let t_value = (
    /*parsedMultiPass*/
    ctx[2].meta.title + ""
  );
  let t;
  return {
    c() {
      h2 = element("h2");
      t = text(t_value);
      attr(h2, "class", "multipass-title svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, h2, anchor);
      append(h2, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*parsedMultiPass*/
      4 && t_value !== (t_value = /*parsedMultiPass*/
      ctx2[2].meta.title + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(h2);
      }
    }
  };
}
function create_if_block_16(ctx) {
  let p;
  let t_value = (
    /*parsedMultiPass*/
    ctx[2].meta.description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "multipass-description svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*parsedMultiPass*/
      4 && t_value !== (t_value = /*parsedMultiPass*/
      ctx2[2].meta.description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_15(ctx) {
  let p;
  let t0;
  let t1_value = (
    /*parsedMultiPass*/
    ctx[2].meta.author + ""
  );
  let t1;
  return {
    c() {
      p = element("p");
      t0 = text("by ");
      t1 = text(t1_value);
      attr(p, "class", "multipass-author svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t0);
      append(p, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*parsedMultiPass*/
      4 && t1_value !== (t1_value = /*parsedMultiPass*/
      ctx2[2].meta.author + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_14(ctx) {
  let div1;
  return {
    c() {
      div1 = element("div");
      div1.innerHTML = `<div class="spinner svelte-19miub8"></div> <p class="svelte-19miub8">Loading results...</p>`;
      attr(div1, "class", "loading svelte-19miub8");
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
    ctx[7].error + ""
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
      attr(p, "class", "svelte-19miub8");
      attr(button, "class", "retry-button svelte-19miub8");
      attr(div, "class", "error svelte-19miub8");
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
          ctx[8]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      128 && t2_value !== (t2_value = /*$query*/
      ctx2[7].error + ""))
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
function create_if_block_2(ctx) {
  let t0;
  let div;
  let span;
  let t1_value = (
    /*$query*/
    ctx[7].count + ""
  );
  let t1;
  let t2;
  let t3_value = (
    /*$query*/
    ctx[7].count === 1 ? "" : "s"
  );
  let t3;
  function select_block_type_1(ctx2, dirty) {
    if (
      /*render*/
      ctx2[0] === "list"
    )
      return create_if_block_3;
    if (
      /*render*/
      ctx2[0] === "cards"
    )
      return create_if_block_8;
    if (
      /*render*/
      ctx2[0] === "compact"
    )
      return create_if_block_11;
  }
  let current_block_type = select_block_type_1(ctx);
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
      attr(span, "class", "result-count svelte-19miub8");
      attr(div, "class", "meta svelte-19miub8");
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
      if (current_block_type === (current_block_type = select_block_type_1(ctx2)) && if_block) {
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
      128 && t1_value !== (t1_value = /*$query*/
      ctx2[7].count + ""))
        set_data(t1, t1_value);
      if (dirty & /*$query*/
      128 && t3_value !== (t3_value = /*$query*/
      ctx2[7].count === 1 ? "" : "s"))
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
  let each_value_3 = ensure_array_like(
    /*$query*/
    ctx[7].results
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
      attr(div, "class", "compact svelte-19miub8");
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
      128) {
        each_value_3 = ensure_array_like(
          /*$query*/
          ctx2[7].results
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
function create_if_block_8(ctx) {
  let div;
  let each_value_2 = ensure_array_like(
    /*$query*/
    ctx[7].results
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
      attr(div, "class", "cards svelte-19miub8");
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
      128) {
        each_value_2 = ensure_array_like(
          /*$query*/
          ctx2[7].results
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
function create_if_block_3(ctx) {
  let ul;
  let each_value = ensure_array_like(
    /*$query*/
    ctx[7].results
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
      attr(ul, "class", "list svelte-19miub8");
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
      128) {
        each_value = ensure_array_like(
          /*$query*/
          ctx2[7].results
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
function create_each_block_3(ctx) {
  let a;
  let t0_value = getTitle(
    /*item*/
    ctx[18]
  ) + "";
  let t0;
  let t1;
  let a_href_value;
  let if_block_anchor;
  let if_block = (
    /*i*/
    ctx[27] < /*$query*/
    ctx[7].results.length - 1 && create_if_block_12()
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
        ctx[18]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-19miub8");
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
      128 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[18]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*$query*/
      128 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[18]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*i*/
        ctx2[27] < /*$query*/
        ctx2[7].results.length - 1
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
      ctx[18].image))
        attr(img, "src", img_src_value);
      attr(img, "alt", img_alt_value = getTitle(
        /*item*/
        ctx[18]
      ));
      attr(img, "loading", "lazy");
      attr(img, "class", "svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      128 && !src_url_equal(img.src, img_src_value = /*item*/
      ctx2[18].image)) {
        attr(img, "src", img_src_value);
      }
      if (dirty & /*$query*/
      128 && img_alt_value !== (img_alt_value = getTitle(
        /*item*/
        ctx2[18]
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
    ctx[18].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      128 && t_value !== (t_value = /*item*/
      ctx2[18].description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
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
    ctx[18]
  ) + "";
  let t1;
  let a_href_value;
  let t2;
  let t3;
  let if_block0 = (
    /*item*/
    ctx[18].image && create_if_block_10(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[18].description && create_if_block_9(ctx)
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
      attr(a, "href", a_href_value = getUrl(
        /*item*/
        ctx[18]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-19miub8");
      attr(h3, "class", "svelte-19miub8");
      attr(article, "class", "card svelte-19miub8");
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
    },
    p(ctx2, dirty) {
      if (
        /*item*/
        ctx2[18].image
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
      128 && t1_value !== (t1_value = getTitle(
        /*item*/
        ctx2[18]
      ) + ""))
        set_data(t1, t1_value);
      if (dirty & /*$query*/
      128 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[18]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[18].description
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
    },
    d(detaching) {
      if (detaching) {
        detach(article);
      }
      if (if_block0)
        if_block0.d();
      if (if_block1)
        if_block1.d();
    }
  };
}
function create_if_block_7(ctx) {
  let p;
  let t_value = (
    /*item*/
    ctx[18].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      128 && t_value !== (t_value = /*item*/
      ctx2[18].description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_6(ctx) {
  let time;
  let t_value = formatDate(
    /*item*/
    ctx[18].date
  ) + "";
  let t;
  return {
    c() {
      time = element("time");
      t = text(t_value);
      attr(time, "class", "date svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, time, anchor);
      append(time, t);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      128 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[18].date
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
function create_if_block_4(ctx) {
  let div;
  let each_value_1 = ensure_array_like(
    /*item*/
    ctx[18].octothorpes
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
      attr(div, "class", "tags svelte-19miub8");
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
      128) {
        each_value_1 = ensure_array_like(
          /*item*/
          ctx2[18].octothorpes
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
function create_if_block_5(ctx) {
  let span;
  let t0;
  let t1_value = (
    /*thorpe*/
    ctx[21] + ""
  );
  let t1;
  return {
    c() {
      span = element("span");
      t0 = text("#");
      t1 = text(t1_value);
      attr(span, "class", "tag svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t0);
      append(span, t1);
    },
    p(ctx2, dirty) {
      if (dirty & /*$query*/
      128 && t1_value !== (t1_value = /*thorpe*/
      ctx2[21] + ""))
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
  ctx[21] === "string" && create_if_block_5(ctx);
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
      ctx2[21] === "string") {
        if (if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block = create_if_block_5(ctx2);
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
    ctx[18]
  ) + "";
  let t0;
  let a_href_value;
  let t1;
  let t2;
  let t3;
  let t4;
  let if_block0 = (
    /*item*/
    ctx[18].description && create_if_block_7(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[18].date && create_if_block_6(ctx)
  );
  let if_block2 = (
    /*item*/
    ctx[18].octothorpes && /*item*/
    ctx[18].octothorpes.length > 0 && create_if_block_4(ctx)
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
        ctx[18]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-19miub8");
      attr(li, "class", "svelte-19miub8");
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
      128 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[18]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty & /*$query*/
      128 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[18]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[18].description
      ) {
        if (if_block0) {
          if_block0.p(ctx2, dirty);
        } else {
          if_block0 = create_if_block_7(ctx2);
          if_block0.c();
          if_block0.m(li, t2);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*item*/
        ctx2[18].date
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_6(ctx2);
          if_block1.c();
          if_block1.m(li, t3);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*item*/
        ctx2[18].octothorpes && /*item*/
        ctx2[18].octothorpes.length > 0
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_4(ctx2);
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
function create_if_block_1(ctx) {
  let div;
  let p;
  let strong;
  let t1;
  let t2;
  return {
    c() {
      div = element("div");
      p = element("p");
      strong = element("strong");
      strong.textContent = "Error:";
      t1 = space();
      t2 = text(
        /*error*/
        ctx[5]
      );
      attr(p, "class", "svelte-19miub8");
      attr(div, "class", "upload-error svelte-19miub8");
    },
    m(target, anchor) {
      insert(target, div, anchor);
      append(div, p);
      append(p, strong);
      append(p, t1);
      append(p, t2);
    },
    p(ctx2, dirty) {
      if (dirty & /*error*/
      32)
        set_data(
          t2,
          /*error*/
          ctx2[5]
        );
    },
    d(detaching) {
      if (detaching) {
        detach(div);
      }
    }
  };
}
function create_fragment(ctx) {
  let if_block_anchor;
  function select_block_type(ctx2, dirty) {
    if (!/*parsedMultiPass*/
    ctx2[2])
      return create_if_block;
    return create_else_block;
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
function extractMultipassFromGif(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (!signature.startsWith("GIF")) {
    throw new Error("Not a valid GIF file");
  }
  let pos = 13;
  const packed = bytes[10];
  if (packed & 128) {
    const colorTableSize = 2 << (packed & 7);
    pos += colorTableSize * 3;
  }
  while (pos < bytes.length - 1) {
    if (bytes[pos] === 33 && bytes[pos + 1] === 254) {
      pos += 2;
      let comment = "";
      while (pos < bytes.length && bytes[pos] !== 0) {
        const blockSize = bytes[pos];
        pos++;
        if (pos + blockSize > bytes.length) {
          throw new Error("Malformed GIF: comment block extends beyond file");
        }
        comment += String.fromCharCode(...bytes.slice(pos, pos + blockSize));
        pos += blockSize;
      }
      try {
        const parsed = JSON.parse(comment);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      } catch (e) {
      }
    }
    pos++;
  }
  throw new Error("No MultiPass JSON found in GIF");
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
  let $query, $$unsubscribe_query = noop, $$subscribe_query = () => ($$unsubscribe_query(), $$unsubscribe_query = subscribe(query, ($$value) => $$invalidate(7, $query = $$value)), query);
  $$self.$$.on_destroy.push(() => $$unsubscribe_query());
  let { render = "list" } = $$props;
  let { placeholder = "Drop MultiPass JSON or GIF here" } = $$props;
  let parsedMultiPass = null;
  let queryParams = null;
  let what = "pages";
  let by = "thorped";
  let query = null;
  $$subscribe_query();
  let isDragging = false;
  let error = null;
  let gifPreview = null;
  async function load() {
    if (!query || !queryParams)
      return;
    await query.fetch(queryParams);
  }
  function handleDragOver(e) {
    e.preventDefault();
    $$invalidate(4, isDragging = true);
  }
  function handleDragLeave(e) {
    e.preventDefault();
    $$invalidate(4, isDragging = false);
  }
  function handleDrop(e) {
    var _a, _b;
    e.preventDefault();
    $$invalidate(4, isDragging = false);
    const file = (_b = (_a = e.dataTransfer) == null ? void 0 : _a.files) == null ? void 0 : _b[0];
    if (file) {
      handleFile(file);
    }
  }
  function handleFileInput(e) {
    var _a, _b;
    const file = (_b = (_a = e.target) == null ? void 0 : _a.files) == null ? void 0 : _b[0];
    if (file) {
      handleFile(file);
    }
    if (e.target)
      e.target.value = "";
  }
  async function handleFile(file) {
    $$invalidate(5, error = null);
    $$invalidate(6, gifPreview = null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let multiPass;
        if (file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")) {
          multiPass = extractMultipassFromGif(e.target.result);
          const blob = new Blob([e.target.result], { type: "image/gif" });
          $$invalidate(6, gifPreview = URL.createObjectURL(blob));
        } else {
          multiPass = JSON.parse(e.target.result);
          $$invalidate(6, gifPreview = null);
        }
        $$invalidate(2, parsedMultiPass = parseMultipass(multiPass));
        if (!parsedMultiPass) {
          throw new Error("Invalid MultiPass structure");
        }
      } catch (err) {
        $$invalidate(5, error = `Error reading file: ${err.message}`);
        $$invalidate(2, parsedMultiPass = null);
        $$invalidate(6, gifPreview = null);
      }
    };
    if (file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }
  function reset() {
    $$invalidate(2, parsedMultiPass = null);
    $$invalidate(14, queryParams = null);
    $$subscribe_query($$invalidate(3, query = null));
    $$invalidate(5, error = null);
    if (gifPreview) {
      URL.revokeObjectURL(gifPreview);
      $$invalidate(6, gifPreview = null);
    }
  }
  $$self.$$set = ($$props2) => {
    if ("render" in $$props2)
      $$invalidate(0, render = $$props2.render);
    if ("placeholder" in $$props2)
      $$invalidate(1, placeholder = $$props2.placeholder);
  };
  $$self.$$.update = () => {
    if ($$self.$$.dirty & /*parsedMultiPass, what, by, query, queryParams*/
    114700) {
      {
        if (parsedMultiPass) {
          $$invalidate(15, { what, by } = extractWhatBy(parsedMultiPass), what, ($$invalidate(16, by), $$invalidate(2, parsedMultiPass), $$invalidate(15, what), $$invalidate(3, query), $$invalidate(14, queryParams)));
          $$invalidate(14, queryParams = multipassToParams(parsedMultiPass));
          $$subscribe_query($$invalidate(3, query = createOctoQuery(what, by)));
          if (query && queryParams) {
            setTimeout(() => load(), 50);
          }
        }
      }
    }
  };
  return [
    render,
    placeholder,
    parsedMultiPass,
    query,
    isDragging,
    error,
    gifPreview,
    $query,
    load,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInput,
    reset,
    queryParams,
    what,
    by
  ];
}
class OctoMultipassLoader extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance, create_fragment, safe_not_equal, { render: 0, placeholder: 1 }, add_css);
  }
  get render() {
    return this.$$.ctx[0];
  }
  set render(render) {
    this.$$set({ render });
    flush();
  }
  get placeholder() {
    return this.$$.ctx[1];
  }
  set placeholder(placeholder) {
    this.$$set({ placeholder });
    flush();
  }
}
customElements.define("octo-multipass-loader", create_custom_element(OctoMultipassLoader, { "render": {}, "placeholder": {} }, [], [], true));
export {
  OctoMultipassLoader as default
};
//# sourceMappingURL=octo-multipass-loader.js.map
