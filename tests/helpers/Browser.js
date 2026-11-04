const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Minimal DOM for controller tests; no browser profile or application database is used.
function createBrowser() {
  const nodes = new Map();
  const timers = new Map();
  let timerId = 0;
  const document = { activeElement: null, hidden: false };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.dataset = {};
      this.listeners = new Map();
      this.value = '';
      this.className = '';
      this.style = {};
      this.hidden = false;
      this.open = false;
      this.disabled = false;
      this.files = [];
      this.classList = {
        contains: (name) => this.className.split(/\s+/).includes(name),
        add: (name) => this.classList.toggle(name, true),
        remove: (name) => this.classList.toggle(name, false),
        toggle: (name, force) => {
          const classes = new Set(this.className.split(/\s+/).filter(Boolean));
          const enabled = force ?? !classes.has(name);
          if (enabled) classes.add(name);
          else classes.delete(name);
          this.className = [...classes].join(' ');
          return enabled;
        }
      };
    }
    set id(value) {
      this._id = value;
      nodes.set(value, this);
    }
    get id() {
      return this._id || '';
    }
    get isConnected() {
      return this === document.body || Boolean(this.parentElement?.isConnected);
    }
    get childElementCount() {
      return this.children.length;
    }
    get lastElementChild() {
      return this.children.at(-1);
    }
    get options() {
      return this.children;
    }
    get elements() {
      const controls = ['input', 'select', 'textarea', 'button'].flatMap(
        (tag) => this.querySelectorAll(tag)
      );
      for (const control of [...controls]) {
        const name = control.name || control.getAttribute('name');
        if (name) controls[name] = control;
      }
      return controls;
    }
    get rows() {
      return this.children.filter((child) => child.tagName === 'TR');
    }
    set textContent(value) {
      this._text = value == null ? '' : String(value);
      this.children = [];
    }
    get textContent() {
      return (
        (this._text || '') +
        this.children.map((child) => child.textContent).join('')
      );
    }
    set innerHTML(value) {
      this.replaceChildren();
      parseHtml(String(value), this);
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') this.id = value;
      if (name === 'class') this.className = value;
      if (name.startsWith('data-'))
        this.dataset[
          name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        ] = String(value);
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    removeAttribute(name) {
      delete this.attributes[name];
    }
    append(...children) {
      children.forEach((child) => {
        if (typeof child === 'string') {
          const text = new Element('#text');
          text.textContent = child;
          child = text;
        }
        child.parentElement = this;
        this.children.push(child);
      });
    }
    appendChild(child) {
      this.append(child);
      return child;
    }
    insertBefore(child, reference) {
      const index = this.children.indexOf(reference);
      if (index < 0) this.appendChild(child);
      else {
        child.parentElement = this;
        this.children.splice(index, 0, child);
      }
      return child;
    }
    add(child) {
      this.append(child);
    }
    replaceChildren(...children) {
      this.children.forEach((child) => {
        child.parentElement = null;
      });
      this.children = [];
      this._text = '';
      this.append(...children);
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (child) => child !== this
        );
      this.parentElement = null;
    }
    contains(node) {
      return (
        this === node || this.children.some((child) => child.contains(node))
      );
    }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.'))
        return this.classList.contains(selector.slice(1));
      const attribute = /^\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]$/.exec(
        selector
      );
      if (attribute)
        return attribute[2] === undefined
          ? this.getAttribute(attribute[1]) !== null
          : this.getAttribute(attribute[1]) === attribute[2];
      return this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector)
      ]);
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    closest(selector) {
      return this.matches(selector)
        ? this
        : this.parentElement?.closest(selector);
    }
    addEventListener(type, listener) {
      const list = this.listeners.get(type) || [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    async trigger(type, properties = {}) {
      const event = {
        currentTarget: this,
        target: this,
        preventDefault() {},
        ...properties
      };
      for (const listener of this.listeners.get(type) || [])
        await listener(event);
      if (this['on' + type]) await this['on' + type](event);
    }
    focus() {
      document.activeElement = this;
    }
    click() {
      return this.trigger('click');
    }
    showModal() {
      if (this.open) throw new Error('Dialog already open');
      this.open = true;
    }
    close() {
      this.open = false;
    }
    scrollIntoView() {}
    reset() {}
    getBoundingClientRect() {
      return { width: 560, height: 112 };
    }
    getContext() {
      return new Proxy({}, { get: () => () => {} });
    }
  }
  function parseHtml(html, parent) {
    const stack = [parent];
    for (const [, closing, tag, attrs] of html.matchAll(
      /<(\/?)([a-z][\w-]*)([^>]*)>/gi
    )) {
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const element = new Element(tag);
      for (const [, name, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g))
        element.setAttribute(name, value);
      element.hidden = /\bhidden\b/.test(attrs);
      stack.at(-1).appendChild(element);
      if (
        !['input', 'img', 'br', 'hr', 'meta', 'link'].includes(
          tag.toLowerCase()
        )
      )
        stack.push(element);
    }
  }
  document.body = new Element('body');
  document.head = new Element('head');
  document.createElement = (tag) => new Element(tag);
  document.getElementById = (id) => nodes.get(id) || null;
  document.querySelectorAll = (selector) =>
    document.body.querySelectorAll(selector);
  document.querySelector = (selector) => document.body.querySelector(selector);
  document.addEventListener = () => {};
  const context = vm.createContext({
    document,
    console,
    URL,
    Blob,
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => 0,
    addEventListener: () => {},
    requestAnimationFrame: (callback) => callback(),
    fetch: async () => {
      throw new Error('Unexpected network request');
    },
    Option: function (text, value) {
      const option = new Element('option');
      option.textContent = text;
      option.value = value;
      return option;
    }
  });
  context.window = context;
  const root = path.resolve(__dirname, '../..');
  function load(file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {
      filename: file
    });
  }
  function loadDashboard() {
    parseHtml(
      fs.readFileSync(path.join(root, 'public/index.html'), 'utf8'),
      document.body
    );
    const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    for (const [, script] of index.matchAll(
      /<script\b[^>]*\bsrc="(js\/[^"?]+\.js)(?:\?[^\"]*)?"/g
    ))
      if (script !== 'js/ui-loader.js') load('public/' + script);
    const loader = fs.readFileSync(
      path.join(root, 'public/js/ui-loader.js'),
      'utf8'
    );
    for (const [, fragment] of loader.matchAll(
      /['"](views\/[^'"]+\.html)['"]/g
    ))
      parseHtml(
        fs.readFileSync(path.join(root, 'public', fragment), 'utf8'),
        document.body
      );
    for (const [, script] of loader.matchAll(
      /['"]((?:\.\.\/shared|js\/)[^'"]+\.js)['"]/g
    ))
      load(path.posix.normalize('public/' + script));
  }
  function runTimers() {
    const callbacks = [...timers.values()];
    timers.clear();
    return Promise.all(callbacks.map((callback) => callback()));
  }
  return {
    context,
    document,
    load,
    loadDashboard,
    runTimers,
    evaluate: (source) => vm.runInContext(source, context)
  };
}

module.exports = { createBrowser };
