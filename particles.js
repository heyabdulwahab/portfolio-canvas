// ====== 3D PARTICLE SPHERE → TEXT MORPH ANIMATION ======
(function () {
  'use strict';

  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Use the fixed slide dimensions (not the scaled/transformed ones)
  let W = 420;
  let H = 280;
  const PARTICLE_COUNT = 500;
  const particles = [];
  let phase = 'sphere';
  let phaseTimer = 0;
  const PHASE_DURATION = {
    'sphere': 3000,
    'scatter': 600,
    'text-1': 2500,
    'text-2': 2500,
    'text-3': 2500,
    'gather': 1000,
  };
  const TEXTS = ['BEAUTIFUL', 'UI + UX', 'DESIGN'];
  let animFrame;

  function resize() {
    // The slide has a fixed size set by CSS --slide-w / --slide-h
    // Use those values directly since the parent is transformed/scaled
    const style = getComputedStyle(document.documentElement);
    W = parseInt(style.getPropertyValue('--slide-w')) || 420;
    H = parseInt(style.getPropertyValue('--slide-h')) || 280;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ====== PARTICLE ======
  class Particle {
    constructor(i) {
      this.i = i;
      // Start in sphere formation
      const phi = Math.acos(-1 + (2 * i) / PARTICLE_COUNT);
      const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi;
      const r = Math.min(W, H) * 0.35;
      this.sphereX = W / 2 + r * Math.cos(theta) * Math.sin(phi);
      this.sphereY = H / 2 + r * Math.sin(theta) * Math.sin(phi);
      this.sphereZ = r * Math.cos(phi);
      this.x = this.sphereX;
      this.y = this.sphereY;
      this.z = this.sphereZ;
      this.targetX = this.x;
      this.targetY = this.y;
      this.targetZ = 0;
      this.vx = 0;
      this.vy = 0;
      this.size = 1.2 + Math.random() * 1.2;
      this.baseAlpha = 0.4 + Math.random() * 0.6;
    }

    update(dt, speed) {
      const ease = (speed || 0.06) + Math.random() * 0.02;
      this.x += (this.targetX - this.x) * ease;
      this.y += (this.targetY - this.y) * ease;
      this.z += (this.targetZ - this.z) * ease;
    }

    draw() {
      // 3D projection
      const perspective = 600;
      const scale = perspective / (perspective + this.z);
      const px = W / 2 + (this.x - W / 2) * scale;
      const py = H / 2 + (this.y - H / 2) * scale;
      const sz = this.size * scale;
      const alpha = this.baseAlpha * Math.max(0.2, scale);

      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
  }

  // ====== TEXT TO POINTS ======
  function textToPoints(text, fontSize) {
    const offscreen = document.createElement('canvas');
    const offCtx = offscreen.getContext('2d');
    offscreen.width = W;
    offscreen.height = H;
    offCtx.fillStyle = '#fff';
    offCtx.font = `bold ${fontSize}px "Space Grotesk", sans-serif`;
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.fillText(text, W / 2, H / 2);

    const imageData = offCtx.getImageData(0, 0, W, H);
    const points = [];
    const step = 5; // Sample density

    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const idx = (y * W + x) * 4;
        if (imageData.data[idx + 3] > 128) {
          points.push({ x: x + (Math.random() - 0.5) * 2, y: y + (Math.random() - 0.5) * 2 });
        }
      }
    }
    return points;
  }

  // ====== SPHERE POSITIONS (with rotation) ======
  let sphereAngle = 0;

  function updateSphereTargets() {
    sphereAngle += 0.003;
    const r = Math.min(W, H) * 0.28;
    const cosA = Math.cos(sphereAngle);
    const sinA = Math.sin(sphereAngle);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const phi = Math.acos(-1 + (2 * i) / PARTICLE_COUNT);
      const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi + sphereAngle * 2;

      // 3D sphere coordinates
      let sx = r * Math.cos(theta) * Math.sin(phi);
      let sy = r * Math.sin(theta) * Math.sin(phi);
      let sz = r * Math.cos(phi);

      // Rotate around Y axis
      const rx = sx * cosA - sz * sinA;
      const rz = sx * sinA + sz * cosA;

      particles[i].targetX = W / 2 + rx;
      particles[i].targetY = H / 2 + sy;
      particles[i].targetZ = rz;
    }
  }

  // ====== SCATTER ======
  function setScatterTargets() {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * Math.max(W, H) * 0.6;
      particles[i].targetX = W / 2 + Math.cos(angle) * dist;
      particles[i].targetY = H / 2 + Math.sin(angle) * dist;
      particles[i].targetZ = (Math.random() - 0.5) * 200;
    }
  }

  // ====== TEXT TARGETS ======
  function setTextTargets(text) {
    const fontSize = Math.min(W * 0.16, 64);
    const points = textToPoints(text, fontSize);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (points.length > 0) {
        const pt = points[i % points.length];
        particles[i].targetX = pt.x + (Math.random() - 0.5) * 3;
        particles[i].targetY = pt.y + (Math.random() - 0.5) * 3;
        particles[i].targetZ = (Math.random() - 0.5) * 30;
      } else {
        particles[i].targetX = W / 2 + (Math.random() - 0.5) * 100;
        particles[i].targetY = H / 2 + (Math.random() - 0.5) * 100;
        particles[i].targetZ = 0;
      }
    }
  }

  // ====== PHASE MACHINE ======
  const phaseSequence = ['sphere', 'scatter', 'text-1', 'scatter', 'text-2', 'scatter', 'text-3', 'gather'];
  let phaseIndex = 0;

  function nextPhase() {
    phaseIndex = (phaseIndex + 1) % phaseSequence.length;
    phase = phaseSequence[phaseIndex];
    phaseTimer = 0;

    switch (phase) {
      case 'sphere':
      case 'gather':
        // targets set in update loop
        break;
      case 'scatter':
        setScatterTargets();
        break;
      case 'text-1':
        setTextTargets(TEXTS[0]);
        break;
      case 'text-2':
        setTextTargets(TEXTS[1]);
        break;
      case 'text-3':
        setTextTargets(TEXTS[2]);
        break;
    }
  }

  // ====== MAIN LOOP ======
  let lastTime = 0;

  function animate(time) {
    const dt = Math.min(time - lastTime, 50);
    lastTime = time;
    phaseTimer += dt;

    ctx.clearRect(0, 0, W, H);

    // Phase transitions
    const currentPhaseName = phaseSequence[phaseIndex];
    const dur = PHASE_DURATION[currentPhaseName] || 2000;
    if (phaseTimer > dur) {
      nextPhase();
    }

    // Update sphere rotation if in sphere/gather phase
    if (phase === 'sphere' || phase === 'gather') {
      updateSphereTargets();
    }

    // Speed up for text/scatter phases
    const isText = phase.startsWith('text-');
    const isScatter = phase === 'scatter';
    const speed = isText ? 0.12 : isScatter ? 0.08 : 0.05;

    // Update and draw particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles[i].update(dt, speed);
      particles[i].draw();
    }

    animFrame = requestAnimationFrame(animate);
  }

  // ====== INIT ======
  function init() {
    resize();

    // Create particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle(i));
    }

    // Start with sphere
    updateSphereTargets();
    lastTime = performance.now();
    animFrame = requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    resize();
    // Recalculate sphere positions
    if (phase === 'sphere' || phase === 'gather') {
      updateSphereTargets();
    }
  });

  // Wait for fonts to load
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(init);
  } else {
    setTimeout(init, 500);
  }

})();
