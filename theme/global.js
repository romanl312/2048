/* nich.gift — інтерактив теми (без залежностей) */
(() => {
  'use strict';

  const theme = window.theme || { routes: {}, strings: {} };
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Тост ---------- */
  let toastTimer;
  function toast(message) {
    const el = qs('#Toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  /* ---------- Фокус-пастка для шухляд ---------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  function trapFocus(container, event) {
    const items = qsa(FOCUSABLE, container).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  /* ---------- Базова шухляда ---------- */
  class DrawerBase extends HTMLElement {
    connectedCallback() {
      this.panel = qs('.drawer__panel', this);
      this.addEventListener('click', (e) => { if (e.target.closest('[data-drawer-close]')) this.close(); });
      this.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
        if (e.key === 'Tab') trapFocus(this.panel, e);
      });
    }
    open(opener) {
      this.opener = opener || document.activeElement;
      this.classList.add('is-open');
      this.setAttribute('aria-hidden', 'false');
      document.body.classList.add('has-drawer');
      qsa(`[aria-controls="${this.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
      requestAnimationFrame(() => this.panel && this.panel.focus());
    }
    close() {
      this.classList.remove('is-open');
      this.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('has-drawer');
      qsa(`[aria-controls="${this.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
      if (this.opener && this.opener.focus) this.opener.focus();
    }
  }
  customElements.define('menu-drawer', class extends DrawerBase {});
  customElements.define('facets-drawer', class extends DrawerBase {});

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-drawer-open]');
    if (!opener) return;
    const drawer = document.getElementById(opener.dataset.drawerOpen);
    if (drawer && typeof drawer.open === 'function') {
      e.preventDefault();
      drawer.open(opener);
    }
  });

  /* ---------- Кошик ---------- */
  class CartDrawer extends DrawerBase {
    connectedCallback() {
      super.connectedCallback();
      this.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cart-qty]');
        if (!btn) return;
        const line = btn.closest('[data-line]');
        this.change(line.dataset.key, parseInt(btn.dataset.cartQty, 10));
      });
      this.addEventListener('change', (e) => {
        const input = e.target.closest('[data-cart-qty-input]');
        if (!input) return;
        const line = input.closest('[data-line]');
        this.change(line.dataset.key, Math.max(0, parseInt(input.value, 10) || 0));
      });
    }
    get inner() { return qs('#CartDrawerInner', this); }
    render(sections) {
      if (!sections || !sections['cart-drawer']) return;
      const doc = new DOMParser().parseFromString(sections['cart-drawer'], 'text/html');
      const fresh = qs('#CartDrawerInner', doc);
      if (fresh && this.inner) this.inner.innerHTML = fresh.innerHTML;
      const countEl = qs('[data-cart-count-value]', this);
      updateCartCount(countEl ? parseInt(countEl.dataset.cartCountValue, 10) : null);
    }
    async change(key, quantity) {
      this.inner && this.inner.classList.add('is-busy');
      try {
        const res = await fetch(`${theme.routes.cartChange}.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ id: key, quantity, sections: ['cart-drawer'], sections_url: window.location.pathname })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.description || data.message);
        this.render(data.sections);
      } catch (err) {
        toast(err.message || theme.strings.error);
      } finally {
        this.inner && this.inner.classList.remove('is-busy');
      }
    }
  }
  customElements.define('cart-drawer', CartDrawer);

  function updateCartCount(count) {
    if (count === null || Number.isNaN(count)) return;
    qsa('[data-cart-count]').forEach((bubble) => {
      bubble.hidden = count === 0;
      const visible = bubble.querySelector('[aria-hidden]');
      if (visible) visible.textContent = count;
    });
  }

  /* ---------- Додавання в кошик (картки й сторінка товару) ---------- */
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-product-form]');
    if (!form) return;
    const drawer = document.getElementById('CartDrawer');
    if (theme.cartType !== 'drawer' || !drawer) return; // звичайна відправка → сторінка кошика
    e.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button) { button.classList.add('is-loading'); button.setAttribute('aria-disabled', 'true'); }
    const errorBox = form.querySelector('[data-form-error]');
    if (errorBox) errorBox.hidden = true;
    try {
      const body = new FormData(form);
      body.append('sections', 'cart-drawer');
      body.append('sections_url', window.location.pathname);
      const res = await fetch(`${theme.routes.cartAdd}.js`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body
      });
      const data = await res.json();
      if (!res.ok || data.status) throw new Error(data.description || data.message || theme.strings.error);
      drawer.render(data.sections);
      drawer.open(button);
    } catch (err) {
      if (errorBox) { errorBox.textContent = err.message; errorBox.hidden = false; }
      else toast(err.message);
    } finally {
      if (button) { button.classList.remove('is-loading'); button.removeAttribute('aria-disabled'); }
    }
  });

  /* ---------- Мега-меню (desktop) ---------- */
  class HeaderMenu extends HTMLElement {
    connectedCallback() {
      this.details = qsa('details', this);
      const canHover = window.matchMedia('(hover: hover)').matches;
      this.details.forEach((d) => {
        d.addEventListener('toggle', () => {
          if (d.open) this.details.forEach((o) => { if (o !== d) o.open = false; });
        });
        if (canHover) {
          let timer;
          let hoverOpened = false;
          d.addEventListener('mouseenter', () => { clearTimeout(timer); if (!d.open) hoverOpened = true; d.open = true; });
          d.addEventListener('mouseleave', () => { timer = setTimeout(() => { d.open = false; hoverOpened = false; }, 120); });
          // Клік одразу після наведення не має закривати меню, яке щойно відкрилось
          qs('summary', d).addEventListener('click', (e) => {
            if (hoverOpened && d.open) { e.preventDefault(); hoverOpened = false; }
          });
        }
      });
      document.addEventListener('click', (e) => { if (!this.contains(e.target)) this.closeAll(); });
      this.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const open = this.details.find((d) => d.open);
        if (open) { open.open = false; qs('summary', open).focus(); }
      });
    }
    closeAll() { this.details.forEach((d) => { d.open = false; }); }
  }
  customElements.define('header-menu', HeaderMenu);

  /* Липкий хедер + мобільний пошук */
  const header = qs('.header');
  if (header) {
    if (header.dataset.sticky === 'true') {
      const wrap = header.closest('.shopify-section');
      if (wrap) wrap.classList.add('is-sticky');
    }
    const toggle = qs('[data-search-toggle]', header);
    if (toggle) {
      toggle.addEventListener('click', () => {
        header.classList.toggle('search-open');
        const input = qs('.search-form__input', header);
        if (header.classList.contains('search-open') && input) input.focus();
      });
    }
  }

  /* ---------- Прогортання анонсів (мобільний) ---------- */
  customElements.define('announcement-rotator', class extends HTMLElement {
    connectedCallback() {
      this.items = qsa('.announcement__item', this);
      if (this.items.length < 2) return;
      this.i = 0;
      this.timer = setInterval(() => {
        this.items[this.i].classList.remove('is-active');
        this.i = (this.i + 1) % this.items.length;
        this.items[this.i].classList.add('is-active');
      }, 4000);
    }
    disconnectedCallback() { clearInterval(this.timer); }
  });

  /* ---------- Швидкий пошук ---------- */
  customElements.define('predictive-search', class extends HTMLElement {
    connectedCallback() {
      this.input = qs('input[type="search"]', this);
      this.results = qs('[data-results]', this);
      if (!this.input || !this.results) return;
      let t;
      this.input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => this.search(this.input.value.trim()), 220);
      });
      this.input.addEventListener('focus', () => { if (this.results.innerHTML.trim()) this.show(true); });
      document.addEventListener('click', (e) => { if (!this.contains(e.target)) this.show(false); });
      this.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.show(false); this.input.focus(); } });
    }
    show(state) {
      this.results.hidden = !state;
      this.input.setAttribute('aria-expanded', String(state));
    }
    async search(q) {
      if (q.length < 2) { this.show(false); return; }
      if (this.controller) this.controller.abort();
      this.controller = new AbortController();
      try {
        const url = `${theme.routes.search}/suggest?q=${encodeURIComponent(q)}&section_id=predictive-search&resources[type]=product,collection&resources[limit]=6&resources[options][prefix]=last`;
        const res = await fetch(url, { signal: this.controller.signal });
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const body = qs('.ps', doc);
        this.results.innerHTML = body ? body.outerHTML : '';
        this.show(Boolean(body));
      } catch (err) {
        if (err.name !== 'AbortError') this.show(false);
      }
    }
  });

  /* ---------- Кнопки слайдерів ---------- */
  qsa('[data-slider-nav]').forEach((nav) => {
    const track = document.getElementById(nav.dataset.sliderNav);
    if (!track) return;
    const [prev, next] = qsa('button', nav);
    const update = () => {
      prev.disabled = track.scrollLeft <= 4;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      track.scrollBy({ left: track.clientWidth * 0.9 * parseInt(b.dataset.dir, 10), behavior: 'smooth' });
    });
    track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    update();
  });

  /* ---------- Поле кількості ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qty-step]');
    if (!b) return;
    const input = b.closest('.quantity').querySelector('input');
    const min = parseInt(input.min || '1', 10);
    const max = input.max ? parseInt(input.max, 10) : Infinity;
    const v = Math.min(max, Math.max(min, (parseInt(input.value, 10) || min) + parseInt(b.dataset.qtyStep, 10)));
    input.value = v;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ---------- Сторінка товару: галерея ---------- */
  customElements.define('product-gallery', class extends HTMLElement {
    connectedCallback() {
      this.track = qs('[data-gallery-track]', this);
      this.thumbs = qsa('[data-thumb]', this);
      this.thumbs.forEach((t) => t.addEventListener('click', () => this.go(parseInt(t.dataset.thumb, 10))));
      if (this.track) {
        this.track.addEventListener('scroll', () => {
          const i = Math.round(this.track.scrollLeft / this.track.clientWidth);
          this.mark(i);
        }, { passive: true });
      }
    }
    go(i) {
      const slide = this.track && this.track.children[i];
      if (slide) this.track.scrollTo({ left: slide.offsetLeft - this.track.offsetLeft, behavior: 'smooth' });
      this.mark(i);
    }
    goToMedia(mediaId) {
      const slide = this.track && qs(`[data-media-id="${mediaId}"]`, this.track);
      if (slide) this.go(Array.from(this.track.children).indexOf(slide));
    }
    mark(i) {
      this.thumbs.forEach((t, n) => t.setAttribute('aria-current', n === i ? 'true' : 'false'));
    }
  });

  /* ---------- Сторінка товару: варіанти ---------- */
  customElements.define('variant-picker', class extends HTMLElement {
    connectedCallback() {
      const json = qs('script[type="application/json"]', this);
      this.variants = json ? JSON.parse(json.textContent) : [];
      this.addEventListener('change', () => this.update());
    }
    update() {
      const options = qsa('fieldset', this).map((fs) => {
        const checked = qs('input:checked', fs);
        return checked ? checked.value : null;
      });
      const variant = this.variants.find((v) => v.options.every((o, i) => o === options[i]));
      const section = this.closest('[data-product-section]');
      if (!section) return;
      const idInput = qs('form[data-product-form] input[name="id"]', section);
      const btn = qs('[data-add-button]', section);
      const btnLabel = btn && qs('span', btn);
      if (!variant) {
        if (btn) { btn.disabled = true; if (btnLabel) btnLabel.textContent = theme.strings.unavailable || '—'; }
        return;
      }
      if (idInput) idInput.value = variant.id;
      if (btn) {
        btn.disabled = !variant.available;
        if (btnLabel) btnLabel.textContent = variant.available ? btn.dataset.addLabel : theme.strings.soldOut;
      }
      const url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url.toString());
      // оновити ціну через Section Rendering API
      fetch(`${url.pathname}?variant=${variant.id}&section_id=${section.dataset.sectionId}`)
        .then((r) => r.text())
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const fresh = qs('[data-price]', doc);
          const current = qs('[data-price]', section);
          if (fresh && current) current.replaceWith(fresh);
        })
        .catch(() => {});
      if (variant.featured_media) {
        const gallery = qs('product-gallery', section);
        if (gallery && gallery.goToMedia) gallery.goToMedia(variant.featured_media.id);
      }
    }
  });

  /* ---------- Фільтри колекції ---------- */
  customElements.define('facets-form', class extends HTMLElement {
    connectedCallback() {
      this.form = qs('form', this);
      if (!this.form) return;
      let t;
      this.form.addEventListener('input', (e) => {
        clearTimeout(t);
        const delay = e.target.type === 'number' ? 600 : 0;
        t = setTimeout(() => this.submit(), delay);
      });
      this.form.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    }
    submit() {
      const params = new URLSearchParams(new FormData(this.form));
      for (const [k, v] of Array.from(params.entries())) { if (v === '') params.delete(k); }
      const url = `${window.location.pathname}?${params.toString()}`;
      window.location.assign(url);
    }
  });
})();
