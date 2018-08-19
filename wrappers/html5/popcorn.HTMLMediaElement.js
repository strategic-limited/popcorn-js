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
          var extension = media._src.split('.').reverse()[0];
          switch (extension) {
            case 'mpd':
              var player = dashjs.MediaPlayer().create();
              player.initialize(media, aSrc, true);
              break;
            case 'm3u8':
              if(Hls.isSupported()) {
                var hls = new Hls();
                hls.loadSource(aSrc);
                hls.attachMedia(media);
                // hls.on(Hls.Events.MANIFEST_PARSED,function() {
                //   media.play();
                // });
              }
              else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                media.src = aSrc;
              }
              break;
            default:
              var sources = media.getElementsByTagName('source');
              if( aSrc && aSrc !== sources[0].src ) {
                sources[0].src = aSrc;
                media.load();
              }
              break;
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
