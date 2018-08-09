/**
 * The HTMLVideoElement and HTMLAudioElement are wrapped media elements
 * that are created within a DIV, and forward their properties and methods
 * to a wrapped object.
 */
(function (Popcorn, document) {

  // rethink exclusive detection
  var existingTypes = [/^(?:https?:\/\/www\.|https?:\/\/m\.|https?:\/\/|www\.|\.|^)youtu/,
      /vr360:\/\/(.)*\.(mp4|m3u8|mpd)/,
      /^(?:https?:\/\/www\.|https?:\/\/|www\.|\.|^)(vimeo\.com\/|player\.vimeo\.com\/video\/)\d+/,
      /^(?:https?:\/\/www\.|https?:\/\/|www\.|\.|^)(w\.)?(soundcloud)/,
      /^(?:https?:\/\/www\.|https?:\/\/|www\.|\.|^)archive\.org\/(details|download|stream)\/((.*)start(\/|=)[\d\.]+(.*)end(\/|=)[\d\.]+)?/,
      /^\s*#t=(?:\d*(?:(?:\.|\:)?\d+)?),?(\d+(?:(?:\.|\:)\d+)?)\s*$/,
      /^https?:\/\/(www\.)?flickr\.com/,
      /^https?:\/\/(www\.)?(staging\.)?(?:clyp\.it|audiour\.com)/],
    EMPTY_STRING = "";

  function canPlaySrc(src) {
    // We can't really know based on URL.
    for (var i = 0; i < existingTypes.length; i++) {
      if (existingTypes[i].test(src)) {
        return EMPTY_STRING;
      }
    }
    return "probably";
  }

  function wrapMedia(id, mediaType) {
    var parent = typeof id === "string" ? document.querySelector(id) : id,
      media = document.createElement(mediaType);

    media.setAttribute('playsinline', '');
    media.setAttribute('webkit-playsinline', '');

    parent.appendChild(media);

    // Add the helper function _canPlaySrc so this works like other wrappers.
    media._canPlaySrc = canPlaySrc;

    media._play = media.play;
    media._pause = media.pause;
    media.play = function () {
      console.log('play');
      media._play();
    };
    media.pause = function () {
      console.log('pause');
      media._pause();
    };

    media.addEventListener('loadedmetadata', function () {
      console.log('metadata loaded');
    });
    media.addEventListener('error', function (error) {
      console.log('error on metadata loading', error);
    });

    Object.defineProperties( media, {

      src: {
        get: function() {
          return media.getElementsByTagName('source')[0].src;
        },
        set: function( aSrc ) {
          var sources = media.getElementsByTagName('source');
          if( aSrc && aSrc !== sources[0].src ) {
            sources[0].src = aSrc;
            media.load();
          }
        }
      }
    });

    return media;
  }

  Popcorn.HTMLVideoElement = function (id) {
    return wrapMedia(id, "video");
  };
  Popcorn.HTMLVideoElement._canPlaySrc = canPlaySrc;


  Popcorn.HTMLAudioElement = function (id) {
    return wrapMedia(id, "audio");
  };
  Popcorn.HTMLAudioElement._canPlaySrc = canPlaySrc;

}(Popcorn, window.document));
