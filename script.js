(function () {
  'use strict';

  // ====== DOM ======
  const viewport = document.getElementById('viewport');
  const world = document.getElementById('world');
  const themeToggle = document.querySelector('.theme-toggle'); // not present in new design, keep for fallback
  const presenterBtn = document.getElementById('presenterBtn');
  const presBar = document.getElementById('presBar');
  const presRewind = document.getElementById('presRewind');
  const presFastFwd = document.getElementById('presFastFwd');
  const menuBtn = document.getElementById('menuBtn');
  const sideMenu = document.getElementById('sideMenu');
  const menuOverlay = document.getElementById('menuOverlay');
  const menuClose = document.getElementById('menuClose');
  const loadingScreen = document.getElementById('loadingScreen');
  const loadingTextEl = document.getElementById('loadingText');

  // ====== LOADING ======
  const loadingMessages = [
    'Obsessing over kerning...',
    'Stretching the canvas...',
    'Aligning pixels...',
    'Brewing design coffee...',
    'Polishing interactions...',
    'Perfecting gradients...',
    'Rendering particles...',
    'Calibrating bezier curves...'
  ];

  let loadingMsgIndex = 0;
  loadingTextEl.textContent = loadingMessages[loadingMsgIndex];
  const loadingInterval = setInterval(() => {
    loadingMsgIndex = (loadingMsgIndex + 1) % loadingMessages.length;
    loadingTextEl.style.opacity = '0';
    setTimeout(() => {
      loadingTextEl.textContent = loadingMessages[loadingMsgIndex];
      loadingTextEl.style.opacity = '1';
    }, 200);
  }, 1500);

  // ====== SLIDE LAYOUT ======
  const SLIDE_W = 640;
  const SLIDE_H = 360;
  const GAP = 40;
  const CANVAS_PAD = 200;

  // Position slides on the grid based on data-row / data-col
  const slides = Array.from(document.querySelectorAll('.slide'));
  const slideOrder = slides
    .filter(s => s.dataset.slide !== undefined)
    .sort((a, b) => parseInt(a.dataset.slide) - parseInt(b.dataset.slide));

  let maxRow = 0;
  let maxCol = 0;

  slides.forEach(slide => {
    const row = parseInt(slide.dataset.row) || 0;
    const col = parseInt(slide.dataset.col) || 0;
    const x = CANVAS_PAD + col * (SLIDE_W + GAP);
    const y = CANVAS_PAD + row * (SLIDE_H + GAP);
    slide.style.left = x + 'px';
    slide.style.top = y + 'px';
    slide.style.width = SLIDE_W + 'px';
    slide.style.height = SLIDE_H + 'px';
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  });

  // ====== STATE ======
  let panX = 0;
  let panY = 0;
  let scale = 0.65;
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;
  let hasMoved = false;

  // Presentation
  let presenting = false;
  let presPlaying = false;
  let currentSlide = 0;
  const totalSlides = slideOrder.length;
  const SLIDE_DURATION = 4000; // ms per slide
  let presInterval = null;

  // Canvas-mode slide navigation
  let navSlideIndex = 0;
  let isAnimating = false;

  const ZOOM_MIN = 0.08;
  const ZOOM_MAX = 2;

  // ====== INIT ======
  function init() {
    // Handle hash anchor
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const targetSlide = document.getElementById(hash);
      if (targetSlide) {
        centerOnSlide(targetSlide, false);
      } else {
        fitAll(false);
      }
      applyTransform();
      // Hide loading
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        clearInterval(loadingInterval);
      }, 1500);
    } else {
      // Start with full grid overview, then slowly zoom into hero
      fitAll(false);
      applyTransform();

      // Hide loading, then begin zoom-in animation
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        clearInterval(loadingInterval);

        // After a brief pause showing the grid, slowly zoom into hero
        setTimeout(() => {
          const vw = viewport.clientWidth;
          const vh = viewport.clientHeight;
          const sl = parseFloat(slideOrder[0].style.left);
          const st = parseFloat(slideOrder[0].style.top);
          const scX = (vw * 0.75) / SLIDE_W;
          const scY = (vh * 0.75) / SLIDE_H;
          const endScale = Math.min(scX, scY, 1.5);
          const endPanX = (vw / 2) - (sl + SLIDE_W / 2) * endScale;
          const endPanY = (vh / 2) - (st + SLIDE_H / 2) * endScale;

          gsap.to({ s: scale, px: panX, py: panY }, {
            s: endScale, px: endPanX, py: endPanY,
            duration: 2.5,
            ease: 'power2.inOut',
            onUpdate: function () {
              scale = this.targets()[0].s;
              panX = this.targets()[0].px;
              panY = this.targets()[0].py;
              applyTransform();
            }
          });
        }, 800);
      }, 2500);
    }
  }

  // ====== TRANSFORM ======
  function applyTransform() {
    world.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function animateTransform(cb) {
    world.classList.add('animating');
    applyTransform();
    const onEnd = () => {
      world.classList.remove('animating');
      world.removeEventListener('transitionend', onEnd);
      if (cb) cb();
    };
    world.addEventListener('transitionend', onEnd);
  }

  // ====== PAN ======
  viewport.addEventListener('mousedown', (e) => {
    if (presenting) return;
    if (e.target.closest('a, button')) return;
    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    viewport.classList.add('grabbing');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
    panX = panStartX + dx;
    panY = panStartY + dy;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      viewport.classList.remove('grabbing');
    }
  });

  // ====== TOUCH (mobile: 1-finger drag, 2-finger pinch-to-zoom) ======
  let touchId = null;
  let lastTouchDist = 0;
  let lastTouchMidX = 0;
  let lastTouchMidY = 0;
  let touchMode = 'none'; // 'drag' | 'pinch' | 'none'

  viewport.addEventListener('touchstart', (e) => {
    if (presenting) return;
    if (e.touches.length === 1) {
      touchMode = 'drag';
      isDragging = true;
      hasMoved = false;
      touchId = e.touches[0].identifier;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      panStartX = panX;
      panStartY = panY;
    } else if (e.touches.length === 2) {
      // Switch to pinch mode
      touchMode = 'pinch';
      isDragging = false;
      const t0 = e.touches[0], t1 = e.touches[1];
      lastTouchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      lastTouchMidX = (t0.clientX + t1.clientX) / 2;
      lastTouchMidY = (t0.clientY + t1.clientY) / 2;
      e.preventDefault();
    }
  }, { passive: false });

  viewport.addEventListener('touchmove', (e) => {
    if (presenting) return;

    if (touchMode === 'drag' && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartX;
      const dy = touch.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      panX = panStartX + dx;
      panY = panStartY + dy;
      applyTransform();
    } else if (touchMode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;

      // Zoom toward pinch center
      const zoomFactor = dist / lastTouchDist;
      const rect = viewport.getBoundingClientRect();
      const mx = midX - rect.left;
      const my = midY - rect.top;
      const wx = (mx - panX) / scale;
      const wy = (my - panY) / scale;

      scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale * zoomFactor));
      panX = mx - wx * scale;
      panY = my - wy * scale;

      // Also pan with two-finger drag
      panX += midX - lastTouchMidX;
      panY += midY - lastTouchMidY;

      lastTouchDist = dist;
      lastTouchMidX = midX;
      lastTouchMidY = midY;
      applyTransform();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      isDragging = false;
      touchMode = 'none';
    } else if (e.touches.length === 1) {
      // Went from pinch to single finger — restart drag
      touchMode = 'drag';
      isDragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      panStartX = panX;
      panStartY = panY;
    }
  }, { passive: true });

  // ====== WHEEL: Ctrl/Cmd+scroll = zoom, plain scroll = pan (Figma-style) ======
  viewport.addEventListener('wheel', (e) => {
    if (presenting) return;
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Pinch-to-zoom on trackpad sends ctrlKey + deltaY
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const zoomIntensity = 0.01;
      const factor = 1 - e.deltaY * zoomIntensity;
      const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale * factor));
      const wx = (mx - panX) / scale;
      const wy = (my - panY) / scale;
      scale = newScale;
      panX = mx - wx * scale;
      panY = my - wy * scale;
    } else {
      // Plain scroll = pan
      panX -= e.deltaX;
      panY -= e.deltaY;
    }

    applyTransform();
  }, { passive: false });

  // ====== DOUBLE CLICK ======
  viewport.addEventListener('dblclick', (e) => {
    if (presenting) return;
    const slide = e.target.closest('.slide');
    if (slide) {
      // Sync navSlideIndex
      const idx = slideOrder.indexOf(slide);
      if (idx !== -1) navSlideIndex = idx;
      cinematicNavigate(slide, 1200);
      updateNavButtons();
      if (slide.id) {
        history.replaceState(null, '', '#' + slide.id);
      }
    }
  });

  // ====== CENTER / FIT ======
  function centerOnSlide(slide, animate) {
    if (!slide) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const sl = parseFloat(slide.style.left);
    const st = parseFloat(slide.style.top);
    const sw = SLIDE_W;
    const sh = SLIDE_H;
    // Zoom closer when presenting
    const pad = presenting ? 0.88 : 0.75;
    const maxZoom = presenting ? 2.2 : 1.5;
    const scX = (vw * pad) / sw;
    const scY = (vh * pad) / sh;
    scale = Math.min(scX, scY, maxZoom);
    panX = (vw / 2) - (sl + sw / 2) * scale;
    panY = (vh / 2) - (st + sh / 2) * scale;
    if (animate) animateTransform(); else applyTransform();
  }

  const isMobile = window.innerWidth <= 768;

  function fitAll(animate) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    slides.forEach(s => {
      const l = parseFloat(s.style.left);
      const t = parseFloat(s.style.top);
      minX = Math.min(minX, l);
      minY = Math.min(minY, t);
      maxX = Math.max(maxX, l + SLIDE_W);
      maxY = Math.max(maxY, t + SLIDE_H);
    });
    const cw = maxX - minX;
    const ch = maxY - minY;
    const pad = isMobile ? 40 : 120;
    const scX = (vw - pad * 2) / cw;
    const scY = (vh - pad * 2) / ch;
    // On mobile, don't zoom out below 0.12 so slides stay readable
    const minScale = isMobile ? 0.12 : 0.05;
    scale = Math.max(minScale, Math.min(scX, scY, 1));
    panX = (vw / 2) - ((minX + maxX) / 2) * scale;
    panY = (vh / 2) - ((minY + maxY) / 2) * scale;
    if (animate) animateTransform(); else applyTransform();
  }

  // ====== CINEMATIC SLIDE TRANSITION (GSAP + wave) ======
  // 3-phase: zoom-out → wave pan → zoom-in
  let activeTween = null;

  function cinematicNavigate(targetSlide, duration, cb) {
    if (!targetSlide) return;
    // Kill any running transition
    if (activeTween) { activeTween.kill(); activeTween = null; }
    isAnimating = true;
    duration = (duration || 1200) / 1000; // GSAP uses seconds

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    // Current focus point in world coords
    const startFocusX = (vw / 2 - panX) / scale;
    const startFocusY = (vh / 2 - panY) / scale;
    const startScale = scale;

    // Target focus point (center of target slide)
    const targetFocusX = parseFloat(targetSlide.style.left) + SLIDE_W / 2;
    const targetFocusY = parseFloat(targetSlide.style.top) + SLIDE_H / 2;

    // Target scale
    const pad = presenting ? 0.88 : 0.75;
    const maxZoom = presenting ? 2.2 : 1.5;
    const scX = (vw * pad) / SLIDE_W;
    const scY = (vh * pad) / SLIDE_H;
    const targetScale = Math.min(scX, scY, maxZoom);

    // Zoom-out depth based on distance
    const dx = targetFocusX - startFocusX;
    const dy = targetFocusY - startFocusY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const zoomOutFactor = Math.min(0.5, 0.25 + dist / 4000);
    const midScale = Math.min(startScale, targetScale) * (1 - zoomOutFactor);

    // Wave amplitude — vertical swoop in pixels, scales with distance
    const waveAmp = Math.min(80, 25 + dist * 0.03);

    // Animate a progress proxy from 0 → 1
    const proxy = { p: 0 };

    activeTween = gsap.to(proxy, {
      p: 1,
      duration: duration,
      ease: 'power2.inOut',
      onUpdate: function () {
        const t = proxy.p;

        // Focus interpolation with GSAP easing already applied via proxy
        const focusX = startFocusX + (targetFocusX - startFocusX) * t;
        const focusY = startFocusY + (targetFocusY - startFocusY) * t;

        // Scale valley: zoom out at midpoint, zoom in at ends
        const sinT = Math.sin(t * Math.PI); // 0 → 1 → 0
        const baseScale = startScale + (targetScale - startScale) * t;
        scale = baseScale - (baseScale - midScale) * sinT;

        // Wave: vertical swoop — dips down at midpoint then returns
        const waveOffset = sinT * waveAmp;

        // Derive pan from focus + scale + wave offset
        panX = vw / 2 - focusX * scale;
        panY = vh / 2 - focusY * scale + waveOffset;

        applyTransform();
      },
      onComplete: function () {
        // Snap to exact final values
        scale = targetScale;
        panX = (vw / 2) - targetFocusX * targetScale;
        panY = (vh / 2) - targetFocusY * targetScale;
        applyTransform();
        isAnimating = false;
        activeTween = null;
        if (cb) cb();
      }
    });
  }

  // ====== NAV PAD (slide navigation) ======
  const navPrevBtn = document.getElementById('navPrev');
  const navNextBtn = document.getElementById('navNext');

  function updateNavButtons() {
    if (navPrevBtn) navPrevBtn.disabled = navSlideIndex <= 0;
    if (navNextBtn) navNextBtn.disabled = navSlideIndex >= totalSlides - 1;
  }

  function navigateSlide(direction) {
    if (presenting || isAnimating) return;
    const newIndex = navSlideIndex + direction;
    if (newIndex < 0 || newIndex >= totalSlides) return;
    navSlideIndex = newIndex;
    const target = slideOrder[navSlideIndex];
    cinematicNavigate(target, 1200);
    if (target.id) history.replaceState(null, '', '#' + target.id);
    updateNavButtons();
  }

  if (navPrevBtn) navPrevBtn.addEventListener('click', () => navigateSlide(-1));
  if (navNextBtn) navNextBtn.addEventListener('click', () => navigateSlide(1));

  updateNavButtons();

  // ====== SIDE MENU ======
  function openMenu() { sideMenu.classList.add('open'); }
  function closeMenu() { sideMenu.classList.remove('open'); }

  menuBtn.addEventListener('click', openMenu);
  menuClose.addEventListener('click', closeMenu);
  menuOverlay.addEventListener('click', closeMenu);

  // Menu navigation links
  document.querySelectorAll('[data-goto]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.goto);
      if (target) {
        closeMenu();
        const idx = slideOrder.indexOf(target);
        if (idx !== -1) navSlideIndex = idx;
        cinematicNavigate(target, 1200);
        updateNavButtons();
        history.replaceState(null, '', '#' + link.dataset.goto);
      }
    });
  });

  // ====== PRESENTATION MODE (manual, no autoplay) ======
  const presCounter = document.getElementById('presCounter');
  const presExitBtn = document.getElementById('presExit');

  function enterPresentation() {
    presenting = true;
    currentSlide = 0;
    document.body.classList.add('presenting');
    viewport.classList.add('presenting');
    presBar.classList.add('active');

    slideOrder.forEach(s => s.classList.remove('spotlight'));
    slideOrder[0].classList.add('spotlight');
    centerOnSlide(slideOrder[0], true);
    updatePresUI();
  }

  function exitPresentation() {
    const lastSlide = currentSlide;
    presenting = false;
    document.body.classList.remove('presenting');
    viewport.classList.remove('presenting');
    presBar.classList.remove('active');
    slideOrder.forEach(s => s.classList.remove('spotlight'));
    navSlideIndex = lastSlide;

    // GSAP smooth zoom from presentation level to canvas level
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const sl = parseFloat(slideOrder[lastSlide].style.left);
    const st = parseFloat(slideOrder[lastSlide].style.top);
    const scX = (vw * 0.75) / SLIDE_W;
    const scY = (vh * 0.75) / SLIDE_H;
    const endScale = Math.min(scX, scY, 1.5);
    const endPanX = (vw / 2) - (sl + SLIDE_W / 2) * endScale;
    const endPanY = (vh / 2) - (st + SLIDE_H / 2) * endScale;

    gsap.to({ s: scale, px: panX, py: panY }, {
      s: endScale, px: endPanX, py: endPanY,
      duration: 0.8,
      ease: 'power2.inOut',
      onUpdate: function () {
        scale = this.targets()[0].s;
        panX = this.targets()[0].px;
        panY = this.targets()[0].py;
        applyTransform();
      }
    });

    updateNavButtons();
  }

  function goToPresSlide(index, animate) {
    if (index < 0 || index >= totalSlides || isAnimating) return;
    currentSlide = index;
    slideOrder.forEach(s => s.classList.remove('spotlight'));
    slideOrder[currentSlide].classList.add('spotlight');
    if (animate) {
      cinematicNavigate(slideOrder[currentSlide], 1200);
    } else {
      centerOnSlide(slideOrder[currentSlide], false);
    }
    updatePresUI();
    const id = slideOrder[currentSlide].id;
    if (id) history.replaceState(null, '', '#' + id);
  }

  function updatePresUI() {
    presCounter.textContent = `${currentSlide + 1} / ${totalSlides}`;
    presRewind.disabled = currentSlide <= 0;
    presFastFwd.disabled = currentSlide >= totalSlides - 1;
  }

  presenterBtn.addEventListener('click', enterPresentation);
  presExitBtn.addEventListener('click', exitPresentation);

  presRewind.addEventListener('click', () => goToPresSlide(currentSlide - 1, true));
  presFastFwd.addEventListener('click', () => goToPresSlide(currentSlide + 1, true));

  // ====== KEYBOARD ======
  document.addEventListener('keydown', (e) => {
    if (presenting) {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault();
          goToPresSlide(currentSlide + 1, true);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goToPresSlide(currentSlide - 1, true);
          break;
        case 'Escape':
          exitPresentation();
          break;
      }
    } else {
      if (e.key === '0') fitAll(true);
      if (e.key === 'ArrowRight') { e.preventDefault(); navigateSlide(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigateSlide(-1); }
    }
  });

  // ====== HASH CHANGE ======
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    const target = document.getElementById(hash);
    if (target && !presenting) {
      const idx = slideOrder.indexOf(target);
      if (idx !== -1) navSlideIndex = idx;
      cinematicNavigate(target, 1200);
      updateNavButtons();
    }
  });

  // (Direction pad replaced by nav-pad slide navigation above)

  // ====== ZOOM BUTTONS ======
  document.getElementById('zoomInBtn').addEventListener('click', () => {
    scale = Math.min(ZOOM_MAX, scale * 1.25);
    animateTransform();
  });
  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    scale = Math.max(ZOOM_MIN, scale * 0.75);
    animateTransform();
  });

  // ====== INIT ======
  init();

})();
