/**
 * The AdaptiveVideoElement are wrapped media elements
 * that are created within a DIV, and forward their properties and methods
 * to a wrapped object.
 */

(function (Popcorn, document) {
  var EMPTY_STRING = '';

  function canPlaySrc(src) {
    var sources = src.split('|');
    for (var i = 0; i < sources.length; i++) {
      if (/(.)*\.(mp4|m3u8|mpd)/.test(sources[i])) {
        return 'probably';
      }
    }
    return EMPTY_STRING;
  }

  function loadDashJs(callback) {
    if (window.dashjs) {
      callback();
    } else {
      var requireDefine;
      var script = document.createElement('script');
      script.addEventListener('load', function() {
        window.define = requireDefine;
        callback();
      });
      script.src = '//cdn.dashjs.org/latest/dash.all.min.js';
      requireDefine = window.define;
      window.define = function() {};
      document.head.appendChild(script);
    }
  }

  function loadHlsJs(media, callback) {
    if (window.Hls) {
      if(Hls.isSupported() && window.Hls.instance) {
        callback(window.Hls.instance);
      } else {
        callback();
      }
    } else {
      var requireDefine;
      var script = document.createElement('script');
      script.addEventListener('load', function() {
        window.define = requireDefine;
        if(Hls.isSupported()) {
          var hls = new Hls();
          hls.startLevel = -1;
          window.Hls.instance = hls;
          callback(hls);
        } else {
          callback();
        }
      });
      script.src = '//cdn.jsdelivr.net/npm/hls.js@latest';
      requireDefine = window.define;
      window.define = function() {};
      document.head.appendChild(script);
    }
  }

  function wrapMedia(id, mediaType) {
    var parent = typeof id === 'string' ? document.querySelector(id) : id,
      media = document.createElement(mediaType);

    var impl = {
      autoplay: EMPTY_STRING,
      firstRun: true,
    };

    media.dispatchEvent = function (name, data) {
      var customEvent = document.createEvent('CustomEvent'),
        detail = {
          type: name,
          target: media.parentNode,
          data: data
        };

      customEvent.initCustomEvent(media._eventNamespace + name, false, false, detail);
      document.dispatchEvent(customEvent);
    };

    media._eventNamespace = Popcorn.guid('HTMLAdaptiveMediaElement::');

    media.setAttribute('playsinline', '');
    media.setAttribute('webkit-playsinline', '');

    var source = document.createElement('source');
    media.appendChild(source);

    parent.appendChild(media);

    [
      'seeked', 'timeupdate', 'progress', 'play',
      'pause', 'seeking', 'waiting', 'playing',
      'error', 'volumechange', 'loadedmetadata'
    ].forEach(function (event) {
      media.addEventListener(event, function () {
        media.dispatchEvent(event);
      });
    });

    media.addEventListener('progress', function () {
      if (impl.autoplay && impl.firstRun) {
        impl.firstRun = false;
        media.play();
      }
    });

    // Add the helper function _canPlaySrc so this works like other wrappers.
    media._canPlaySrc = canPlaySrc;

    Object.defineProperties(media, {
      autoplay: {
        get: function() {
          return impl.autoplay;
        },
        set: function(aValue) {
          impl.autoplay = (typeof aValue === 'string' || aValue === true);
        }
      },
      src: {
        get: function() {
          return media._src;
        },
        set: function(aSrc) {
          media._src = aSrc;
          // latest source is mp4 fallback media
          var sources = media._src.split('|');
          var adaptiveMedias = sources.filter(function (source) {
            var extension = source.split('.').reverse()[0];
            return extension !== 'mp4' || extension !== 'webm';
          });
          var fallbackMedia = sources.filter(function (source) {
            var extension = source.split('.').reverse()[0];
            return extension === 'mp4' || extension === 'webm';
          })[0];
          adaptiveMedias.forEach(function(source) {
            var extension = source.split('.').reverse()[0];
            switch (extension) {
              case 'mpd':
                loadDashJs(function() {
                  var player = dashjs.MediaPlayer().create();
                  player.initialize(media, source, false);
                });
                break;
              case 'm3u8':
                loadHlsJs(media, function(hls) {
                  if(Hls.isSupported()) {
                    hls.on(Hls.Events.ERROR, function (error, data) {
                      // fallback to default media source
                      if (data.type === 'networkError') {
                        media.src = fallbackMedia;
                      }
                    });
                    hls.loadSource(source);
                    hls.attachMedia(media);
                  } else if (media.canPlayType('application/vnd.apple.mpegurl')) {
                    var sources = media.getElementsByTagName('source');
                    if(source && source !== sources[0].src) {
                      sources[0].src = source;
                      media.load();
                    }
                  }
                });
                break;
              default:
                var sources = media.getElementsByTagName('source');
                if(source && source !== sources[0].src) {
                  sources[0].src = source;
                  media.load();
                }
                break;
            }
          });
        }
      }
    });

    return media;
  }

  Popcorn.HTMLAdaptiveMediaElement = function (id) {
    return wrapMedia(id, 'video');
  };
  Popcorn.HTMLAdaptiveMediaElement._canPlaySrc = canPlaySrc;

}(Popcorn, window.document));
