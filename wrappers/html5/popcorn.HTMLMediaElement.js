/**
 * The HTMLVideoElement and HTMLAudioElement are wrapped media elements
 * that are created within a DIV, and forward their properties and methods
 * to a wrapped object.
 */
(function (Popcorn, document) {

  var activated;

  function isIos() {
    return navigator.userAgent.match(/(iPad|iPhone|iPod)/g) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // rethink exclusive detection
  var existingTypes = [/^(?:https?:\/\/www\.|https?:\/\/m\.|https?:\/\/|www\.|\.|^)youtu/,
      /vr360:\/\/(.)*\.(mp4|m3u8|mpd)/,
      /^(?:https?:\/\/www\.|https?:\/\/|www\.|\.|^)(vimeo\.com(\/[A-z0-9]*)+|player\.vimeo\.com\/video\/\d+)/,
      /^(?:https?:\/\/www\.|https?:\/\/|www\.|\.|^)(w\.)?(soundcloud)/,
      /^(?:https?:\/\/www\.|https?:\/\/|www\.|\.|^)archive\.org\/(details|download|stream)\/((.*)start(\/|=)[\d\.]+(.*)end(\/|=)[\d\.]+)?/,
      /^\s*#t=(?:\d*(?:(?:\.|\:)?\d+)?),?(\d+(?:(?:\.|\:)\d+)?)\s*$/,
      /^https?:\/\/(www\.)?flickr\.com/,
      /^https?:\/\/(www\.)?(staging\.)?(?:clyp\.it|audiour\.com)/],
    EMPTY_STRING = "";

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

  function isMicrosoftBrowser() {
    return navigator.appName === 'Microsoft Internet Explorer' ||
      (navigator.appName === "Netscape" && navigator.appVersion.indexOf('Edge') > -1) ||
      (navigator.appName === "Netscape" && navigator.appVersion.indexOf('Trident') > -1)
  }

  function canPlayAudioSrc(src) {
    // We can't really know based on URL.
    for (var i = 0; i < existingTypes.length; i++) {
      if (existingTypes[i].test(src)) {
        return EMPTY_STRING;
      }
    }
    var extension = src.split('.').reverse()[0];
    if (!audioFormats[extension]) {
      return EMPTY_STRING;
    }
    return "probably";
  }

  function canPlayVideoSrc(src) {
    // We can't really know based on URL.
    for (var i = 0; i < existingTypes.length; i++) {
      if (existingTypes[i].test(src)) {
        return EMPTY_STRING;
      }
    }
    var extension = src.split('.').reverse()[0];
    if (!videoFormats[extension]) {
      return EMPTY_STRING;
    }
    return "probably";
  }

  function wrapMedia(id, mediaType) {
    var parent = typeof id === "string" ? document.querySelector(id) : id,
      media = document.createElement(mediaType);

    if (isIos()) {
      media = document.getElementById(mediaType + '-for-ios');
      if (media.firstChild) {
        media.firstChild.src = null;
      }
    } else {
      media = document.createElement(mediaType);
      var source = document.createElement('source');
      media.appendChild(source);
    }

    media.setAttribute('playsinline', '');
    media.setAttribute('webkit-playsinline', '');

    if (!activated) {
      // Add the helper function _canPlaySrc so this works like other wrappers.
      media._canPlaySrc = function (src) {
        if (media.tagName === 'VIDEO') {
          return canPlayVideoSrc(src);
        } else {
          return canPlayAudioSrc(src);
        }
      };

      media._play = media.play;
      media._pause = media.pause;
      media.play = function () {
        media._play();
      };
      media.pause = function () {
        media._pause();
      };

      Object.defineProperties(media, {

        src: {
          get: function () {
            return isMicrosoftBrowser() ? media.getAttribute('src') : media.getElementsByTagName('source')[0].src;
          },
          set: function (aSrc) {
            if (isMicrosoftBrowser()) {
              if (aSrc && aSrc !== media.getAttribute('src')) {
                media.setAttribute('src', aSrc);
                media.setAttribute('type', videoFormats[extension] || audioFormats[extension]);
                media.load();
              }
            } else {
              var sources = media.getElementsByTagName('source');
              if (aSrc && aSrc !== sources[0].src) {
                var extension = aSrc.split('.').reverse()[0];
                sources[0].src = aSrc;
                sources[0].type = videoFormats[extension] || audioFormats[extension];
                media.load();
              }
            }
          }
        }
      });
    }

    if (!isIos()) {
      parent.appendChild(media);
    }

    if (isIos()) {
      activated = true;
    }

    return media;
  }

  Popcorn.HTMLVideoElement = function (id) {
    return wrapMedia(id, "video");
  };
  Popcorn.HTMLVideoElement._canPlaySrc = canPlayVideoSrc;


  Popcorn.HTMLAudioElement = function (id) {
    return wrapMedia(id, "audio");
  };
  Popcorn.HTMLAudioElement._canPlaySrc = canPlayAudioSrc;

}(Popcorn, window.document));
