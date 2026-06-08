/*! BillTube Framework — v3.4g */
(function(){
  var scripts=document.getElementsByTagName('script');
  var BASE=(document.currentScript&&document.currentScript.src)||scripts[scripts.length-1].src; BASE=BASE.replace(/\/[^\/]*$/, "");

  var Registry=Object.create(null);
  function define(name,deps,factory){ Registry[name]={deps:deps||[],factory:factory,instance:null,promise:null}; }
  function init(name){
    var m=Registry[name]; if(!m) return Promise.reject(new Error("Module not found: "+name));
    // Memoize the PROMISE, not just the resolved instance. The factory is async,
    // so m.instance stays null until it resolves; two concurrent init() calls for
    // the same module would both pass an instance-only guard and run the factory
    // twice (two separate instances). Guarding on the promise makes init run the
    // factory exactly once even under concurrent callers.
    if(m.promise) return m.promise;
    m.promise = (async function(){
      for(var i=0;i<m.deps.length;i++){ await init(m.deps[i]); }
      m.instance = await m.factory({define, init, BASE});
      return m.instance;
    })();
    return m.promise;
  }
  window.BTFW = { define, init, BASE };

  // Public handshake for third-party theme modules (e.g. donate_module.js) that
  // probe `window.ThemeToolkit` before falling back to standalone init.
  if (!window.ThemeToolkit) {
    var __btfwToolkitModules = [];
    window.ThemeToolkit = {
      version: "BTFW",
      modules: __btfwToolkitModules,
      registerModule: function(mod){
        try {
          __btfwToolkitModules.push(mod);
          if (mod && typeof mod.init === "function") mod.init();
        } catch (err) {
          console.error("[BTFW] ThemeToolkit.registerModule failed", err);
        }
        return mod;
      }
    };
  }

  var BootOverlay=(function(){
    var overlay=null;
    var styleEl=null;
    var muteInterval=null;
    var suppressedVideos=new Map();

    function cleanupVideoRefs(){
      for (const [video] of suppressedVideos) {
        if (!(video instanceof HTMLVideoElement) || !video.isConnected) {
          suppressedVideos.delete(video);
        }
      }
    }

    function suppressVideoAudio(){
      cleanupVideoRefs();
      var videos=document.querySelectorAll('video');
      videos.forEach(function(video){
        if (!(video instanceof HTMLVideoElement)) return;
        if (!suppressedVideos.has(video)) {
          var state={
            muted: video.muted,
            volume: (typeof video.volume === 'number') ? video.volume : null
          };
          suppressedVideos.set(video, state);
        }
        try { video.muted = true; }
        catch(_){}
      });
    }

    function startAudioSuppression(){
      suppressVideoAudio();
      if (muteInterval) return;
      muteInterval = setInterval(suppressVideoAudio, 250);
      document.documentElement && document.documentElement.classList.add('btfw-loading-muted');
    }

    function stopAudioSuppression(){
      if (muteInterval) {
        clearInterval(muteInterval);
        muteInterval = null;
      }
      for (const [video, state] of suppressedVideos.entries()) {
        if (!(video instanceof HTMLVideoElement)) {
          suppressedVideos.delete(video);
          continue;
        }
        try {
          if (!state.muted) {
            video.muted = false;
            if (typeof state.volume === 'number') video.volume = state.volume;
          }
        } catch(_){}
        suppressedVideos.delete(video);
      }
      document.documentElement && document.documentElement.classList.remove('btfw-loading-muted');
    }

    function ensureStyles(){
      if (styleEl) return;
      styleEl=document.createElement('style');
      styleEl.id='btfw-boot-overlay-style';
      styleEl.textContent="\n        #btfw-boot-overlay{\n          position:fixed;\n          inset:0;\n          background:radial-gradient(circle at 20% 20%, rgba(41,52,89,0.28), rgba(5,6,13,0.92));\n          backdrop-filter:blur(6px);\n          display:flex;\n          align-items:center;\n          justify-content:center;\n          z-index:10000;\n          opacity:1;\n          transition:opacity 220ms ease, visibility 220ms ease;\n          visibility:visible;\n        }\n        #btfw-boot-overlay[data-state=hidden]{\n          opacity:0;\n          visibility:hidden;\n        }\n        .btfw-boot-overlay__card{\n          display:flex;\n          flex-direction:column;\n          align-items:center;\n          gap:1rem;\n          padding:2.5rem 3rem;\n          border-radius:18px;\n          background:rgba(9,12,23,0.82);\n          box-shadow:0 18px 48px rgba(3,8,20,0.45);\n          color:#f5f7ff;\n          text-align:center;\n          min-width:260px;\n          font-family:'Inter','Segoe UI',sans-serif;\n        }\n        .btfw-boot-overlay__ring{\n          width:58px;\n          height:58px;\n          border-radius:50%;\n          border:4px solid rgba(255,255,255,0.18);\n          border-top-color:#6d4df6;\n          animation:btfw-boot-spin 1s linear infinite;\n        }\n        .btfw-boot-overlay__label{\n          font-size:0.95rem;\n          letter-spacing:0.02em;\n          opacity:0.88;\n        }\n        .btfw-boot-overlay__label strong{\n          display:block;\n          font-size:1.05rem;\n          letter-spacing:0.03em;\n          margin-bottom:0.35rem;\n        }\n        .btfw-boot-overlay__error{\n          display:none;\n          font-size:0.85rem;\n          color:#ffb4c1;\n        }\n        #btfw-boot-overlay[data-state=error] .btfw-boot-overlay__error{\n          display:block;\n        }\n        #btfw-boot-overlay[data-state=error] .btfw-boot-overlay__ring{\n          border-color:rgba(255,180,193,0.3);\n          border-top-color:#ff5678;\n          animation:none;\n        }\n        @keyframes btfw-boot-spin{\n          from{transform:rotate(0deg);}\n          to{transform:rotate(360deg);}\n        }\n      ";
      document.head.appendChild(styleEl);
    }

    function attach(){
      if (overlay) return overlay;
      ensureStyles();
      overlay=document.createElement('div');
      overlay.id='btfw-boot-overlay';
      overlay.setAttribute('role','status');
      overlay.setAttribute('aria-live','polite');
      overlay.innerHTML="\n        <div class=\"btfw-boot-overlay__card\">\n          <div class=\"btfw-boot-overlay__ring\"></div>\n          <p class=\"btfw-boot-overlay__label\">\n            <strong>BillTube theme</strong>\n            Preparing the channel experience…\n          </p>\n          <p class=\"btfw-boot-overlay__error\"></p>\n        </div>\n      ";
      var mount=function(){
        if (!overlay || overlay.isConnected) return;
        var host=document.body||document.documentElement;
        host.appendChild(overlay);
      };
      if (document.body) mount();
      else document.addEventListener('DOMContentLoaded', mount, { once:true });
      return overlay;
    }

    function show(){ attach(); startAudioSuppression(); }

    function hide(){
      stopAudioSuppression();
      if (!overlay) return;
      overlay.setAttribute('data-state','hidden');
      setTimeout(function(){ if(overlay){ overlay.remove(); overlay=null; } if(styleEl){ styleEl.remove(); styleEl=null; } }, 260);
    }

    function fail(message){
      var ov=attach();
      ov.setAttribute('data-state','error');
      var label=ov.querySelector('.btfw-boot-overlay__label');
      if (label) label.innerHTML='<strong>BillTube theme</strong>Something went wrong loading the experience.';
      var err=ov.querySelector('.btfw-boot-overlay__error');
      if (err) err.textContent=message||'Please refresh to retry.';
      setTimeout(function(){ hide(); }, 4000);
    }

    return { show, hide, fail };
  })();

  BootOverlay.show();

function qparam(u, kv){ return u + (u.indexOf('?')>=0?'&':'?') + kv; }

var BTFW_VERSION = (function(){
  var m = /[?&]v=([^&]+)/.exec(location.search);
  return (m && m[1]) || ('dev-' + Date.now());
})();

var SUPPORTS_PRELOAD = (function(){
  try {
    return document.createElement("link").relList.supports("preload");
  } catch (e) {
    return false;
  }
})();

// Dev mode: when true, every module/CSS URL gets `?t=<ms>` appended so neither
// the browser nor the CDN edge can serve a cached copy. Slower (every load is
// a MISS) but bullet-proof for live iteration. When false (the default for
// production), URLs stay stable so jsdelivr's commit-pinned cache and the
// viewer's browser cache both kick in — a typical reload is ~all hits.
//
// Resolution order:
//   1. window.BTFW_DEV_NOCACHE  (set by the channel loader)
//   2. localStorage "btfw:dev-nocache" === "1"  (per-viewer override)
//   3. ?btfw_dev=1 in the page URL  (one-off override)
//   4. default: false
//
// The Channel Theme Toolkit exposes a toggle that writes to (2) so admins can
// flip it without redeploying the loader.
var BTFW_DEV_NOCACHE = (function(){
  try { if (window.BTFW_DEV_NOCACHE === true) return true; } catch(_) {}
  try { if (localStorage.getItem("btfw:dev-nocache") === "1") return true; } catch(_) {}
  try { if (/[?&]btfw_dev=1\b/.test(location.search)) return true; } catch(_) {}
  return false;
})();
try { window.BTFW_DEV_NOCACHE = BTFW_DEV_NOCACHE; } catch(_) {}

function maybeBust(url){
  return BTFW_DEV_NOCACHE ? qparam(url, "t="+Date.now()) : url;
}

function preload(href){
  return new Promise(function(resolve){
    var l = document.createElement("link");
    var url = maybeBust(href);

    if (SUPPORTS_PRELOAD) {
      l.rel = "preload";
      l.as  = "style";
      l.onload = function(){
        l.rel = "stylesheet";
        l.removeAttribute("onload");
        resolve(true);
      };
      l.onerror = function(){
        l.rel = "stylesheet";
        resolve(false);
      };
    } else {
      l.rel = "stylesheet";
      l.onload = function(){ resolve(true); };
      l.onerror = function(){ resolve(false); };
    }

    l.href = url;
    document.head.appendChild(l);

    if (!SUPPORTS_PRELOAD) {
      resolve(true);
    }
  });
}

function load(src){
  // Retry up to 3 attempts with backoff. jsdelivr edges occasionally serve a
  // brief 404 for a commit-pinned URL right after a push while the new SHA
  // propagates from origin. A single failure used to abort the entire boot
  // and the channel rendered as bare CyTube; one quick retry usually
  // succeeds and the user never notices.
  return new Promise(function(resolve, reject){
    var attempts = 0;
    function attempt(){
      attempts++;
      var s = document.createElement("script");
      s.async = true; s.defer = true;
      // Always tack on ?retry=N on retries so the edge sees a distinct URL
      // even in production mode (where maybeBust returns the bare URL).
      s.src = maybeBust(src) + (attempts > 1 ? (maybeBust(src) === src ? "?" : "&") + "retry="+attempts : "");
      s.onload = function(){ resolve(); };
      s.onerror = function(){
        try { s.remove(); } catch(_) {}
        if (attempts < 3) {
          setTimeout(attempt, 400 * attempts);
        } else {
          reject(new Error("Failed to load "+src+" after "+attempts+" attempts"));
        }
      };
      document.head.appendChild(s);
    }
    attempt();
  });
}

function loadAll(files){
  return Promise.all(files.map(function(f){ return load(BASE+"/"+f); }));
}

// Resolve `@<branch>` in BASE to a commit SHA via the GitHub API so every
// asset request goes to an atomic commit-pinned URL. jsdelivr's branch-alias
// resolution is occasionally stuck on a stale SHA at the edge, which makes
// the framework load partially-old code; commit-pinned URLs never have that
// problem.
function resolveBranchToSHA(){
  var m = BASE.match(/^(https:\/\/cdn\.jsdelivr\.net\/gh\/([^\/]+)\/([^@]+))@([^\/]+)$/);
  if (!m) return Promise.resolve();
  var prefix = m[1], owner = m[2], repo = m[3], ref = m[4];
  if (/^[0-9a-f]{7,40}$/i.test(ref)) return Promise.resolve(); // already a SHA
  var url = 'https://api.github.com/repos/' + owner + '/' + repo + '/branches/' + encodeURIComponent(ref);
  return fetch(url, { cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){
      var sha = j && j.commit && j.commit.sha;
      if (!sha) return;
      BASE = prefix + '@' + sha;
      if (window.BTFW) window.BTFW.BASE = BASE;
      try { console.info('[BTFW] resolved ' + ref + ' -> ' + sha.slice(0, 7)); } catch (_) {}
    })
    .catch(function(){ /* fall through to original branch URL */ });
}

  // Preload CSS in proper order for layout stability
  resolveBranchToSHA().then(function(){
    return Promise.all([
    preload(BASE+"/css/tokens.css"),
    preload(BASE+"/css/base.css"),
    preload(BASE+"/css/navbar.css"),
    preload(BASE+"/css/chat.css"),
    preload(BASE+"/css/overlays.css"),
    preload(BASE+"/css/player.css"),
    preload(BASE+"/css/mobile.css")
  ]); }).then(function(){
    // Load modules in dependency stages. Cache busting stays enabled for testing,
    // but independent files within a stage no longer block each other.
    var coreMods=[
      "modules/util-motion.js",
      "modules/util-chat-popover.js",
      "modules/feature-style-core.js",
      "modules/feature-bulma-layer.js"
    ];
    var layoutMods=[
      "modules/feature-layout.js",
    ];
    var featureMods=[
      "modules/feature-channels.js",
      "modules/feature-footer.js",
      "modules/feature-player.js",
      "modules/feature-stack.js",
      "modules/feature-chat.js",
      "modules/feature-chat-tools.js",
      "modules/feature-chat-filters.js",
      "modules/feature-navbar.js",
      "modules/feature-modal-skin.js",
      "modules/feature-nowplaying.js",
      "modules/feature-movie-info.js",
      "modules/feature-auto-subs.js",
      "modules/feature-chat-username-colors.js",
      "modules/feature-emotes.js",
      "modules/feature-chat-media.js",
      "modules/feature-emoji-compat.js",
      "modules/feature-chat-avatars.js",
      "modules/feature-chat-timestamps.js",
      "modules/feature-chat-ignore.js",
      "modules/feature-user-status.js",
      "modules/feature-connection-status.js",
      "modules/feature-gifs.js",
      "modules/feature-video-overlay.js",
      "modules/feature-poll-overlay.js",
      "modules/feature-pip.js",
      "modules/feature-notify.js",
      "modules/feature-notification-sounds.js",
      "modules/feature-audio-enhancer.js",
      "modules/feature-sync-guard.js",
      "modules/feature-chat-commands.js",
      "modules/feature-playlist-performance.js",
      "modules/feature-playlist-tools.js",
      "modules/feature-local-subs.js",
      "modules/feature-emoji-loader.js",
      "modules/feature-billcast.js",
      "modules/feature-motd-editor.js",
      "modules/feature-video-enhancements.js",
      "modules/feature-channel-theme-admin.js",
      "modules/feature-js-editor.js",
      "modules/feature-emotes-admin.js",
      "modules/feature-theme-settings.js",
      "modules/feature-ratings.js",
      "modules/feature-theater.js"
    ];
    return loadAll(coreMods)
      .then(function(){
        return Promise.all([
          BTFW.init("feature:styleCore"),
          BTFW.init("feature:bulma-layer")
        ]);
      })
      .then(function(){ return loadAll(layoutMods); })
      .then(function(){ return BTFW.init("feature:layout"); })
      .then(function(){
        // One frame is enough for layout to commit — the old 100ms setTimeout
        // was a guess that delayed every viewer's boot by ~85ms beyond what
        // the browser actually needed.
        return new Promise(function(resolve){ requestAnimationFrame(function(){ resolve(); }); });
      })
      .then(function(){ return loadAll(featureMods); });
  }).then(function(){
    return Promise.all([
      BTFW.init("feature:channels"),
      BTFW.init("feature:footer"),
      BTFW.init("feature:player"),
      BTFW.init("feature:stack"),
      BTFW.init("feature:chat"),
      BTFW.init("feature:chat-tools"),
      BTFW.init("feature:chat-filters"),
      BTFW.init("feature:chat-username-colors"),
      BTFW.init("feature:emotes"),
      BTFW.init("feature:chatMedia"),
      BTFW.init("feature:emoji-compat"),
      BTFW.init("feature:chat-avatars"),
      BTFW.init("feature:chat-timestamps"),
      BTFW.init("feature:chat-ignore"),
      BTFW.init("feature:user-status"),
      BTFW.init("feature:connection-status"),
      BTFW.init("feature:navbar"),
      BTFW.init("feature:modal-skin"),
      BTFW.init("feature:nowplaying"),
      BTFW.init("feature:movie-info"),
      BTFW.init("feature:auto-subs"),
      BTFW.init("feature:gifs"),
      BTFW.init("feature:videoOverlay"),
      BTFW.init("feature:poll-overlay"),
      BTFW.init("feature:pip"),
      BTFW.init("feature:notify"),
      BTFW.init("feature:notification-sounds"),
      BTFW.init("feature:audioEnhancer"),
      BTFW.init("feature:syncGuard"),
      BTFW.init("feature:chat-commands"),
      BTFW.init("feature:playlistPerformance"),
      BTFW.init("feature:playlist-tools"),
      BTFW.init("feature:local-subs"),
      BTFW.init("feature:emoji-loader"),
      BTFW.init("feature:billcast"),
      BTFW.init("feature:motd-editor"),
      BTFW.init("feature:videoEnhancements"),
      BTFW.init("feature:channelThemeAdmin"),
      BTFW.init("feature:js-editor"),
      BTFW.init("feature:emotes-admin"),
      BTFW.init("feature:themeSettings"),
      BTFW.init("feature:ratings"),
      BTFW.init("feature:theater")
    ]);
  }).then(function(){
    console.log("[BTFW v3.4g] Ready.");
    // Dispatch a final ready event
    document.dispatchEvent(new CustomEvent('btfw:ready', {
      detail: { version: '3.4g', timestamp: Date.now() }
    }));
    BootOverlay.hide();
  })
  .catch(function(e){
    console.error("[BTFW v3.4g] boot failed:", e&&e.message||e);
    BootOverlay.fail((e&&e.message)||'Unknown error');
  });

})();
