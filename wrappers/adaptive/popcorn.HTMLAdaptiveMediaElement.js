/**
 * The AdaptiveVideoElement are wrapped media elements
 * that are created within a DIV, and forward their properties and methods
 * to a wrapped object.
 */

(function (Popcorn, document) {
  var EMPTY_STRING = '';

  var audioFormats = {
    'mp3': 'audio/mpeg',
    'aac': 'audio/mp4',
    'ogg': 'audio/ogg',
    'oga': 'audio/ogg',
  };

  var videoFormats = {
    'webm': 'video/webm',
    'mp4': 'video/mp4',
  };
  
  var updateQuality;

  function isMicrosoftBrowser() {
    return navigator.appName === 'Microsoft Internet Explorer' ||
      (navigator.appName === "Netscape" && navigator.appVersion.indexOf('Edge') > -1) ||
      (navigator.appName === "Netscape" && navigator.appVersion.indexOf('Trident') > -1)
  }

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
      script.src = '//cdn.dashjs.org/v2.9.0/dash.all.min.js';
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
    };

    var qualities = [],
      quality = "auto";

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

    parent.appendChild(media);

    [
      'seeked', 'timeupdate', 'progress', 'play',
      'pause', 'seeking', 'waiting', 'playing',
      'error', 'volumechange', 'loadedmetadata',
    ].forEach(function (event) {
      media.addEventListener(event, function() {
        media.dispatchEvent(event);
      });
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
          function setRawSource(source) {
            var extension = source.split('.').reverse()[0];
            // IE and Edge do not understand source setting here for MSE BLOB
            if (isMicrosoftBrowser()) {
              if (source && source !== media.getAttribute('src')) {
                if (videoFormats[extension] || audioFormats[extension]) {
                  media.setAttribute('type', videoFormats[extension] || audioFormats[extension]);
                }
                media.setAttribute('src', source);
                media.load();
              }
            } else {
              var sources = media.getElementsByTagName('source');
              if (!sources[0] || (source && source !== sources[0].src)) {
                if (media.firstChild) {
                  media.removeChild(media.firstChild);
                }
                var mediaSource = document.createElement('source');
                if (videoFormats[extension] || audioFormats[extension]) {
                  mediaSource.type = videoFormats[extension] || audioFormats[extension];
                }
                mediaSource.src = source;
                media.appendChild(mediaSource);
                media.load();
              }
            }
          }
          media._src = aSrc;
          function findMediaSource(sources, acceptableSources) {
            return sources.filter(function(source) {
              var extension = source.split('.').reverse()[0];
              return acceptableSources.indexOf(extension) !== -1;
            })[0];
          }

          var sources = media._src.split('|');
          var hlsMedia = findMediaSource(sources, ['m3u8']);
          var dashMedia = findMediaSource(sources, ['mpd']);
          var fallbackMedia = findMediaSource(sources, ['mp4', 'webm']);


          if (dashMedia || hlsMedia) {
            // var adaptiveMedia = dashMedia || hlsMedia;
            var adaptiveMedia = hlsMedia || dashMedia;
            var extension = adaptiveMedia.split('.').reverse()[0];
            switch (extension) {
              case 'mpd':
                loadDashJs(function() {
                  var player = dashjs.MediaPlayer().create();
                  player.on(dashjs.MediaPlayer.events.ERROR, function(event) {
                    if (event.error === 'capability') {
                      // 23 says `message: "mediasource is not supported"`, so fallback to HLS
                      // as it happens mainly on Safari iOS
                      media.src = hlsMedia || fallbackMedia;
                    } else if (event.error === 'download' && event.event.id === 'manifest') {
                      // otherwise MPD manifest is not available so fallback to regular media file
                      media.src = fallbackMedia;
                    }
                  });
                  player.on(dashjs.MediaPlayer.events.SOURCE_INITIALIZED, function() {
                    player.setTrackSwitchModeFor('video', 'alwaysReplace');
                    player.setTrackSwitchModeFor('audio', 'alwaysReplace');
                    player.setAutoSwitchQualityFor('video', true);
                    player.setAutoSwitchQualityFor('audio', true);
                    player.setInitialBitrateFor('audio', 99999999);
                  });
                  player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, function() {
                    var bitrates = player.getBitrateInfoListFor('video');
                    if (bitrates && bitrates.length) {
                      bitrates = bitrates.map(function (q, idx) {
                        q.resolution = q.width + "x" + q.height;
                        q.value = idx;
                        return q;
                      });
                      bitrates.push({ resolution: "auto", value: "auto" });
                      qualities = bitrates;
                    } else {
                      qualities = [];
                    }
                    if (Popcorn.current && Popcorn.current.media) {
                      Popcorn.current.media.dispatchEvent( "loadedbitrate" );
                    } else {
                      media.dispatchEvent( "loadedbitrate" );
                    }
                    updateQuality = function (quality) {
                      if (quality === "auto") {
                        player.setAutoSwitchQualityFor('video', true);
                      } else {
                        player.setAutoSwitchQualityFor('video', false);
                        player.setQualityFor('video', quality);
                      }
                    }
                  });
                  player.initialize(media, adaptiveMedia, false);
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
                    hls.on(Hls.Events.MEDIA_ATTACHED, function () {
                      var bitrates = hls.levels;
                      if (bitrates && bitrates.length) {
                        bitrates = bitrates.map(function (q) {
                          q.resolution = q.width + "x" + q.height;
                          q.value = q.level;
                          return q;
                        });
                        bitrates.push({ resolution: "auto", value: "auto" });
                        qualities = bitrates;
                      } else {
                        qualities = [];
                      }
                      if (Popcorn.current && Popcorn.current.media) {
                        Popcorn.current.media.dispatchEvent( "loadedbitrate" );
                      } else {
                        media.dispatchEvent( "loadedbitrate" );
                      }
                      updateQuality = function (quality) {
                        hls.currentLevel = quality === "auto" ? -1 : quality;
                        //todo remove it
                        var r = hls.currentLevel;
                        console.info('quality = ' + r);
                      }
                    });
                    hls.loadSource(adaptiveMedia);
                    hls.attachMedia(media);
                  } else if (media.canPlayType('application/vnd.apple.mpegurl')) {
                    setRawSource(adaptiveMedia);
                  }
                });
                break;
              default:
                setRawSource(adaptiveMedia);
                break;
            }
          } else {
            setRawSource(fallbackMedia || aSrc);
          }
        }
      }
    });

    Object.defineProperties((Popcorn.current && Popcorn.current.media) || {}, {
      qualities: {
        get: function() {
          return qualities;
        },
        configurable: true
      },
      quality: {
        get: function() {
          return quality;
        },
        set: function(val) {
          quality = val;
          if (updateQuality) {
            updateQuality(quality);
          }
        },
        configurable: true
      },
    });

    return media;
  }

  Popcorn.HTMLAdaptiveMediaElement = function (id) {
    return wrapMedia(id, 'video');
  };
  Popcorn.HTMLAdaptiveMediaElement._canPlaySrc = canPlaySrc;

}(Popcorn, window.document));
