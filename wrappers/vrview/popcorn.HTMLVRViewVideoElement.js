(function (Popcorn, window, document) {
  var
    EMPTY_STRING = '',
    ABS = Math.abs,
    CURRENT_TIME_MONITOR_MS = 10;

  var videoElement;

  function resolveHttpRedirects(url, callback) {
    var oReq = new XMLHttpRequest();
    oReq.addEventListener('load', function () {
      if (oReq.readyState !== XMLHttpRequest.DONE) {
        return;
      }
      if (Math.trunc(oReq.status / 100) === 2) {
        return callback(null, oReq.responseURL);
      }
      return callback({
        code: oReq.status,
        message: oReq.responseText
      });
    });
    oReq.open('HEAD', url);
    oReq.send();
  }

  function resolvePlaybackUrl(urls, callback) {
    urls = urls.filter(function(item) {
      var extension = item.split('.').reverse()[0];
      return extension === 'mp4' || extension === 'webm' || extension === 'mpd';
    });
    function processUrl(i) {
      if (i >= urls.length) {
        return callback({message: 'No sufficient URL found.'});
      }
      resolveHttpRedirects(urls[i], function(err, url) {
        if (!err) {
          return callback(null, url);
        }
        processUrl(i + 1);
      });
    }

    processUrl(0);
  }

  function isMobile() {
    return (navigator.userAgent.match(/(iPad|iPhone|iPod|Android)/g));
  }

  function isSafari() {
    var ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('safari') !== -1) {
      return ua.indexOf('chrome') === -1;
    }
    return false;
  }

  function HTMLVRViewVideoElement(id) {

    if (!window.postMessage) {
      throw 'ERROR: HTMLVRViewVideoElement requires window.postMessage';
    }

    var self = new Popcorn._MediaElementProto(),
      parent = typeof id === 'string' ? document.querySelector(id) : id,
      elem = document.createElement('div'),
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
        volume: 1,
        muted: false,
        currentTime: 0,
        duration: NaN,
        ended: false,
        paused: true,
        error: null
      },
      playerReady = false,
      mediaReady = false,
      loopedPlay = false,
      player,
      playerPaused = true,
      bufferedInterval,
      currentTimeInterval,
      timeUpdateInterval;

    // Namespace all events we'll produce
    self._eventNamespace = Popcorn.guid('HTMLVRViewVideoElement::');

    self.parentNode = parent;

    // Mark this as VRView
    self._util.type = 'VRView';

    function onPlayerReady() {

      console.log('360 Video Player ready');

      playerReady = true;

      if (isMobile()) {
        self.dispatchEvent('loadedmetadata');
        //remove loading image, thumbs and big play button so we can click actual VRView play button
        document.getElementsByClassName('loading-message')[0].style.display = 'none';
        document.getElementById('thumbnail-container').style.display = 'none';
        document.getElementById('controls-big-play-button').style.display = 'none';
        if (videoElement) {
          videoElement.style.zIndex = 99999999999;
        }
      } else {
        player.pause();
      }
      playerPaused = true;
      onReady();
    }

    function onReady() {

      var newDuration = player.getDuration();
      if (impl.duration !== newDuration) {
        impl.duration = newDuration;
        self.dispatchEvent('durationchange');
      }

      if (!isMobile()) {
        // Set initial paused state
        if (impl.autoplay || !impl.paused) {
          impl.paused = false;
          onPlay();
        }

        // Ensure video will now be unmuted when playing due to the mute on initial load.
        if (!impl.muted) {
          self.muted = false;
        }
      }

      impl.readyState = self.HAVE_METADATA;
      self.dispatchEvent('loadedmetadata');
      currentTimeInterval = setInterval(monitorCurrentTime,
        CURRENT_TIME_MONITOR_MS);

      self.dispatchEvent('loadeddata');

      impl.readyState = self.HAVE_FUTURE_DATA;
      self.dispatchEvent('canplay');

      mediaReady = true;

      // We can't easily determine canplaythrough, but will send anyway.
      impl.readyState = self.HAVE_ENOUGH_DATA;
      self.dispatchEvent('canplaythrough');
      self.pause();
    }

    function handleMouseUp() {
      if (!player.isDragging) {
        self[impl.paused ? 'play' : 'pause']();
      }
      player.isDragging = false;
    }

    function handleMouseMove() {
      player.isDragging = true;
    }

    function handleMouseDown() {
      player.isDragging = false;
    }

    function handleTouchStart(event) {
      if (player.touchEvent === undefined) {
        // we're skipping first handle of this touch event chain
        player.touchEvent = null;
      } else {
        player.touchEvent = event;
      }
    }

    function handleTouchEnd(event) {
      var originalTouch = player.touchEvent && player.touchEvent.changedTouches[0];
      var currentTouch = event.changedTouches[0];
      if (originalTouch && currentTouch
        && originalTouch.clientX === currentTouch.clientX && originalTouch.clientY === currentTouch.clientY) {
        self[impl.paused ? 'play' : 'pause']();
      }
      player.touchEvent = null;
    }

    function destroyPlayer() {
      if (!(playerReady && player)) {
        return;
      }

      onPause();
      mediaReady = false;
      loopedPlay = false;
      impl.currentTime = 0;
      player.iframe.contentDocument.removeEventListener('mousedown', handleMouseDown);
      player.iframe.contentDocument.removeEventListener('mousemove', handleMouseMove);
      player.iframe.contentDocument.removeEventListener('mouseup', handleMouseUp);
      player.iframe.contentDocument.removeEventListener('touchstart', handleTouchStart);
      player.iframe.contentDocument.removeEventListener('touchend', handleTouchEnd);
      clearInterval(currentTimeInterval);
      clearInterval(bufferedInterval);
      player.off('click');
      player.stop();
      player.off('pause');
      player.off('play');
      player.off('timeupdate');
      player.off('ended');
      player = null;
      elem = document.createElement('div');
    }

    function changeSrc(aSrc) {
      if (!self._canPlaySrc(aSrc)) {
        impl.error = {
          name: 'MediaError',
          message: 'Media Source Not Supported',
          code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        };
        self.dispatchEvent('error');
        return;
      }

      impl.src = aSrc;

      elem.style.width = '100%';
      elem.style.height = '100%';
      elem.id = Popcorn.guid('vrview_');
      parent.appendChild(elem);

      // Use any player vars passed on the URL
      var playerVars = self._util.parseUri(aSrc).queryKey;

      // Sync autoplay, but manage internally
      impl.autoplay = playerVars.autoplay === '1' || impl.autoplay;
      delete playerVars.autoplay;

      // Sync loop, but manage internally
      impl.loop = playerVars.loop === '1' || impl.loop;
      delete playerVars.loop;

      // Specify our domain as origin for iframe security
      var domain = window.location.protocol === 'file:' ? '*' :
        window.location.protocol + '//' + window.location.host;
      playerVars.origin = playerVars.origin || domain;

      // Show/hide controls. Sync with impl.controls and prefer URL value.
      playerVars.controls = playerVars.controls || impl.controls ? 2 : 0;
      impl.controls = playerVars.controls;

      if (player) {
        destroyPlayer();
      }

      // need to resolve redirects as it will fail on Safari
      resolvePlaybackUrl(decodeURIComponent(encodeURI(aSrc.split('vr360://')[1])).split('|').reverse()[0], function (err, srcUrl) {
        if (err) {
          impl.error = {
            name: 'MediaError',
            message: err.message,
            code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          };
          self.dispatchEvent('error');
          return;
        }
        player = new VRView.Player('#' + elem.id, {
          width: '100%',
          height: '100%',
          video: encodeURIComponent(srcUrl),
          is_stereo: false,
          loop: false,
          hide_fullscreen_button: true,
          //volume: 0.4,
          //muted: true,
          //is_debug: true,
          //default_heading: 90,
          //is_yaw_only: true,
          //is_vr_off: true,
        });

        player.on('ready', onPlayerReady);
        /*player.on('click', function() {
          player[impl.paused ? 'play' : 'pause']();
        });*/
        player.on('pause', onPause);
        player.on('play', onPlay);
        //player.on('timeupdate', monitorCurrentTime);
        player.on('ended', onEnded);

        player.iframe.onload = function () {
          try {
            player.iframe.contentDocument.body.addEventListener('mousedown', handleMouseDown);
            player.iframe.contentDocument.body.addEventListener('mousemove', handleMouseMove);
            player.iframe.contentDocument.body.addEventListener('mouseup', handleMouseUp);
            player.iframe.contentDocument.body.addEventListener('touchstart', handleTouchStart);
            player.iframe.contentDocument.body.addEventListener('touchend', handleTouchEnd);
          } catch (ex) {
            console.warn('Unable to link touch events to 360 Player.');
          }
        };
        setTimeout(function () {
          //initialization in Safari in that timeframe works but in other browser doesn't and vice versa
          //TODO: investigate for correct handling of this case (best is event-based)
        }, isSafari() ? 300 : 1000);
      });

      impl.networkState = self.NETWORK_LOADING;
      self.dispatchEvent('loadstart');
      self.dispatchEvent('progress');
    }

    function monitorCurrentTime() {
      var playerTime = player.currentTime;
      if (!impl.seeking) {
        if (ABS(impl.currentTime - playerTime) > CURRENT_TIME_MONITOR_MS) {
          onSeeking();
          onSeeked();
        }
        impl.currentTime = playerTime;
      } else if (ABS(playerTime - impl.currentTime) < 1) {
        onSeeked();
      }
      onTimeUpdate();
    }

    function changeCurrentTime(aTime) {
      if (aTime === impl.currentTime) {
        return;
      }

      onSeeking();
      player.setCurrentTime(aTime);
      impl.currentTime = aTime;
      onSeeked();
    }

    function onTimeUpdate() {
      self.dispatchEvent('timeupdate');
    }

    function onSeeking() {
      // we don't want to listen for this, so this state catches the event.
      impl.seeking = true;
      self.dispatchEvent('seeking');
    }

    function onSeeked() {
      impl.ended = false;
      impl.seeking = false;
      self.dispatchEvent('timeupdate');
      self.dispatchEvent('seeked');
      self.dispatchEvent('canplay');
      self.dispatchEvent('canplaythrough');
    }

    function onPlay() {
      if (!player.isRepeatingPlay) {
        player.isRepeatingPlay = true;
        self.dispatchEvent('loadedmetadata');

        if (isMobile()) {
          setTimeout(function () {
            var el = document.getElementById('controls-big-play-button');
            if (el) {
              el.click();
            }
          }, 10);
        }
      }
      if (impl.ended) {
        changeCurrentTime(0);
        impl.ended = false;
      }
      timeUpdateInterval = setInterval(onTimeUpdate,
        self._util.TIMEUPDATE_MS);
      impl.paused = false;
      if (playerPaused) {
        playerPaused = false;

        // Only 1 play when video.loop=true
        if ((impl.loop && !loopedPlay) || !impl.loop) {
          loopedPlay = true;
          self.dispatchEvent('play');
        }
        self.dispatchEvent('playing');
        if (isMobile()) {
          Popcorn.current.play();
        }
      }
    }

    self.play = function () {
      impl.paused = false;
      player.play();
    };

    function onPause() {
      impl.paused = true;
      if (!playerPaused) {
        playerPaused = true;
        clearInterval(timeUpdateInterval);
        self.dispatchEvent('pause');
        if (isMobile()) {
          Popcorn.current.pause();
        }
      }
    }

    self.pause = function () {
      impl.paused = true;
      player.pause();
    };

    function onEnded() {
      if (impl.loop) {
        changeCurrentTime(0);
        self.play();
      } else {
        impl.ended = true;
        onPause();
        self.dispatchEvent('timeupdate');
        self.dispatchEvent('ended');
      }
    }

    function setMuted(aValue) {
      impl.muted = aValue;
      player.mute(aValue);

      //self.dispatchEvent('volumechange');
    }

    function getMuted() {
      return impl.muted;
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
          return impl.volume;
        },
        set: function (aValue) {
          if (aValue < 0 || aValue > 1) {
            throw 'Volume value must be between 0.0 and 1.0';
          }
          impl.volume = aValue;
          player.setVolume(impl.volume);
          self.dispatchEvent('volumechange');
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
          var timeRanges = {
            start: function (index) {
              if (index === 0) {
                return 0;
              }

              //throw fake DOMException/INDEX_SIZE_ERR
              throw 'INDEX_SIZE_ERR: DOM Exception 1';
            },
            end: function (index) {
              if (index === 0) {
                if (!impl.duration) {
                  return 0;
                }

                return impl.duration;
              }

              //throw fake DOMException/INDEX_SIZE_ERR
              throw 'INDEX_SIZE_ERR: DOM Exception 1';
            },
            length: 1
          };

          return timeRanges;
        },
        configurable: true
      }
    });

    self._canPlaySrc = Popcorn.HTMLVRViewVideoElement._canPlaySrc;
    self.canPlayType = Popcorn.HTMLVRViewVideoElement.canPlayType;

    return self;
  }

  Popcorn.HTMLVRViewVideoElement = function (id) {
    return new HTMLVRViewVideoElement(id);
  };

  // Helper for identifying URLs we know how to play.
  Popcorn.HTMLVRViewVideoElement._canPlaySrc = function (url) {
    return (/vr360:\/\/(.)*\.(mp4|m3u8|mpd)/).test(url) ? 'probably' : EMPTY_STRING;
  };

  // We'll attempt to support a mime type of video/x-vr360
  Popcorn.HTMLVRViewVideoElement.canPlayType = function (type) {
    return 'probably';
    //return type === 'video/x-vr360' ? 'probably' : EMPTY_STRING;
  };

}(Popcorn, window, document));
