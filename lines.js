(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const COLORS = ['#FF6B35', '#F7C948', '#E8453C', '#FFB347', '#FF8C5A'];
  const SPLASH_DURATION = 35;
  const LINE_WIDTH = 2;

  let lines = [];
  let splashes = [];
  let W, H;

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Catmull-Rom spline interpolation ──
  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  // Sample a smooth spline path through control points
  function sampleSpline(controlPoints, samplesPerSeg) {
    const pts = controlPoints;
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[Math.min(i + 1, pts.length - 1)];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let s = 0; s < samplesPerSeg; s++) {
        out.push(catmullRom(p0, p1, p2, p3, s / samplesPerSeg));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Generate gently squiggly control points from startY to (endX, endY)
  function makeControlPoints(startY, endX, endY) {
    const count = 5 + Math.floor(Math.random() * 3); // 5-7 control points
    const points = [{ x: -30, y: startY }];
    for (let i = 1; i < count - 1; i++) {
      const t = i / (count - 1);
      // Ease toward merge point
      const baseX = t * (endX + 30) - 30;
      const baseY = startY + (endY - startY) * t;
      // Gentle wiggle — subtle at start, vanishes near merge
      const wiggle = (1 - t) * (1 - t) * H * 0.08;
      points.push({
        x: baseX + (Math.random() - 0.5) * W * 0.06,
        y: baseY + (Math.random() - 0.5) * wiggle,
      });
    }
    points.push({ x: endX, y: endY });
    return points;
  }

  // ── Spawn a single line heading to a merge point ──
  // speed is passed in so all lines in a cluster share it
  function spawnLine(mergeX, mergeY, speed) {
    const startY = Math.random() * H;
    const controlPoints = makeControlPoints(startY, mergeX, mergeY);
    const path = sampleSpline(controlPoints, 12);

    return {
      path,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      progress: 0,
      speed,
      mergeX,
      mergeY,
      alpha: 0.5,
      done: false,
    };
  }

  // Track merge points to know when to splash
  let mergePoints = [];

  function spawnClusterTracked() {
    const mergeX = W * (0.2 + Math.random() * 0.65);
    const mergeY = H * (0.1 + Math.random() * 0.8);
    const count = 2 + Math.floor(Math.random() * 3);
    // All lines in a cluster share the same speed so they arrive together
    const clusterSpeed = 0.0012 + Math.random() * 0.001;
    const mp = { mergeX, mergeY, count, arrived: 0, splashed: false };
    mergePoints.push(mp);

    for (let i = 0; i < count; i++) {
      // Tight stagger (100-250ms) so they start close together
      setTimeout(() => {
        const line = spawnLine(mergeX, mergeY, clusterSpeed);
        line.mergePoint = mp;
        lines.push(line);
      }, i * (100 + Math.random() * 150));
    }
  }

  // ── Pulse effect ──
  function drawSplash(splash) {
    const t = splash.frame / SPLASH_DURATION;
    if (t >= 1) return;

    const { x, y, colors } = splash;
    const alpha = (1 - t) * (1 - t);

    // Expanding ring
    const radius = 4 + t * 70;
    const ringWidth = Math.max(1, (1 - t) * 3);

    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = ringWidth;
    ctx.stroke();
    ctx.restore();

    // Second ring, slightly delayed and different color
    if (t > 0.1) {
      const t2 = (t - 0.1) / 0.9;
      const alpha2 = (1 - t2) * (1 - t2);
      const radius2 = 4 + t2 * 50;
      const ringWidth2 = Math.max(1, (1 - t2) * 2);

      ctx.save();
      ctx.globalAlpha = alpha2 * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, radius2, 0, Math.PI * 2);
      ctx.strokeStyle = colors[1 % colors.length];
      ctx.lineWidth = ringWidth2;
      ctx.stroke();
      ctx.restore();
    }

    // Central dot that shrinks
    const dotSize = (1 - t) * 5;
    if (dotSize > 0.5) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = colors[0];
      ctx.fill();
      ctx.restore();
    }
  }

  function createSplash(x, y, colors) {
    splashes.push({ x, y, colors, frame: 0 });
  }

  // ── Draw a spline path up to progress ──
  function drawLine(line) {
    const { path, progress, alpha, color } = line;
    if (alpha <= 0 || progress <= 0) return;

    const drawUpTo = Math.floor(progress * (path.length - 1));
    if (drawUpTo < 1) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i <= drawUpTo; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    // Fractional segment
    const frac = (progress * (path.length - 1)) - drawUpTo;
    if (drawUpTo < path.length - 1) {
      const a = path[drawUpTo];
      const b = path[drawUpTo + 1];
      ctx.lineTo(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Update loop ──
  function update() {
    // Update lines
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];

      if (!line.done) {
        line.progress = Math.min(line.progress + line.speed, 1);

        if (line.progress >= 1) {
          line.done = true;
          // Notify merge point
          if (line.mergePoint) {
            line.mergePoint.arrived++;
            // Splash when all lines in cluster have arrived
            if (line.mergePoint.arrived >= line.mergePoint.count && !line.mergePoint.splashed) {
              line.mergePoint.splashed = true;
              // Collect colors of lines in this cluster
              const clusterColors = lines
                .filter(l => l.mergePoint === line.mergePoint)
                .map(l => l.color);
              createSplash(line.mergeX, line.mergeY, clusterColors);
              // Start fading all lines in this cluster
              lines.filter(l => l.mergePoint === line.mergePoint).forEach(l => {
                l.fading = true;
              });
            }
          }
        }
      }

      // Fade out after splash
      if (line.fading) {
        line.alpha -= 0.015;
        if (line.alpha <= 0) {
          lines.splice(i, 1);
        }
      }
    }

    // Update splashes
    for (let i = splashes.length - 1; i >= 0; i--) {
      splashes[i].frame++;
      if (splashes[i].frame >= SPLASH_DURATION) {
        splashes.splice(i, 1);
      }
    }

    // Clean up finished merge points
    for (let i = mergePoints.length - 1; i >= 0; i--) {
      if (mergePoints[i].splashed) {
        const mp = mergePoints[i];
        const hasLines = lines.some(l => l.mergePoint === mp);
        if (!hasLines) mergePoints.splice(i, 1);
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const line of lines) drawLine(line);
    for (const splash of splashes) drawSplash(splash);
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // ── Spawning schedule ──
  // Stagger multiple clusters at different intervals for organic feel
  function scheduleSpawns() {
    spawnClusterTracked();

    // Spawn new clusters at varied intervals
    function nextSpawn() {
      const delay = 1800 + Math.random() * 2500; // 1.8-4.3s
      setTimeout(() => {
        if (document.visibilityState !== 'hidden') {
          spawnClusterTracked();
        }
        nextSpawn();
      }, delay);
    }

    // Start a second cluster quickly so the screen isn't empty
    setTimeout(() => spawnClusterTracked(), 800);
    setTimeout(() => spawnClusterTracked(), 1600);

    nextSpawn();
  }

  scheduleSpawns();
  loop();
})();
