// A09 e2e only — a local stand-in for https://apis.google.com/js/api.js (Google's gapi loader with the
// `gapi.iframes` messaging library). Firebase Auth's popup sign-in loads that script on the app page and
// on the Auth emulator's helper iframe, even against the emulator; this machine cannot reach
// apis.google.com (the egress proxy refuses it) and the tests must not depend on outside hosts, so the
// browser is given this file instead (support/app.ts keepLocal). It implements only what the SDK and
// the emulator iframe use: load('gapi.iframes'), getContext().open / getParentIframe, and on an iframe
// restyle / ping / register / send, over window.postMessage. The app itself is unchanged and uses the
// real script wherever Google is reachable.
(function () {
  'use strict';
  var TAG = '__gm_gapi_shim__';
  var FILTER = function () {
    return true;
  };
  var sequence = 0;

  /** One side of a channel: handlers by name, pending replies by id, the window on the other side. */
  function Channel(getPeer, onReady) {
    this.getPeer = getPeer;
    this.handlers = {};
    this.pending = {};
    this.ready = false;
    this.waiting = [];
    this.onReady = onReady;
  }
  Channel.prototype.post = function (message) {
    var peer = this.getPeer();
    if (peer) peer.postMessage(Object.assign({ tag: TAG }, message), '*');
  };
  Channel.prototype.markReady = function () {
    if (this.ready) return;
    this.ready = true;
    var waiting = this.waiting;
    this.waiting = [];
    waiting.forEach(function (resolve) {
      resolve();
    });
    if (this.onReady) this.onReady();
  };
  Channel.prototype.whenReady = function () {
    var self = this;
    return new Promise(function (resolve) {
      if (self.ready) resolve();
      else self.waiting.push(resolve);
    });
  };
  Channel.prototype.receive = function (message) {
    var self = this;
    if (message.kind === 'ready') {
      this.markReady();
      if (message.ask) this.post({ kind: 'ready' });
      return;
    }
    if (message.kind === 'call') {
      var handler = this.handlers[message.name];
      var answer;
      try {
        answer = handler ? handler(message.data) : undefined;
      } catch (error) {
        answer = undefined;
      }
      Promise.resolve(answer).then(function (value) {
        self.post({ kind: 'reply', id: message.id, responses: value === undefined ? [] : [value] });
      });
      return;
    }
    if (message.kind === 'reply') {
      var callback = this.pending[message.id];
      delete this.pending[message.id];
      if (callback) {
        try {
          callback(message.responses);
        } catch (error) {
          // gapi swallows errors thrown by callbacks; so does the stand-in.
        }
      }
    }
  };
  Channel.prototype.register = function (name, handler) {
    this.handlers[name] = handler;
  };
  Channel.prototype.send = function (name, data, callback) {
    var self = this;
    this.whenReady().then(function () {
      sequence += 1;
      var id = TAG + ':' + Date.now() + ':' + sequence;
      if (callback) self.pending[id] = callback;
      self.post({ kind: 'call', id: id, name: name, data: data });
    });
  };

  var channels = [];
  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || message.tag !== TAG) return;
    channels.forEach(function (channel) {
      if (channel.getPeer() === event.source) channel.receive(message);
    });
  });

  /** The iframe object the SDK gets from context.open (parent side). */
  function ParentSideIframe(element) {
    var channel = new Channel(function () {
      return element.contentWindow;
    });
    channels.push(channel);
    // Ask the child until it answers (it may load after us).
    var asking = setInterval(function () {
      if (channel.ready) clearInterval(asking);
      else channel.post({ kind: 'ready', ask: true });
    }, 50);
    this.restyle = function () {
      return Promise.resolve();
    };
    this.ping = function (callback) {
      return channel.whenReady().then(function () {
        if (callback) callback();
      });
    };
    this.register = function (name, handler) {
      channel.register(name, handler);
    };
    this.send = function (name, data, callback) {
      channel.send(name, data, callback);
    };
    this.getIframeEl = function () {
      return element;
    };
  }

  /** What the emulator's helper iframe gets from getParentIframe (child side). */
  function ChildSideParent() {
    var channel = new Channel(function () {
      return window.parent;
    });
    channels.push(channel);
    channel.post({ kind: 'ready', ask: true });
    this.register = function (name, handler) {
      channel.register(name, handler);
    };
    this.send = function (name, data, callback) {
      channel.send(name, data, callback);
    };
  }

  var parentSide;
  var context = {
    open: function (options, onOpened) {
      var element = document.createElement('iframe');
      var attributes = (options && options.attributes) || {};
      Object.keys(attributes).forEach(function (name) {
        if (name === 'style') Object.assign(element.style, attributes.style);
        else element.setAttribute(name, attributes[name]);
      });
      element.src = options.url;
      ((options && options.where) || document.body).appendChild(element);
      var iframe = new ParentSideIframe(element);
      var opened = onOpened ? onOpened(iframe) : iframe;
      return Promise.resolve(opened);
    },
    getParentIframe: function () {
      parentSide = parentSide || new ChildSideParent();
      return parentSide;
    },
  };

  var gapi = (window.gapi = window.gapi || {});
  gapi.iframes = { CROSS_ORIGIN_IFRAMES_FILTER: FILTER, Iframe: ParentSideIframe, getContext: function () { return context; } };
  gapi.load = function (_name, options) {
    var callback = typeof options === 'function' ? options : options && options.callback;
    setTimeout(function () {
      if (callback) callback();
    }, 0);
  };

  // The SDK loads `api.js?onload=<callback>`; the emulator iframe defines window.gapi_onload.
  var source = (document.currentScript && document.currentScript.src) || '';
  var onload = new URL(source, location.href).searchParams.get('onload');
  setTimeout(function () {
    if (onload && typeof window[onload] === 'function') window[onload]();
    if (typeof window.gapi_onload === 'function') window.gapi_onload();
  }, 0);
})();
