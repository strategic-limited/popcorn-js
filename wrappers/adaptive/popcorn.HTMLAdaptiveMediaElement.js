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

  function loadHlsJs(callback) {
    if (window.Hls) {
      callback();
    } else {
      var requireDefine;
      var script = document.createElement('script');
      script.addEventListener('load', function() {
        window.define = requireDefine;
        callback();
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

    media.setAttribute('playsinline', '');
    media.setAttribute('webkit-playsinline', '');

    var source = document.createElement('source');
    media.appendChild(source);

    parent.appendChild(media);

    // Add the helper function _canPlaySrc so this works like other wrappers.
    media._canPlaySrc = canPlaySrc;

    Object.defineProperties( media, {

      src: {
        get: function() {
          return media._src;
        },
        set: function( aSrc ) {
          media._src = aSrc;
          var sources = media._src.split('|');
          sources.forEach(function(source) {
            var extension = source.split('.').reverse()[0];
            switch (extension) {
              case 'mpd':
                loadDashJs(function() {
                  var player = dashjs.MediaPlayer().create();
                  player.initialize(media, source, false);
                });
                break;
              case 'm3u8':
                loadHlsJs(function() {
                  if(Hls.isSupported()) {
                    var hls = new Hls();
                    hls.loadSource(source);
                    hls.attachMedia(media);
                  }
                  else {
                    var sources = media.getElementsByTagName('source');
                    if(aSrc && aSrc !== sources[0].src) {
                      sources[0].src = aSrc;
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
