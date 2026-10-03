(function () {
  var artwork = new Image();
  var ready = new Promise(function (resolve, reject) {
    artwork.onload = resolve;
    artwork.onerror = reject;
  });
  artwork.src = '/mewallet-loading-v1.png';

  function draw(canvas) {
    var active = true;
    function paint() {
      if (!active) return;
      if (!canvas.isConnected) {
        active = false;
        observer.disconnect();
        window.removeEventListener('resize', paint);
        return;
      }
      if (!artwork.complete || !artwork.naturalWidth) return;
      var box = canvas.getBoundingClientRect();
      var ratio = window.devicePixelRatio || 1;
      var width = Math.max(1, Math.round(box.width * ratio));
      var height = Math.max(1, Math.round(box.height * ratio));
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      // Copy the original pixels, including the eyes, mouth and transparent gaps.
      context.drawImage(artwork, 0, 0, width, height);
      context.globalCompositeOperation = 'source-in';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
      canvas.dataset.painted = 'true';
    }
    var observer = new ResizeObserver(paint);
    observer.observe(canvas);
    window.addEventListener('resize', paint);
    ready.then(paint).catch(function () { /* Keep the CSS mask fallback. */ });
    paint();
    return function () {
      active = false;
      observer.disconnect();
      window.removeEventListener('resize', paint);
    };
  }
  window.MewalletLoadingArtwork = { draw: draw };
  document.querySelectorAll('canvas.app-loading-glyph').forEach(draw);
})();
