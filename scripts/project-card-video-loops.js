(() => {
  const LOOP_FALLBACK_END = 15;
  const MOBILE_PLAY_DELAY_MS = 650;
  const initializedNative = new WeakSet();
  const initializedCards = new WeakSet();
  const initializedYouTube = new WeakSet();
  const youTubePlayers = new WeakMap();
  const youTubeInitPromises = new WeakMap();
  const mobileTimers = new WeakMap();

  const isTouchMode = () => window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches;

  const numberFromDataset = (element, key, fallback) => {
    const value = Number(element.dataset[key]);
    return Number.isFinite(value) ? value : fallback;
  };

  const loopBounds = (element) => ({
    start: numberFromDataset(element, "loopStart", 0),
    end: numberFromDataset(element, "loopEnd", LOOP_FALLBACK_END),
  });

  const playNativeVideo = (video) => {
    const { start, end } = loopBounds(video);
    if (video.currentTime < start || video.currentTime >= end) video.currentTime = start;
    video.muted = true;
    video.play?.().catch?.(() => {});
  };

  const pauseNativeVideo = (video) => {
    video.pause?.();
  };

  const initNativeVideo = (video) => {
    if (initializedNative.has(video)) return;
    initializedNative.add(video);
    const { start, end } = loopBounds(video);
    video.addEventListener("loadedmetadata", () => {
      if (video.currentTime < start || video.currentTime >= end) video.currentTime = start;
    });
    video.addEventListener("timeupdate", () => {
      if (video.currentTime >= end) {
        video.currentTime = start;
        video.play?.().catch?.(() => {});
      }
    });
  };

  const loadYouTubeApi = () => {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!window.__pinwaiYouTubeApiCallbacks) window.__pinwaiYouTubeApiCallbacks = [];
    const callbacks = window.__pinwaiYouTubeApiCallbacks;
    const promise = new Promise((resolve) => callbacks.push(resolve));
    if (!window.__pinwaiYouTubeApiLoading) {
      window.__pinwaiYouTubeApiLoading = true;
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousReady === "function") previousReady();
        callbacks.splice(0).forEach((callback) => callback(window.YT));
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.append(script);
    }
    return promise;
  };

  const initYouTubeFrame = (iframe) => {
    if (initializedYouTube.has(iframe)) return youTubeInitPromises.get(iframe) || Promise.resolve();
    initializedYouTube.add(iframe);
    const promise = loadYouTubeApi().then((YT) => new Promise((resolve) => {
      const { start, end } = loopBounds(iframe);
      let intervalId;
      const player = new YT.Player(iframe, {
        events: {
          onReady: (event) => {
            const readyPlayer = event.target;
            readyPlayer.mute();
            readyPlayer.seekTo(start, true);
            youTubePlayers.set(iframe, readyPlayer);
            if (!intervalId) {
              intervalId = window.setInterval(() => {
                try {
                  if (readyPlayer.getPlayerState?.() !== YT.PlayerState.PLAYING) return;
                  if (readyPlayer.getCurrentTime() >= end) {
                    readyPlayer.seekTo(start, true);
                    readyPlayer.playVideo();
                  }
                } catch {
                  // The player can briefly disappear during hot reloads.
                }
              }, 500);
            }
            resolve(readyPlayer);
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) {
              event.target.seekTo(start, true);
              event.target.playVideo();
            }
          },
        },
      });
      youTubePlayers.set(iframe, player);
    }));
    youTubeInitPromises.set(iframe, promise);
    return promise;
  };

  const playYouTubeFrame = (iframe) => {
    const { start, end } = loopBounds(iframe);
    initYouTubeFrame(iframe).then((readyPlayer) => {
      const player = readyPlayer || youTubePlayers.get(iframe);
      if (!player) return;
      try {
        const currentTime = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : start;
        if (currentTime < start || currentTime >= end) player.seekTo(start, true);
        player.mute?.();
        player.playVideo?.();
      } catch {
        // YouTube may not be ready yet; onReady will retry.
      }
    });
  };

  const pauseYouTubeFrame = (iframe) => {
    const player = youTubePlayers.get(iframe);
    if (!player) return;
    try {
      player.pauseVideo?.();
    } catch {
      // Ignore cross-frame readiness races.
    }
  };

  const mediaForCard = (card) => ({
    nativeVideo: card.querySelector("[data-autoplay-loop-video]"),
    youTubeFrame: card.querySelector("[data-youtube-loop-frame]"),
  });

  const playCard = (card) => {
    const { nativeVideo, youTubeFrame } = mediaForCard(card);
    card.classList.add("project-card--loop-playing");
    if (nativeVideo) playNativeVideo(nativeVideo);
    if (youTubeFrame) playYouTubeFrame(youTubeFrame);
  };

  const pauseCard = (card) => {
    const timer = mobileTimers.get(card);
    if (timer) window.clearTimeout(timer);
    mobileTimers.delete(card);
    card.classList.remove("project-card--loop-playing");
    const { nativeVideo, youTubeFrame } = mediaForCard(card);
    if (nativeVideo) pauseNativeVideo(nativeVideo);
    if (youTubeFrame) pauseYouTubeFrame(youTubeFrame);
  };

  const queueMobilePlay = (card) => {
    if (mobileTimers.has(card)) return;
    const timer = window.setTimeout(() => {
      mobileTimers.delete(card);
      playCard(card);
    }, MOBILE_PLAY_DELAY_MS);
    mobileTimers.set(card, timer);
  };

  const initCard = (card) => {
    if (initializedCards.has(card)) return;
    initializedCards.add(card);
    const { nativeVideo, youTubeFrame } = mediaForCard(card);
    if (nativeVideo) initNativeVideo(nativeVideo);
    if (youTubeFrame) initYouTubeFrame(youTubeFrame);
    card.addEventListener("pointerenter", () => {
      if (!isTouchMode()) playCard(card);
    });
    card.addEventListener("pointerleave", () => {
      if (!isTouchMode()) pauseCard(card);
    });
    card.addEventListener("focusin", () => {
      if (!isTouchMode()) playCard(card);
    });
    card.addEventListener("focusout", () => {
      if (!isTouchMode()) pauseCard(card);
    });
  };

  const initLoops = () => {
    const cards = Array.from(document.querySelectorAll("[data-project-card]")).filter(
      (card) => card.querySelector("[data-autoplay-loop-video], [data-youtube-loop-frame]"),
    );
    cards.forEach(initCard);

    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!isTouchMode()) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting) queueMobilePlay(entry.target);
          else pauseCard(entry.target);
        });
      },
      { threshold: 0.62 },
    );
    cards.forEach((card) => observer.observe(card));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoops, { once: true });
  } else {
    initLoops();
  }
})();
