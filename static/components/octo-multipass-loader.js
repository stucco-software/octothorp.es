import { c as create_custom_element, S as SvelteComponent, i as init, f as flush, s as safe_not_equal, a as append_styles, e as empty, b as insert, n as noop, d as detach, o as onMount, w as subscribe, h as createOctoQuery, j as element, k as space, l as attr, x as toggle_class, m as append, t as text, y as set_style, p as listen, q as set_data, z as run_all, v as src_url_equal, r as ensure_array_like, u as destroy_each } from "./octo-store-sa0Q_z2k.js";
import { p as parseMultipass, e as extractWhatBy, m as multipassToParams } from "./multipass-utils-Btdq4M2H.js";
function add_css(target) {
  append_styles(target, "svelte-g0arss", ":host{--octo-font:system-ui, -apple-system, sans-serif;--octo-primary:#3c7efb;--octo-background:#ffffff;--octo-text:#333333;--octo-border:#e0e0e0;--octo-error:#d32f2f;--octo-spacing:1rem;--octo-radius:4px;display:block;font-family:var(--octo-font);color:var(--octo-text)}.gif-mode.svelte-g0arss.svelte-g0arss{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--octo-spacing)}.gif-button.svelte-g0arss.svelte-g0arss{padding:0;border:none;background:none;cursor:pointer;display:block}.gif-clickable.svelte-g0arss.svelte-g0arss{max-width:100%;height:auto;display:block;border-radius:var(--octo-radius);transition:all 0.2s ease;box-shadow:0 2px 8px rgba(0, 0, 0, 0.1)}.gif-button.svelte-g0arss:hover .gif-clickable.svelte-g0arss{transform:scale(1.02);box-shadow:0 4px 16px rgba(0, 0, 0, 0.15)}.gif-button.svelte-g0arss.svelte-g0arss:focus{outline:2px solid var(--octo-primary);outline-offset:2px;border-radius:var(--octo-radius)}.upload-zone.svelte-g0arss.svelte-g0arss{min-height:300px;border:3px dashed var(--octo-border);border-radius:var(--octo-radius);background:var(--octo-background);display:flex;align-items:center;justify-content:center;padding:var(--octo-spacing);transition:all 0.2s ease;cursor:pointer}.upload-zone.svelte-g0arss.svelte-g0arss:hover{border-color:var(--octo-primary);background:#f8f9fa}.upload-zone.dragging.svelte-g0arss.svelte-g0arss{border-color:var(--octo-primary);border-style:solid;background:#e3f2fd;transform:scale(1.02)}.upload-content.svelte-g0arss.svelte-g0arss{text-align:center;max-width:400px}.upload-icon.svelte-g0arss.svelte-g0arss{font-size:4rem;margin-bottom:var(--octo-spacing)}.upload-text.svelte-g0arss.svelte-g0arss{font-size:1.125rem;font-weight:bold;margin:0 0 0.5rem 0;color:var(--octo-text)}.upload-subtext.svelte-g0arss.svelte-g0arss{font-size:0.875rem;color:#666;margin:0 0 var(--octo-spacing) 0}.upload-button.svelte-g0arss.svelte-g0arss{display:inline-block;padding:0.75rem 1.5rem;background:var(--octo-primary);color:white;border-radius:var(--octo-radius);cursor:pointer;font-weight:bold;transition:opacity 0.2s}.upload-button.svelte-g0arss.svelte-g0arss:hover{opacity:0.9}.upload-error.svelte-g0arss.svelte-g0arss{margin-top:var(--octo-spacing);padding:var(--octo-spacing);background:#ffebee;border:1px solid var(--octo-error);border-radius:var(--octo-radius)}.upload-error.svelte-g0arss p.svelte-g0arss{margin:0;color:var(--octo-error)}.results-container.svelte-g0arss.svelte-g0arss{background:var(--octo-background)}.results-header.svelte-g0arss.svelte-g0arss{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--octo-spacing);padding-bottom:var(--octo-spacing);border-bottom:2px solid var(--octo-border);margin-bottom:var(--octo-spacing)}.header-content.svelte-g0arss.svelte-g0arss{display:flex;gap:var(--octo-spacing);flex:1;min-width:0}.gif-preview.svelte-g0arss.svelte-g0arss{width:100px;height:100px;object-fit:cover;border:1px solid var(--octo-border);border-radius:var(--octo-radius);flex-shrink:0}.header-text.svelte-g0arss.svelte-g0arss{flex:1;min-width:0}.multipass-title.svelte-g0arss.svelte-g0arss{margin:0 0 0.5rem 0;font-size:1.5rem;font-weight:bold}.multipass-description.svelte-g0arss.svelte-g0arss{margin:0 0 0.5rem 0;color:#666;line-height:1.5}.multipass-author.svelte-g0arss.svelte-g0arss{margin:0;font-size:0.875rem;font-style:italic;color:#999}.button-group.svelte-g0arss.svelte-g0arss{display:flex;gap:0.5rem;flex-shrink:0}.reset-button.svelte-g0arss.svelte-g0arss{padding:0.5rem 1rem;background:var(--octo-background);border:1px solid var(--octo-border);border-radius:var(--octo-radius);cursor:pointer;font-size:0.875rem;white-space:nowrap}.reset-button.svelte-g0arss.svelte-g0arss:hover{background:#f8f9fa}.loading.svelte-g0arss.svelte-g0arss{text-align:center;padding:calc(var(--octo-spacing) * 2)}.spinner.svelte-g0arss.svelte-g0arss{width:40px;height:40px;margin:0 auto var(--octo-spacing);border:4px solid var(--octo-border);border-top-color:var(--octo-primary);border-radius:50%;animation:svelte-g0arss-spin 1s linear infinite}@keyframes svelte-g0arss-spin{to{transform:rotate(360deg)}}.loading.svelte-g0arss p.svelte-g0arss{margin:0;color:#666}.error.svelte-g0arss.svelte-g0arss{padding:var(--octo-spacing);background:#ffebee;border:1px solid var(--octo-error);border-radius:var(--octo-radius);text-align:center;margin-bottom:var(--octo-spacing)}.error.svelte-g0arss p.svelte-g0arss{color:var(--octo-error);margin:0 0 var(--octo-spacing) 0}.retry-button.svelte-g0arss.svelte-g0arss{padding:0.5rem 1rem;background:var(--octo-error);color:white;border:none;border-radius:var(--octo-radius);cursor:pointer}.list.svelte-g0arss.svelte-g0arss{list-style:none;padding:0;margin:0}.list.svelte-g0arss li.svelte-g0arss{padding:var(--octo-spacing);border-bottom:1px solid var(--octo-border)}.list.svelte-g0arss li.svelte-g0arss:last-child{border-bottom:none}.cards.svelte-g0arss.svelte-g0arss{display:grid;grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));gap:var(--octo-spacing)}.card.svelte-g0arss.svelte-g0arss{padding:var(--octo-spacing);border:1px solid var(--octo-border);border-radius:var(--octo-radius)}.card.svelte-g0arss img.svelte-g0arss{width:100%;height:auto;border-radius:var(--octo-radius);margin-bottom:0.5rem}.card.svelte-g0arss h3.svelte-g0arss{margin:0 0 0.5rem 0;font-size:1.125rem}.compact.svelte-g0arss.svelte-g0arss{line-height:1.5;padding:var(--octo-spacing)}a.svelte-g0arss.svelte-g0arss{color:var(--octo-primary);text-decoration:none}a.svelte-g0arss.svelte-g0arss:hover{text-decoration:underline}.description.svelte-g0arss.svelte-g0arss{margin:0.5rem 0 0 0;color:#666;font-size:0.875rem;line-height:1.4}.date.svelte-g0arss.svelte-g0arss{display:block;margin-top:0.25rem;font-size:0.75rem;color:#999}.tags.svelte-g0arss.svelte-g0arss{display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.5rem}.tag.svelte-g0arss.svelte-g0arss{display:inline-block;padding:0.125rem 0.375rem;background:#f0f0f0;border-radius:var(--octo-radius);font-size:0.75rem}.meta.svelte-g0arss.svelte-g0arss{margin-top:var(--octo-spacing);padding-top:var(--octo-spacing);border-top:1px solid var(--octo-border);text-align:right;font-size:0.875rem;color:#666}.result-count.svelte-g0arss.svelte-g0arss{font-weight:bold}");
}
function get_each_context_3(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[27] = list[i];
  child_ctx[36] = i;
  return child_ctx;
}
function get_each_context_2(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[27] = list[i];
  return child_ctx;
}
function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[27] = list[i];
  return child_ctx;
}
function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[30] = list[i];
  return child_ctx;
}
function create_else_block_1(ctx) {
  var _a, _b, _c;
  let div4;
  let div3;
  let div1;
  let t0;
  let div0;
  let t1;
  let t2;
  let t3;
  let div2;
  let show_if_1;
  let t4;
  let show_if = !/*target*/
  ctx[3] || /*target*/
  ctx[3].trim() === "";
  let if_block0 = (
    /*gifPreview*/
    ctx[6] && create_if_block_23(ctx)
  );
  let if_block1 = (
    /*parsedMultiPass*/
    ((_a = ctx[4].meta) == null ? void 0 : _a.title) && create_if_block_22(ctx)
  );
  let if_block2 = (
    /*parsedMultiPass*/
    ((_b = ctx[4].meta) == null ? void 0 : _b.description) && create_if_block_21(ctx)
  );
  let if_block3 = (
    /*parsedMultiPass*/
    ((_c = ctx[4].meta) == null ? void 0 : _c.author) && create_if_block_20(ctx)
  );
  function select_block_type_2(ctx2, dirty) {
    if (dirty[0] & /*gif*/
    4)
      show_if_1 = null;
    if (show_if_1 == null)
      show_if_1 = !!/*gif*/
      (ctx2[2] && /*gif*/
      ctx2[2].trim() !== "");
    if (show_if_1)
      return create_if_block_19;
    return create_else_block_2;
  }
  let current_block_type = select_block_type_2(ctx, [-1, -1]);
  let if_block4 = current_block_type(ctx);
  let if_block5 = show_if && create_if_block_5(ctx);
  return {
    c() {
      div4 = element("div");
      div3 = element("div");
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
      div2 = element("div");
      if_block4.c();
      t4 = space();
      if (if_block5)
        if_block5.c();
      attr(div0, "class", "header-text svelte-g0arss");
      attr(div1, "class", "header-content svelte-g0arss");
      attr(div2, "class", "button-group svelte-g0arss");
      attr(div3, "class", "results-header svelte-g0arss");
      toggle_class(
        div3,
        "target-mode",
        /*target*/
        ctx[3] && /*target*/
        ctx[3].trim() !== ""
      );
      attr(div4, "class", "results-container svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, div4, anchor);
      append(div4, div3);
      append(div3, div1);
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
      append(div3, t3);
      append(div3, div2);
      if_block4.m(div2, null);
      append(div4, t4);
      if (if_block5)
        if_block5.m(div4, null);
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
          if_block0 = create_if_block_23(ctx2);
          if_block0.c();
          if_block0.m(div1, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*parsedMultiPass*/
        (_a2 = ctx2[4].meta) == null ? void 0 : _a2.title
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_22(ctx2);
          if_block1.c();
          if_block1.m(div0, t1);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*parsedMultiPass*/
        (_b2 = ctx2[4].meta) == null ? void 0 : _b2.description
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_21(ctx2);
          if_block2.c();
          if_block2.m(div0, t2);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
      if (
        /*parsedMultiPass*/
        (_c2 = ctx2[4].meta) == null ? void 0 : _c2.author
      ) {
        if (if_block3) {
          if_block3.p(ctx2, dirty);
        } else {
          if_block3 = create_if_block_20(ctx2);
          if_block3.c();
          if_block3.m(div0, null);
        }
      } else if (if_block3) {
        if_block3.d(1);
        if_block3 = null;
      }
      if (current_block_type === (current_block_type = select_block_type_2(ctx2, dirty)) && if_block4) {
        if_block4.p(ctx2, dirty);
      } else {
        if_block4.d(1);
        if_block4 = current_block_type(ctx2);
        if (if_block4) {
          if_block4.c();
          if_block4.m(div2, null);
        }
      }
      if (dirty[0] & /*target*/
      8) {
        toggle_class(
          div3,
          "target-mode",
          /*target*/
          ctx2[3] && /*target*/
          ctx2[3].trim() !== ""
        );
      }
      if (dirty[0] & /*target*/
      8)
        show_if = !/*target*/
        ctx2[3] || /*target*/
        ctx2[3].trim() === "";
      if (show_if) {
        if (if_block5) {
          if_block5.p(ctx2, dirty);
        } else {
          if_block5 = create_if_block_5(ctx2);
          if_block5.c();
          if_block5.m(div4, null);
        }
      } else if (if_block5) {
        if_block5.d(1);
        if_block5 = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(div4);
      }
      if (if_block0)
        if_block0.d();
      if (if_block1)
        if_block1.d();
      if (if_block2)
        if_block2.d();
      if (if_block3)
        if_block3.d();
      if_block4.d();
      if (if_block5)
        if_block5.d();
    }
  };
}
function create_if_block_3(ctx) {
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
    ctx[11] && create_if_block_4(ctx)
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
      attr(div0, "class", "upload-icon svelte-g0arss");
      attr(p0, "class", "upload-text svelte-g0arss");
      attr(p1, "class", "upload-subtext svelte-g0arss");
      attr(input, "type", "file");
      attr(input, "accept", ".json,.gif,application/json,image/gif");
      set_style(input, "display", "none");
      attr(label, "class", "upload-button svelte-g0arss");
      attr(div1, "class", "upload-content svelte-g0arss");
      attr(div2, "class", "upload-zone svelte-g0arss");
      attr(div2, "role", "button");
      attr(div2, "tabindex", "0");
      toggle_class(
        div2,
        "dragging",
        /*isDragging*/
        ctx[10]
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
            ctx[16]
          ),
          listen(
            div2,
            "dragover",
            /*handleDragOver*/
            ctx[13]
          ),
          listen(
            div2,
            "dragleave",
            /*handleDragLeave*/
            ctx[14]
          ),
          listen(
            div2,
            "drop",
            /*handleDrop*/
            ctx[15]
          )
        ];
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*placeholder*/
      2)
        set_data(
          t2,
          /*placeholder*/
          ctx2[1]
        );
      if (
        /*error*/
        ctx2[11]
      ) {
        if (if_block) {
          if_block.p(ctx2, dirty);
        } else {
          if_block = create_if_block_4(ctx2);
          if_block.c();
          if_block.m(div1, null);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }
      if (dirty[0] & /*isDragging*/
      1024) {
        toggle_class(
          div2,
          "dragging",
          /*isDragging*/
          ctx2[10]
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
function create_if_block(ctx) {
  let div;
  function select_block_type_1(ctx2, dirty) {
    if (
      /*error*/
      ctx2[11]
    )
      return create_if_block_1;
    if (
      /*gifPreview*/
      ctx2[6]
    )
      return create_if_block_2;
    return create_else_block;
  }
  let current_block_type = select_block_type_1(ctx);
  let if_block = current_block_type(ctx);
  return {
    c() {
      div = element("div");
      if_block.c();
      attr(div, "class", "gif-mode svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, div, anchor);
      if_block.m(div, null);
    },
    p(ctx2, dirty) {
      if (current_block_type === (current_block_type = select_block_type_1(ctx2)) && if_block) {
        if_block.p(ctx2, dirty);
      } else {
        if_block.d(1);
        if_block = current_block_type(ctx2);
        if (if_block) {
          if_block.c();
          if_block.m(div, null);
        }
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
function create_if_block_23(ctx) {
  let img;
  let img_src_value;
  return {
    c() {
      img = element("img");
      if (!src_url_equal(img.src, img_src_value = /*gifPreview*/
      ctx[6]))
        attr(img, "src", img_src_value);
      attr(img, "alt", "MultiPass GIF");
      attr(img, "class", "gif-preview svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*gifPreview*/
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
function create_if_block_22(ctx) {
  let h2;
  let t_value = (
    /*parsedMultiPass*/
    ctx[4].meta.title + ""
  );
  let t;
  return {
    c() {
      h2 = element("h2");
      t = text(t_value);
      attr(h2, "class", "multipass-title svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, h2, anchor);
      append(h2, t);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*parsedMultiPass*/
      16 && t_value !== (t_value = /*parsedMultiPass*/
      ctx2[4].meta.title + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(h2);
      }
    }
  };
}
function create_if_block_21(ctx) {
  let p;
  let t_value = (
    /*parsedMultiPass*/
    ctx[4].meta.description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "multipass-description svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*parsedMultiPass*/
      16 && t_value !== (t_value = /*parsedMultiPass*/
      ctx2[4].meta.description + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_if_block_20(ctx) {
  let p;
  let t0;
  let t1_value = (
    /*parsedMultiPass*/
    ctx[4].meta.author + ""
  );
  let t1;
  return {
    c() {
      p = element("p");
      t0 = text("by ");
      t1 = text(t1_value);
      attr(p, "class", "multipass-author svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t0);
      append(p, t1);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*parsedMultiPass*/
      16 && t1_value !== (t1_value = /*parsedMultiPass*/
      ctx2[4].meta.author + ""))
        set_data(t1, t1_value);
    },
    d(detaching) {
      if (detaching) {
        detach(p);
      }
    }
  };
}
function create_else_block_2(ctx) {
  let button;
  let mounted;
  let dispose;
  return {
    c() {
      button = element("button");
      button.textContent = "Load New MultiPass";
      attr(button, "class", "reset-button svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, button, anchor);
      if (!mounted) {
        dispose = listen(
          button,
          "click",
          /*reset*/
          ctx[18]
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
  let button0;
  let t1;
  let button1;
  let mounted;
  let dispose;
  return {
    c() {
      button0 = element("button");
      button0.textContent = "Load New MultiPass";
      t1 = space();
      button1 = element("button");
      button1.textContent = "X";
      attr(button0, "class", "reset-button svelte-g0arss");
      attr(button1, "class", "reset-button svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, button0, anchor);
      insert(target, t1, anchor);
      insert(target, button1, anchor);
      if (!mounted) {
        dispose = [
          listen(
            button0,
            "click",
            /*loadDifferent*/
            ctx[19]
          ),
          listen(
            button1,
            "click",
            /*reset*/
            ctx[18]
          )
        ];
        mounted = true;
      }
    },
    p: noop,
    d(detaching) {
      if (detaching) {
        detach(button0);
        detach(t1);
        detach(button1);
      }
      mounted = false;
      run_all(dispose);
    }
  };
}
function create_if_block_5(ctx) {
  let t0;
  let t1;
  let if_block2_anchor;
  let if_block0 = (
    /*query*/
    ctx[5] && /*$query*/
    ctx[9].loading && create_if_block_18()
  );
  let if_block1 = (
    /*query*/
    ctx[5] && /*$query*/
    ctx[9].error && create_if_block_17(ctx)
  );
  let if_block2 = (
    /*query*/
    ctx[5] && /*$query*/
    ctx[9].results.length > 0 && !/*$query*/
    ctx[9].loading && create_if_block_6(ctx)
  );
  return {
    c() {
      if (if_block0)
        if_block0.c();
      t0 = space();
      if (if_block1)
        if_block1.c();
      t1 = space();
      if (if_block2)
        if_block2.c();
      if_block2_anchor = empty();
    },
    m(target, anchor) {
      if (if_block0)
        if_block0.m(target, anchor);
      insert(target, t0, anchor);
      if (if_block1)
        if_block1.m(target, anchor);
      insert(target, t1, anchor);
      if (if_block2)
        if_block2.m(target, anchor);
      insert(target, if_block2_anchor, anchor);
    },
    p(ctx2, dirty) {
      if (
        /*query*/
        ctx2[5] && /*$query*/
        ctx2[9].loading
      ) {
        if (if_block0)
          ;
        else {
          if_block0 = create_if_block_18();
          if_block0.c();
          if_block0.m(t0.parentNode, t0);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }
      if (
        /*query*/
        ctx2[5] && /*$query*/
        ctx2[9].error
      ) {
        if (if_block1) {
          if_block1.p(ctx2, dirty);
        } else {
          if_block1 = create_if_block_17(ctx2);
          if_block1.c();
          if_block1.m(t1.parentNode, t1);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }
      if (
        /*query*/
        ctx2[5] && /*$query*/
        ctx2[9].results.length > 0 && !/*$query*/
        ctx2[9].loading
      ) {
        if (if_block2) {
          if_block2.p(ctx2, dirty);
        } else {
          if_block2 = create_if_block_6(ctx2);
          if_block2.c();
          if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
    },
    d(detaching) {
      if (detaching) {
        detach(t0);
        detach(t1);
        detach(if_block2_anchor);
      }
      if (if_block0)
        if_block0.d(detaching);
      if (if_block1)
        if_block1.d(detaching);
      if (if_block2)
        if_block2.d(detaching);
    }
  };
}
function create_if_block_18(ctx) {
  let div1;
  return {
    c() {
      div1 = element("div");
      div1.innerHTML = `<div class="spinner svelte-g0arss"></div> <p class="svelte-g0arss">Loading results...</p>`;
      attr(div1, "class", "loading svelte-g0arss");
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
function create_if_block_17(ctx) {
  let div;
  let p;
  let strong;
  let t1;
  let t2_value = (
    /*$query*/
    ctx[9].error + ""
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
      attr(p, "class", "svelte-g0arss");
      attr(button, "class", "retry-button svelte-g0arss");
      attr(div, "class", "error svelte-g0arss");
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
          ctx[12]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*$query*/
      512 && t2_value !== (t2_value = /*$query*/
      ctx2[9].error + ""))
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
function create_if_block_6(ctx) {
  let t0;
  let div;
  let span;
  let t1_value = (
    /*$query*/
    ctx[9].count + ""
  );
  let t1;
  let t2;
  let t3_value = (
    /*$query*/
    ctx[9].count === 1 ? "" : "s"
  );
  let t3;
  function select_block_type_3(ctx2, dirty) {
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
      return create_if_block_15;
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
      attr(span, "class", "result-count svelte-g0arss");
      attr(div, "class", "meta svelte-g0arss");
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
      if (dirty[0] & /*$query*/
      512 && t1_value !== (t1_value = /*$query*/
      ctx2[9].count + ""))
        set_data(t1, t1_value);
      if (dirty[0] & /*$query*/
      512 && t3_value !== (t3_value = /*$query*/
      ctx2[9].count === 1 ? "" : "s"))
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
function create_if_block_15(ctx) {
  let div;
  let each_value_3 = ensure_array_like(
    /*$query*/
    ctx[9].results
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
      attr(div, "class", "compact svelte-g0arss");
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
      if (dirty[0] & /*$query*/
      512) {
        each_value_3 = ensure_array_like(
          /*$query*/
          ctx2[9].results
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
    ctx[9].results
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
      attr(div, "class", "cards svelte-g0arss");
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
      if (dirty[0] & /*$query*/
      512) {
        each_value_2 = ensure_array_like(
          /*$query*/
          ctx2[9].results
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
    ctx[9].results
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
      attr(ul, "class", "list svelte-g0arss");
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
      if (dirty[0] & /*$query*/
      512) {
        each_value = ensure_array_like(
          /*$query*/
          ctx2[9].results
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
function create_if_block_16(ctx) {
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
    ctx[27]
  ) + "";
  let t0;
  let t1;
  let a_href_value;
  let if_block_anchor;
  let if_block = (
    /*i*/
    ctx[36] < /*$query*/
    ctx[9].results.length - 1 && create_if_block_16()
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
        ctx[27]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-g0arss");
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
      if (dirty[0] & /*$query*/
      512 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[27]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty[0] & /*$query*/
      512 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[27]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*i*/
        ctx2[36] < /*$query*/
        ctx2[9].results.length - 1
      ) {
        if (if_block)
          ;
        else {
          if_block = create_if_block_16();
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
function create_if_block_14(ctx) {
  let img;
  let img_src_value;
  let img_alt_value;
  return {
    c() {
      img = element("img");
      if (!src_url_equal(img.src, img_src_value = /*item*/
      ctx[27].image))
        attr(img, "src", img_src_value);
      attr(img, "alt", img_alt_value = getTitle(
        /*item*/
        ctx[27]
      ));
      attr(img, "loading", "lazy");
      attr(img, "class", "svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*$query*/
      512 && !src_url_equal(img.src, img_src_value = /*item*/
      ctx2[27].image)) {
        attr(img, "src", img_src_value);
      }
      if (dirty[0] & /*$query*/
      512 && img_alt_value !== (img_alt_value = getTitle(
        /*item*/
        ctx2[27]
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
    ctx[27].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*$query*/
      512 && t_value !== (t_value = /*item*/
      ctx2[27].description + ""))
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
    ctx[27]
  ) + "";
  let t1;
  let a_href_value;
  let t2;
  let t3;
  let if_block0 = (
    /*item*/
    ctx[27].image && create_if_block_14(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[27].description && create_if_block_13(ctx)
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
        ctx[27]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-g0arss");
      attr(h3, "class", "svelte-g0arss");
      attr(article, "class", "card svelte-g0arss");
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
        ctx2[27].image
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
      if (dirty[0] & /*$query*/
      512 && t1_value !== (t1_value = getTitle(
        /*item*/
        ctx2[27]
      ) + ""))
        set_data(t1, t1_value);
      if (dirty[0] & /*$query*/
      512 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[27]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[27].description
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
function create_if_block_11(ctx) {
  let p;
  let t_value = (
    /*item*/
    ctx[27].description + ""
  );
  let t;
  return {
    c() {
      p = element("p");
      t = text(t_value);
      attr(p, "class", "description svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*$query*/
      512 && t_value !== (t_value = /*item*/
      ctx2[27].description + ""))
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
    ctx[27].date
  ) + "";
  let t;
  return {
    c() {
      time = element("time");
      t = text(t_value);
      attr(time, "class", "date svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, time, anchor);
      append(time, t);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*$query*/
      512 && t_value !== (t_value = formatDate(
        /*item*/
        ctx2[27].date
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
    ctx[27].octothorpes
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
      attr(div, "class", "tags svelte-g0arss");
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
      if (dirty[0] & /*$query*/
      512) {
        each_value_1 = ensure_array_like(
          /*item*/
          ctx2[27].octothorpes
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
    ctx[30] + ""
  );
  let t1;
  return {
    c() {
      span = element("span");
      t0 = text("#");
      t1 = text(t1_value);
      attr(span, "class", "tag svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t0);
      append(span, t1);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*$query*/
      512 && t1_value !== (t1_value = /*thorpe*/
      ctx2[30] + ""))
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
  ctx[30] === "string" && create_if_block_9(ctx);
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
      ctx2[30] === "string") {
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
    ctx[27]
  ) + "";
  let t0;
  let a_href_value;
  let t1;
  let t2;
  let t3;
  let t4;
  let if_block0 = (
    /*item*/
    ctx[27].description && create_if_block_11(ctx)
  );
  let if_block1 = (
    /*item*/
    ctx[27].date && create_if_block_10(ctx)
  );
  let if_block2 = (
    /*item*/
    ctx[27].octothorpes && /*item*/
    ctx[27].octothorpes.length > 0 && create_if_block_8(ctx)
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
        ctx[27]
      ));
      attr(a, "target", "_blank");
      attr(a, "rel", "noopener noreferrer");
      attr(a, "class", "svelte-g0arss");
      attr(li, "class", "svelte-g0arss");
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
      if (dirty[0] & /*$query*/
      512 && t0_value !== (t0_value = getTitle(
        /*item*/
        ctx2[27]
      ) + ""))
        set_data(t0, t0_value);
      if (dirty[0] & /*$query*/
      512 && a_href_value !== (a_href_value = getUrl(
        /*item*/
        ctx2[27]
      ))) {
        attr(a, "href", a_href_value);
      }
      if (
        /*item*/
        ctx2[27].description
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
        ctx2[27].date
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
        ctx2[27].octothorpes && /*item*/
        ctx2[27].octothorpes.length > 0
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
function create_if_block_4(ctx) {
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
        ctx[11]
      );
      attr(p, "class", "svelte-g0arss");
      attr(div, "class", "upload-error svelte-g0arss");
    },
    m(target, anchor) {
      insert(target, div, anchor);
      append(div, p);
      append(p, strong);
      append(p, t1);
      append(p, t2);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*error*/
      2048)
        set_data(
          t2,
          /*error*/
          ctx2[11]
        );
    },
    d(detaching) {
      if (detaching) {
        detach(div);
      }
    }
  };
}
function create_else_block(ctx) {
  let div1;
  return {
    c() {
      div1 = element("div");
      div1.innerHTML = `<div class="spinner svelte-g0arss"></div> <p class="svelte-g0arss">Loading GIF...</p>`;
      attr(div1, "class", "loading svelte-g0arss");
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
function create_if_block_2(ctx) {
  let button;
  let img;
  let img_src_value;
  let mounted;
  let dispose;
  return {
    c() {
      button = element("button");
      img = element("img");
      if (!src_url_equal(img.src, img_src_value = /*gifPreview*/
      ctx[6]))
        attr(img, "src", img_src_value);
      attr(img, "alt", "MultiPass GIF");
      attr(img, "class", "gif-clickable svelte-g0arss");
      attr(button, "class", "gif-button svelte-g0arss");
      attr(button, "type", "button");
      attr(button, "aria-label", "Click to load MultiPass results");
    },
    m(target, anchor) {
      insert(target, button, anchor);
      append(button, img);
      if (!mounted) {
        dispose = listen(
          button,
          "click",
          /*handleGifClick*/
          ctx[17]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*gifPreview*/
      64 && !src_url_equal(img.src, img_src_value = /*gifPreview*/
      ctx2[6])) {
        attr(img, "src", img_src_value);
      }
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
function create_if_block_1(ctx) {
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
        ctx[11]
      );
      t3 = space();
      button = element("button");
      button.textContent = "Retry";
      attr(p, "class", "svelte-g0arss");
      attr(button, "class", "retry-button svelte-g0arss");
      attr(div, "class", "upload-error svelte-g0arss");
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
          /*handleGifClick*/
          ctx[17]
        );
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*error*/
      2048)
        set_data(
          t2,
          /*error*/
          ctx2[11]
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
function create_fragment(ctx) {
  let if_block_anchor;
  function select_block_type(ctx2, dirty) {
    if (
      /*isGifMode*/
      ctx2[7] && !/*gifLoaded*/
      ctx2[8]
    )
      return create_if_block;
    if (!/*parsedMultiPass*/
    ctx2[4])
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
    p(ctx2, dirty) {
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
  let $query, $$unsubscribe_query = noop, $$subscribe_query = () => ($$unsubscribe_query(), $$unsubscribe_query = subscribe(query, ($$value) => $$invalidate(9, $query = $$value)), query);
  $$self.$$.on_destroy.push(() => $$unsubscribe_query());
  let { render = "list" } = $$props;
  let { placeholder = "Drop MultiPass JSON or GIF here" } = $$props;
  let { gif = "" } = $$props;
  let { target = "" } = $$props;
  let parsedMultiPass = null;
  let queryParams = null;
  let what = "pages";
  let by = "thorped";
  let query = null;
  $$subscribe_query();
  let isDragging = false;
  let error = null;
  let gifPreview = null;
  let isGifMode = false;
  let gifLoaded = false;
  let bypassGifProp = false;
  onMount(() => {
    if (gif && gif.trim() !== "") {
      $$invalidate(7, isGifMode = true);
      loadGifFromUrl(gif);
    }
  });
  async function load() {
    if (!query || !queryParams)
      return;
    await query.fetch(queryParams);
  }
  function renderToTarget(targetEl, results, loading, error2) {
    if (loading) {
      targetEl.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading results...</p></div>';
      return;
    }
    if (error2) {
      targetEl.innerHTML = `<div class="error"><p><strong>Error:</strong> ${error2}</p></div>`;
      return;
    }
    if (!results || results.length === 0) {
      targetEl.innerHTML = "";
      return;
    }
    let html = "";
    if (render === "list") {
      html = '<ul class="octo-list">';
      for (const item of results) {
        html += "<li>";
        html += `<a href="${getUrl(item)}" target="_blank" rel="noopener noreferrer">${getTitle(item)}</a>`;
        if (item.description) {
          html += `<p class="description">${item.description}</p>`;
        }
        if (item.date) {
          html += `<time class="date">${formatDate(item.date)}</time>`;
        }
        if (item.octothorpes && item.octothorpes.length > 0) {
          html += '<div class="tags">';
          for (const thorpe of item.octothorpes) {
            if (typeof thorpe === "string") {
              html += `<span class="tag">#${thorpe}</span>`;
            }
          }
          html += "</div>";
        }
        html += "</li>";
      }
      html += "</ul>";
    } else if (render === "cards") {
      html = '<div class="octo-cards">';
      for (const item of results) {
        html += '<article class="card">';
        if (item.image) {
          html += `<img src="${item.image}" alt="${getTitle(item)}" loading="lazy" />`;
        }
        html += `<h3><a href="${getUrl(item)}" target="_blank" rel="noopener noreferrer">${getTitle(item)}</a></h3>`;
        if (item.description) {
          html += `<p class="description">${item.description}</p>`;
        }
        html += "</article>";
      }
      html += "</div>";
    } else if (render === "compact") {
      html = '<div class="octo-compact">';
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        html += `<a href="${getUrl(item)}" target="_blank" rel="noopener noreferrer">${getTitle(item)}</a>`;
        if (i < results.length - 1)
          html += ", ";
      }
      html += "</div>";
    }
    html += `<div class="octo-meta"><span class="result-count">${results.length} result${results.length === 1 ? "" : "s"}</span></div>`;
    targetEl.innerHTML = html;
  }
  function handleDragOver(e) {
    e.preventDefault();
    $$invalidate(10, isDragging = true);
  }
  function handleDragLeave(e) {
    e.preventDefault();
    $$invalidate(10, isDragging = false);
  }
  function handleDrop(e) {
    var _a, _b;
    e.preventDefault();
    $$invalidate(10, isDragging = false);
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
    $$invalidate(11, error = null);
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
        $$invalidate(4, parsedMultiPass = parseMultipass(multiPass));
        if (!parsedMultiPass) {
          throw new Error("Invalid MultiPass structure");
        }
      } catch (err) {
        $$invalidate(11, error = `Error reading file: ${err.message}`);
        $$invalidate(4, parsedMultiPass = null);
        $$invalidate(6, gifPreview = null);
      }
    };
    if (file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }
  async function loadGifFromUrl(url) {
    $$invalidate(11, error = null);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch GIF: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const multiPass = extractMultipassFromGif(arrayBuffer);
      $$invalidate(4, parsedMultiPass = parseMultipass(multiPass));
      if (!parsedMultiPass) {
        throw new Error("Invalid MultiPass structure");
      }
      $$invalidate(6, gifPreview = url);
    } catch (err) {
      $$invalidate(11, error = `Error loading GIF: ${err.message}`);
      $$invalidate(4, parsedMultiPass = null);
      $$invalidate(6, gifPreview = null);
      $$invalidate(8, gifLoaded = false);
    }
  }
  async function handleGifClick() {
    if (isGifMode && parsedMultiPass && !gifLoaded) {
      $$invalidate(8, gifLoaded = true);
    } else if (isGifMode && !parsedMultiPass) {
      await loadGifFromUrl(gif);
    }
  }
  function reset() {
    $$invalidate(4, parsedMultiPass = null);
    $$invalidate(20, queryParams = null);
    $$subscribe_query($$invalidate(5, query = null));
    $$invalidate(11, error = null);
    $$invalidate(8, gifLoaded = false);
    if (!gif || gif.trim() === "") {
      $$invalidate(7, isGifMode = false);
      if (gifPreview) {
        URL.revokeObjectURL(gifPreview);
        $$invalidate(6, gifPreview = null);
      }
    }
  }
  function loadDifferent() {
    $$invalidate(23, bypassGifProp = true);
    $$invalidate(4, parsedMultiPass = null);
    $$invalidate(20, queryParams = null);
    $$subscribe_query($$invalidate(5, query = null));
    $$invalidate(11, error = null);
    $$invalidate(8, gifLoaded = false);
    $$invalidate(7, isGifMode = false);
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
    if ("gif" in $$props2)
      $$invalidate(2, gif = $$props2.gif);
    if ("target" in $$props2)
      $$invalidate(3, target = $$props2.target);
  };
  $$self.$$.update = () => {
    if ($$self.$$.dirty[0] & /*gif, bypassGifProp, gifPreview*/
    8388676) {
      {
        if (gif && gif.trim() !== "" && !bypassGifProp) {
          $$invalidate(7, isGifMode = true);
          if (gifPreview !== gif) {
            loadGifFromUrl(gif);
          }
        }
      }
    }
    if ($$self.$$.dirty[0] & /*parsedMultiPass, what, by, query, queryParams, isGifMode, gifLoaded*/
    7340464) {
      {
        if (parsedMultiPass) {
          $$invalidate(21, { what, by } = extractWhatBy(parsedMultiPass), what, ($$invalidate(22, by), $$invalidate(4, parsedMultiPass), $$invalidate(21, what), $$invalidate(5, query), $$invalidate(20, queryParams), $$invalidate(7, isGifMode), $$invalidate(8, gifLoaded), $$invalidate(2, gif), $$invalidate(23, bypassGifProp), $$invalidate(6, gifPreview)));
          $$invalidate(20, queryParams = multipassToParams(parsedMultiPass));
          $$subscribe_query($$invalidate(5, query = createOctoQuery(what, by)));
          if (query && queryParams && !isGifMode) {
            setTimeout(() => load(), 50);
          } else if (query && queryParams && isGifMode && gifLoaded) {
            setTimeout(() => load(), 50);
          }
        }
      }
    }
    if ($$self.$$.dirty[0] & /*target, query, $query*/
    552) {
      {
        if (target && target.trim() !== "" && query && $query.results) {
          const targetEl = document.querySelector(target);
          if (targetEl) {
            renderToTarget(targetEl, $query.results, $query.loading, $query.error);
          }
        }
      }
    }
  };
  return [
    render,
    placeholder,
    gif,
    target,
    parsedMultiPass,
    query,
    gifPreview,
    isGifMode,
    gifLoaded,
    $query,
    isDragging,
    error,
    load,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInput,
    handleGifClick,
    reset,
    loadDifferent,
    queryParams,
    what,
    by,
    bypassGifProp
  ];
}
class OctoMultipassLoader extends SvelteComponent {
  constructor(options) {
    super();
    init(
      this,
      options,
      instance,
      create_fragment,
      safe_not_equal,
      {
        render: 0,
        placeholder: 1,
        gif: 2,
        target: 3
      },
      add_css,
      [-1, -1]
    );
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
  get gif() {
    return this.$$.ctx[2];
  }
  set gif(gif) {
    this.$$set({ gif });
    flush();
  }
  get target() {
    return this.$$.ctx[3];
  }
  set target(target) {
    this.$$set({ target });
    flush();
  }
}
customElements.define("octo-multipass-loader", create_custom_element(OctoMultipassLoader, { "render": {}, "placeholder": {}, "gif": {}, "target": {} }, [], [], true));
export {
  OctoMultipassLoader as default
};
//# sourceMappingURL=octo-multipass-loader.js.map
