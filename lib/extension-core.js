(function () {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) return;

  const bridge = window._ext_bridge;
  const isNative = typeof bridge !== 'undefined' && bridge !== null;

  const listeners = {};

  function onBridgeEvent(jsonStr) {
    try {
      const evt = JSON.parse(jsonStr);
      const type = evt.type;
      const list = listeners[type] || [];
      list.forEach(function (cb) { cb(evt); });
      const anyList = listeners['*'] || [];
      anyList.forEach(function (cb) { cb(evt); });
    } catch (e) {
      console.warn('[Extension] bridge event parse error', e);
    }
  }

  if (isNative) {
    window._ext_msg_listener = onBridgeEvent;
  }

  window.chrome = window.browser = {
    runtime: {
      id: 'goldfiredragon@browser',
      lastError: null,
      sendMessage: function (extensionId, message, cb) {
        if (isNative) {
          bridge.sendMessage(
            typeof extensionId === 'string' ? extensionId : 'container-proxy@weblibre.eu',
            JSON.stringify(typeof extensionId === 'string' ? message : extensionId)
          );
        }
        if (typeof cb === 'function') cb();
      },
      onMessage: {
        addListener: function (cb) {
          if (!listeners['message']) listeners['message'] = [];
          listeners['message'].push(cb);
        },
        removeListener: function (cb) {
          var arr = listeners['message'];
          if (arr) {
            var idx = arr.indexOf(cb);
            if (idx >= 0) arr.splice(idx, 1);
          }
        }
      },
      onConnect: {
        addListener: function () {},
        removeListener: function () {}
      }
    },
    storage: {
      local: {
        get: function (keys, cb) {
          var result = {};
          if (!isNative) {
            if (typeof cb === 'function') cb(result);
            return;
          }
          if (typeof keys === 'string') {
            var v = bridge.getStorage(keys);
            result[keys] = v ? JSON.parse(v) : null;
          } else if (Array.isArray(keys)) {
            keys.forEach(function (k) {
              var v = bridge.getStorage(k);
              result[k] = v ? JSON.parse(v) : null;
            });
          } else if (keys === null || typeof keys === 'undefined') {
            try {
              var allStr = bridge.getStorage('__all_keys__');
              var allKeys = allStr ? JSON.parse(allStr) : [];
              allKeys.forEach(function (k) {
                var v = bridge.getStorage(k);
                result[k] = v ? JSON.parse(v) : null;
              });
            } catch (e) {}
          } else if (typeof keys === 'object') {
            Object.keys(keys).forEach(function (k) {
              var v = bridge.getStorage(k);
              result[k] = v ? JSON.parse(v) : keys[k];
            });
          }
          if (typeof cb === 'function') cb(result);
        },
        set: function (obj, cb) {
          if (isNative) {
            Object.keys(obj).forEach(function (k) {
              bridge.setStorage(k, JSON.stringify(obj[k]));
            });
            try {
              var allStr = bridge.getStorage('__all_keys__');
              var allKeys = allStr ? JSON.parse(allStr) : [];
              Object.keys(obj).forEach(function (k) {
                if (allKeys.indexOf(k) < 0) allKeys.push(k);
              });
              bridge.setStorage('__all_keys__', JSON.stringify(allKeys));
            } catch (e) {}
          }
          if (typeof cb === 'function') cb();
        },
        remove: function (keys, cb) {
          if (isNative) {
            var list = Array.isArray(keys) ? keys : [keys];
            list.forEach(function (k) { bridge.setStorage(k, ''); });
          }
          if (typeof cb === 'function') cb();
        },
        clear: function (cb) {
          if (isNative) {
            try {
              var allStr = bridge.getStorage('__all_keys__');
              var allKeys = allStr ? JSON.parse(allStr) : [];
              allKeys.forEach(function (k) { bridge.setStorage(k, ''); });
              bridge.setStorage('__all_keys__', JSON.stringify([]));
            } catch (e) {}
          }
          if (typeof cb === 'function') cb();
        }
      },
      sync: {
        get: function (keys, cb) {
          window.chrome.storage.local.get(keys, cb);
        },
        set: function (obj, cb) {
          window.chrome.storage.local.set(obj, cb);
        },
        remove: function (keys, cb) {
          window.chrome.storage.local.remove(keys, cb);
        },
        clear: function (cb) {
          window.chrome.storage.local.clear(cb);
        }
      },
      managed: {
        get: function (keys, cb) {
          if (typeof cb === 'function') cb({});
        }
      },
      onChanged: {
        addListener: function () {},
        removeListener: function () {}
      }
    },
    tabs: {
      create: function (obj, cb) {
        var url = (obj && obj.url) ? obj.url : 'about:blank';
        if (isNative) bridge.openNewTab(url);
        if (typeof cb === 'function') cb({ id: -1, url: url });
      },
      query: function (queryInfo, cb) {
        if (typeof cb === 'function') cb([]);
      },
      update: function (tabId, updateInfo, cb) {
        if (updateInfo && updateInfo.url && isNative) {
          bridge.openNewTab(updateInfo.url);
        }
        if (typeof cb === 'function') cb();
      },
      getCurrent: function (cb) {
        if (typeof cb === 'function') cb({ id: -1, url: window.location.href });
      },
      remove: function () {}
    },
    notifications: {
      create: function (id, obj, cb) {
        if (isNative) {
          bridge.createNotification(
            (obj && obj.title) || 'Extension',
            (obj && obj.message) || ''
          );
        }
        if (typeof cb === 'function') cb();
      },
      clear: function () {},
      onClicked: { addListener: function () {}, removeListener: function () {} }
    },
    browserAction: {
      onClicked: { addListener: function () {}, removeListener: function () {} },
      setBadgeText: function () {},
      setTitle: function () {},
      setIcon: function () {},
      setPopup: function () {}
    },
    pageAction: {
      onClicked: { addListener: function () {}, removeListener: function () {} },
      setTitle: function () {},
      setIcon: function () {},
      setPopup: function () {},
      show: function () {},
      hide: function () {}
    },
    contextMenus: {
      create: function () {},
      removeAll: function () {},
      onClicked: { addListener: function () {}, removeListener: function () {} }
    },
    webRequest: {
      onBeforeRequest: { addListener: function () {}, removeListener: function () {} },
      onCompleted: { addListener: function () {}, removeListener: function () {} },
      onErrorOccurred: { addListener: function () {}, removeListener: function () {} },
      handlerBehaviorChanged: function () {}
    },
    i18n: {
      getMessage: function (key) { return key; },
      getUILanguage: function () { return navigator.language || 'en'; }
    },
    extension: {
      getURL: function (path) { return chrome.runtime.id + '/' + path; },
      inIncognitoContext: false
    }
  };

  window.ExtensionManager = {
    extensions: [],
    actionListeners: [],

    onAction: {
      addListener: function (cb) {
        if (!listeners['action']) listeners['action'] = [];
        listeners['action'].push(cb);
      },
      removeListener: function (cb) {
        var arr = listeners['action'];
        if (arr) {
          var idx = arr.indexOf(cb);
          if (idx >= 0) arr.splice(idx, 1);
        }
      }
    },

    onActionUpdate: {
      addListener: function () {},
      removeListener: function () {}
    },

    list: function () {
      if (isNative) {
        try {
          return JSON.parse(bridge.getExtensions());
        } catch (e) {
          return [];
        }
      }
      return this.extensions;
    },

    install: function (url) {
      if (isNative) {
        bridge.installExtension(url);
        return Promise.resolve({ id: url, name: url });
      }
      var self = this;
      return fetch(url + '/manifest.json')
        .then(function (r) { return r.json(); })
        .then(function (m) {
          m.baseUrl = url;
          self.extensions.push(m);
          if (m.background) self.runBackground(m);
          return m;
        })
        .catch(function (e) { console.error('[Extension] install failed', e); });
    },

    installBuiltIn: function (name) {
      if (isNative) {
        bridge.installBuiltInExtension(name);
        return Promise.resolve({ id: name, name: name });
      }
      return this.install('resource://android/assets/extensions/' + name + '/');
    },

    uninstall: function (id) {
      if (isNative) {
        bridge.uninstallExtension(id);
      } else {
        this.extensions = this.extensions.filter(function (e) { return e.id !== id; });
      }
    },

    enable: function (id) {
      if (isNative) bridge.enableExtension(id);
    },

    disable: function (id) {
      if (isNative) bridge.disableExtension(id);
    },

    sendMessage: function (id, msg) {
      if (isNative) bridge.sendMessage(id, JSON.stringify(msg || {}));
    },

    runBackground: function (m) {
      if (!m.background || !m.background.scripts) return;
      var self = this;
      m.background.scripts.forEach(function (s) {
        var el = document.createElement('script');
        el.src = m.baseUrl + '/' + s;
        el.onload = function () { console.log('[Extension] background loaded:', s); };
        el.onerror = function () { console.error('[Extension] background failed:', s); };
        document.head.appendChild(el);
      });
    },

    loadAll: function () {
      if (!isNative) return;
      try {
        var list = JSON.parse(bridge.getExtensions());
        this.extensions = list;
      } catch (e) {
        this.extensions = [];
      }
    }
  };

  if (isNative) {
    window.ExtensionManager.loadAll();
  }

  console.log('[Extension] API ready (native=' + isNative + ')');
})();
