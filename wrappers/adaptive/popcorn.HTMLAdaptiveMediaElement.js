/**
 * The AdaptiveVideoElement are wrapped media elements
 * that are created within a DIV, and forward their properties and methods
 * to a wrapped object.
 */

(function(Popcorn, document) {
  var EMPTY_STRING = '';
  var autoQuality = -1;
  var autoQualityName = "auto";

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

  var activated;

  var iosContainer = 'video-for-ios';

  function isMicrosoftBrowser() {
    return navigator.appName === 'Microsoft Internet Explorer' ||
      (navigator.appName === "Netscape" && navigator.appVersion.indexOf('Edge') > -1) ||
      (navigator.appName === "Netscape" && navigator.appVersion.indexOf('Trident') > -1)
  }
  function isIosMobile() {
    return navigator.userAgent.match(/(iPad|iPhone|iPod)/g) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }


  function getExtension(source) {
    const existTiming = !isIosMobile() && source.match(/#t=/g);
    let sourceString = source;
    if (existTiming) {
      sourceString = source.split('#')[0];
    }
    return sourceString.split('.').reverse()[0];
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
          var hls = new Hls({ autoStartLoad: false });
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
    var parent = typeof id === 'string' ? document.querySelector(id) : id;
    var isIos = isIosMobile();
    var media;
    if (!activated && isIos && parent) {
      var container = document.createElement('div');
      container.id = 'container-video-for-ios';
      container.className = "popcorn-sequencer";
      container.style.position = "absolute";
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.top = 0;
      container.style.left = 0;
      container.style.zIndex = 2;

      var video = document.createElement('video');
      video.style.width = "100%";
      video.style.height = "100%";
      video.id = iosContainer;

      const mediaSource = document.createElement('source');
      mediaSource.id = 'video-src-for-ios';
      video.appendChild(mediaSource);
      container.appendChild(video);
      parent.appendChild(container);
    }

    if (isIos) {
      media = document.getElementById(iosContainer);
    } else {
      media = document.createElement(mediaType);
    }

    if (!activated) {
      var impl = {
        autoplay: EMPTY_STRING,
        qualities: [],
        currentQuality: autoQuality,
      };

      media.dispatchEvent = function(name, data) {
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
      [
        'seeked', 'timeupdate', 'progress', 'play',
        'pause', 'seeking', 'waiting', 'playing',
        'error', 'volumechange', 'loadedmetadata',
      ].forEach(function(event) {
        media.addEventListener(event, function() {
          media.dispatchEvent(event);
        });
      });
      // Mimic DOM events with custom, namespaced events on the document.
      // Each media element using this prototype needs to provide a unique
      // namespace for all its events via _eventNamespace.

      media.addEventListener = function(type, listener, useCapture) {
        document.addEventListener(this._eventNamespace + type, listener, useCapture);
      };

      media.removeEventListener = function(type, listener, useCapture) {
        document.removeEventListener(this._eventNamespace + type, listener, useCapture);
      };

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
        qualities: {
          get: function() {
            return impl.qualities;
          },
          set: function(val = []) {
            impl.qualities = val;
          },
          configurable: true
        },
        currentQuality: {
          get: function() {
            return impl.currentQuality;
          },
          set: function(val) {
            impl.currentQuality = val;
            if (updateQuality) {
              updateQuality(impl.currentQuality);
            }
          },
          configurable: true
        },
        src: {
          get: function() {
            return media._src;
          },
          set: function(aSrc) {
            function setRawSource(source) {
              var extension = getExtension(source);
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
                if (isIos) {
                  var mediaSource = document.getElementById('video-src-for-ios');
                  if (videoFormats[extension] || audioFormats[extension]) {
                    mediaSource.type = videoFormats[extension] || audioFormats[extension];
                  }
                  mediaSource.src = source;
                  media.load();
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
            }
            media._src = aSrc;
            function findMediaSource(sources, acceptableSources) {
              return sources.filter(function(source) {
                var extension = getExtension(source);
                return acceptableSources && acceptableSources.indexOf(extension) !== -1;
              })[0];
            }
            function findTimeSource(sources) {
              if (!isIos) {
                return null;
              }
              return sources.filter(function(source) {
                return source.match(/#t=/g);
              })[0];
            }

            var sources = media._src.split('|');
            var hlsMedia = findMediaSource(sources, ['m3u8']);
            var dashMedia = findMediaSource(sources, ['mpd']);
            var fallbackMedia = findMediaSource(sources, ['mp4', 'webm']);
            var timeMedia = findTimeSource(sources);
            var timeArr;
            if (timeMedia) {
              timeArr = (timeMedia).split('#t=');
            }
            var timeStr = '';
            var from = 0;
            if (timeArr && timeArr.length > 1) {
              timeStr = timeArr[1];
              from = timeStr.split(',')[0];
            }

            if (dashMedia || hlsMedia) {
              var adaptiveMedia = dashMedia || hlsMedia;
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
                        bitrates = bitrates.map(function(q, idx) {
                          q.resolution = q.height;
                          q.value = idx;
                          return q;
                        });
                        bitrates.push({ resolution: autoQualityName, value: autoQuality });
                        media.qualities = bitrates;
                      } else {
                        media.qualities = [];
                      }
                      media.currentQuality = player.getQualityFor('video');
                      media.dispatchEvent("bitrateloaded");
                      updateQuality = function(currentQuality) {
                        if (currentQuality === autoQuality) {
                          player.setAutoSwitchQualityFor('video', true);
                        } else {
                          player.setAutoSwitchQualityFor('video', false);
                          player.setQualityFor('video', currentQuality);
                        }
                      }
                    });
                    player.initialize(media, adaptiveMedia, false);
                  });
                  break;
                case 'm3u8':
                  loadHlsJs(media, function(hls) {
                    if(Hls.isSupported()) {
                      hls.on(Hls.Events.ERROR, function(error, data) {
                        // fallback to default media source
                        if (data.type === 'networkError') {
                          media.src = fallbackMedia;
                        }
                      });
                      hls.on(Hls.Events.MEDIA_ATTACHED, function() {
                        var bitrates = hls.levels;
                        if (bitrates && bitrates.length) {
                          bitrates = bitrates.map(function(q, idx) {
                            q.resolution = q.height;
                            q.value = idx;
                            return q;
                          });
                          bitrates.push({ resolution: autoQualityName, value: autoQuality });
                          media.qualities = bitrates;
                        } else {
                          media.qualities = [];
                        }
                        media.dispatchEvent("bitrateloaded");
                        updateQuality = function(currentQuality) {
                          hls.currentLevel = currentQuality;
                        }
                      });
                      console.info(from);
                      hls.startLoad(from);
                      hls.loadSource(adaptiveMedia);
                      hls.attachMedia(media);
                    } else if (media.canPlayType('application/vnd.apple.mpegurl')) {
                      const existTiming = adaptiveMedia.match(/#t=/g);
                      if (!existTiming) {
                        adaptiveMedia = adaptiveMedia + "#t=" + from;
                      }
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
    }

    if (!isIos) {
      parent.appendChild(media);
    }

    if (isIos) {
      activated = true;
    }
    return media;
  }

  Popcorn.HTMLAdaptiveMediaElement = function(id) {
    return wrapMedia(id, 'video');
  };
  Popcorn.HTMLAdaptiveMediaElement._canPlaySrc = canPlaySrc;

}(Popcorn, window.document));
