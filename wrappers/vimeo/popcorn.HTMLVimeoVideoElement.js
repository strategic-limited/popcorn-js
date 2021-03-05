(function (Popcorn, window, document) {

  const digiRegExp = new RegExp(/\d+$/);

  var inited = false;
  var

    EMPTY_STRING = "",
    VIMEO_HOST = "https://player.vimeo.com"
  ;

  function isIos() {
    return navigator.userAgent.match(/(iPad|iPhone|iPod)/g) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function initVimeoAPI(callback) {
    var script;
    var requireDefine;
    // If script is already there, check if it is loaded.
    if (window.Vimeo) {
      callback();
    } else {
      script = document.createElement('script');
      script.addEventListener('load', function(event) {
        window.define = requireDefine;
        callback();
      });
      script.src = 'https://player.vimeo.com/api/player.js';
      requireDefine = window.define;
      window.define = function() {};
      document.head.appendChild(script);
    }
  }

  function HTMLVimeoVideoElement(id) {

    // Vimeo iframe API requires postMessage
    if (!window.postMessage) {
      throw "ERROR: HTMLVimeoVideoElement requires window.postMessage";
    }
    var parent;

    if (isIos()) {
      parent = document.getElementById('container-video-for-ios');
      const videos = parent.getElementsByTagName('video');
      if (videos && videos.length) {
        for (let i = 0; i < videos.length; i++) {
          videos[i].style.display = 'none';
        }
      }
    } else {
      parent = typeof id === "string" ? Popcorn.dom.find(id) : id;
    }

    var self = new Popcorn._MediaElementProto(),

      elem = document.createElement( "div" ),
      impl = {
        src: EMPTY_STRING,
        networkState: self.NETWORK_EMPTY,
        readyState: self.HAVE_NOTHING,
        seeking: false,
        autoplay: EMPTY_STRING,
        preload: EMPTY_STRING,
        controls: false,
        loop: false,
        poster: EMPTY_STRING,
        // Vimeo seems to use .77 as default
        volume: 1,
        // Vimeo has no concept of muted, store volume values
        // such that muted===0 is unmuted, and muted>0 is muted.
        muted: 0,
        currentTime: 0,
        duration: NaN,
        ended: false,
        paused: true,
        error: null
      },
      playerReady = false,
      playerUID = Popcorn.guid("player_"),
      player,
      playerPaused = false,
      playerReadyCallbacks = [],
      currentTimeInterval,
      lastCurrentTime = 0;

    // Namespace all events we'll produce
    self._eventNamespace = Popcorn.guid("HTMLVimeoVideoElement::");

    self.parentNode = parent;

    // Mark type as Vimeo
    self._util.type = "Vimeo";

    function onPlayerReady() {
      player.on('timeupdate', function (event) {
        onCurrentTime(parseFloat(event.seconds));
      });
      player.on('progress', function (event) {
        player.buffered = event;
        self.dispatchEvent("progress");
      });
      player.on('play', onPlay);
      player.on('pause', onPause);
      player.on('ended', onEnded);
      player.on('seeked', onSeeked);
      player.on('error', function (error) {
        impl.error = error;
        self.dispatchEvent("error");
      });
      player.on('volumechange', function (event) {
        onVolume(event.volume);
      });

      impl.networkState = self.NETWORK_LOADING;
      self.dispatchEvent("loadstart");
      self.dispatchEvent("progress");

      if (isIos()) {
        player.getVideoId().then(function(id) {
          player.loadVideo(id).then(function() {
            setTimeout(() => {
              impl.readyState = self.HAVE_METADATA;
              self.dispatchEvent( "loadedmetadata" );
            },1000);
          });
        });
      } else {
        impl.readyState = self.HAVE_METADATA;
        self.dispatchEvent( "loadedmetadata" );

        impl.readyState = self.HAVE_ENOUGH_DATA;
        self.dispatchEvent( "canplaythrough" );
      }
    }

    function updateDuration(newDuration) {
      var oldDuration = impl.duration;

      if (oldDuration !== newDuration) {
        impl.duration = newDuration;
        self.dispatchEvent("durationchange");

        // Deal with first update of duration
        if (isNaN(oldDuration)) {
          impl.networkState = self.NETWORK_IDLE;
          impl.readyState = self.HAVE_METADATA;
          self.dispatchEvent("loadedmetadata");

          self.dispatchEvent("loadeddata");

          impl.readyState = self.HAVE_FUTURE_DATA;
          self.dispatchEvent("canplay");

          impl.readyState = self.HAVE_ENOUGH_DATA;
          self.dispatchEvent("canplaythrough");
          // Auto-start if necessary
          if (impl.autoplay) {
            self.play();
          }

          var i = playerReadyCallbacks.length;
          while (i--) {
            playerReadyCallbacks[i]();
            delete playerReadyCallbacks[i];
          }
        }
      }
    }

    function destroyPlayer() {
      inited = false;
      if (!player) {
        return;
      }
      player.pause();
      player.unload();

      if (isIos()) {
        parent = document.getElementById('container-video-for-ios');
        const videos = parent.getElementsByTagName('video');
        if (videos && videos.length) {
          for (let i = 0; i < videos.length; i++) {
            videos[i].style.display = '';
          }
        }
      }
      parent.removeChild(elem);
      elem = document.createElement("div");
    }

    self.play = function () {
      impl.paused = false;

      player.play();
    };

    function changeCurrentTime(aTime) {
      onSeeking();
      player.setCurrentTime(aTime);
    }

    function onSeeking() {
      impl.seeking = true;
      self.dispatchEvent("seeking");
    }

    function onSeeked(event) {
      impl.seeking = false;
      self.dispatchEvent("timeupdate");
      self.dispatchEvent("seeked", event);
      self.dispatchEvent("canplay");
      self.dispatchEvent("canplaythrough");
    }

    self.pause = function () {
      impl.paused = true;

      player.pause();
    };

    function onPause() {
      impl.paused = true;
      if (!playerPaused) {
        playerPaused = true;
        self.dispatchEvent("pause");
      }
    }

    function onPlay() {
      if (impl.ended) {
        changeCurrentTime(0);
      }

      if (!currentTimeInterval) {
        // Only 1 play when video.loop=true
        if (impl.loop) {
          self.dispatchEvent("play");
        }
      }

      impl.paused = false;
      if (playerPaused) {
        playerPaused = false;

        // Only 1 play when video.loop=true
        if (!impl.loop) {
          self.dispatchEvent("play");
        }
        self.dispatchEvent("playing");
      }
    }

    function onEnded() {
      if (impl.loop) {
        changeCurrentTime(0);
        self.play();
      } else {
        impl.ended = true;
        self.dispatchEvent("ended");
      }
    }

    function onCurrentTime(aTime) {
      var currentTime = impl.currentTime = aTime;

      if (currentTime !== lastCurrentTime) {
        self.dispatchEvent("timeupdate");
      }

      lastCurrentTime = impl.currentTime;
    }

    function onVolume(aValue) {
      if (impl.volume !== aValue) {
        impl.volume = aValue;
        self.dispatchEvent("volumechange");
      }
    }

    function setVolume(aValue) {
      impl.volume = aValue;

      player.setVolume(aValue);
      self.dispatchEvent("volumechange");
    }

    function getVolume() {
      // If we're muted, the volume is cached on impl.muted.
      return impl.muted > 0 ? impl.muted : impl.volume;
    }

    function setMuted(aMute) {

      // Move the existing volume onto muted to cache
      // until we unmute, and set the volume to 0.
      if (aMute) {
        impl.muted = impl.volume;
        setVolume(0);
      } else {
        impl.muted = 0;
        setVolume(impl.muted);
      }
    }

    function getMuted() {
      return impl.muted > 0;
    }

    function changeSrc(aSrc) {
      const needDestroy = isIos() && aSrc === 'failed';
      if (needDestroy) {
        return destroyPlayer();
      }
      if (!self._canPlaySrc(aSrc)) {
        impl.error = {
          name: "MediaError",
          message: "Media Source Not Supported",
          code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        };
        self.dispatchEvent("error");
        return;
      }

      impl.src = aSrc;
      if (isIos()) {
        impl.readyState = -1;
      }

      if (playerReady) {
        destroyPlayer();
      }

      playerReady = false;

      var parsedSrc = self._util.parseUri(aSrc),
        queryKey = parsedSrc.queryKey;
      var src;

      // Sync loop and autoplay based on URL params, and delete.
      // We'll manage both internally.
      impl.loop = queryKey.loop === "1" || impl.loop;
      delete queryKey.loop;
      impl.autoplay = queryKey.autoplay === "1" || impl.autoplay;
      delete queryKey.autoplay;

      // Create the base vimeo player string. It will always have query string options
      src = VIMEO_HOST + '/video/' + digiRegExp.exec(parsedSrc.path) + "?";
      const idExec = digiRegExp.exec(parsedSrc.path);
      let id = undefined;
      if (idExec && idExec.length) {
        id = idExec[0];
      }
      elem.style.width = '100%';
      elem.style.height = '100%';

      if (inited) {
        player.loadVideo(id).then(function() {
          setTimeout(() => {
            impl.readyState = self.HAVE_METADATA;
            self.dispatchEvent( "loadedmetadata" );
          },1000);
        });
      }
      else {
        initVimeoAPI(function () {
          elem.id = playerUID;
          elem.allow = 'autoplay; fullscreen';
          player = new Vimeo.Player(elem, {
            url: src,
            autoplay: impl.autoplay,
            loop: false,
            byline: false,
            portrait: false,
            title: false,
            responsive: false
          });

          parent.appendChild(elem);

          player.ready().then(function () {
            inited = true;
            const iframes = elem.getElementsByTagName('iframe');
            if (iframes && iframes.length) {
              for (let i = 0; i < iframes.length; i++) {
                iframes[i].style.width = '100%';
                iframes[i].style.height = '100%';
              }
            }
            if (!navigator.userAgent.match(/(iPad|iPhone|iPod|Android)/g)) {
              player.setVolume(0);
              player.play().then(function () {
                player.pause();
                player.getDuration().then(function (duration) {
                  player.setVolume(1);
                  updateDuration(duration);
                  onPlayerReady();
                });
              });
            } else {
              onPlayerReady();
            }
          });
        });
      }
    }

    Object.defineProperties(self, {

      src: {
        get: function () {
          return impl.src;
        },
        set: function (aSrc) {
          if (aSrc && aSrc !== impl.src) {
            changeSrc(aSrc);
          }
        }
      },

      autoplay: {
        get: function () {
          return impl.autoplay;
        },
        set: function (aValue) {
          impl.autoplay = self._util.isAttributeSet(aValue);
        }
      },

      loop: {
        get: function () {
          return impl.loop;
        },
        set: function (aValue) {
          impl.loop = self._util.isAttributeSet(aValue);
        }
      },

      width: {
        get: function () {
          return self.parentNode.offsetWidth;
        }
      },

      height: {
        get: function () {
          return self.parentNode.offsetHeight;
        }
      },

      currentTime: {
        get: function () {
          return impl.currentTime;
        },
        set: function (aValue) {
          changeCurrentTime(aValue);
        }
      },

      duration: {
        get: function () {
          return impl.duration;
        }
      },

      ended: {
        get: function () {
          return impl.ended;
        }
      },

      paused: {
        get: function () {
          return impl.paused;
        }
      },

      seeking: {
        get: function () {
          return impl.seeking;
        }
      },

      readyState: {
        get: function () {
          return impl.readyState;
        }
      },

      networkState: {
        get: function () {
          return impl.networkState;
        }
      },

      volume: {
        get: function () {
          return getVolume();
        },
        set: function (aValue) {
          if (aValue < 0 || aValue > 1) {
            throw "Volume value must be between 0.0 and 1.0";
          }

          setVolume(aValue);
        }
      },

      muted: {
        get: function () {
          return getMuted();
        },
        set: function (aValue) {
          setMuted(self._util.isAttributeSet(aValue));
        }
      },

      error: {
        get: function () {
          return impl.error;
        }
      },

      buffered: {
        get: function () {
          return {
            start: function () {
              return 0;
            },
            end: function () {
              return (player.buffered && player.buffered.seconds) || 0;
            },
            length: 1
          };
        },
        configurable: true
      }
    });

    self._canPlaySrc = Popcorn.HTMLVimeoVideoElement._canPlaySrc;
    self.canPlayType = Popcorn.HTMLVimeoVideoElement.canPlayType;

    return self;
  }

  Popcorn.HTMLVimeoVideoElement = function (id) {
    return new HTMLVimeoVideoElement(id);
  };

  // Helper for identifying URLs we know how to play.
  Popcorn.HTMLVimeoVideoElement._canPlaySrc = function (url) {
    return ( (/player.vimeo.com\/video\/\d+/).test(url) ||
      (/vimeo.com\/\d+/).test(url) ) ? "probably" : EMPTY_STRING;
  };

  // We'll attempt to support a mime type of video/x-vimeo
  Popcorn.HTMLVimeoVideoElement.canPlayType = function (type) {
    return type === "video/x-vimeo" ? "probably" : EMPTY_STRING;
  };

}(Popcorn, window, document));
