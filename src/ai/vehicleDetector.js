import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export class VehicleDetector {
  constructor(app) {
    this.app = app;
    this.model = null;
    this.isLoadingModel = false;
    this.isModelReady = false;

    // Elements
    this.modal = null;
    this.videoEl = null;
    this.overlayCanvas = null;
    this.ctx = null;
    this.fileInput = null;

    // Detection State
    this.isRunning = false;
    this.animationFrameId = null;
    this.currentSource = 'live3d'; // 'file' | 'live3d' | 'demo' | 'webcam'
    this.webcamStream = null;
    this.live3dStream = null;

    // Performance & Telemetry
    this.confidenceThreshold = 0.40;
    this.lastFrameTime = performance.now();
    this.fps = 0;
    this.latency = 0;
    this.activeDetections = [];

    // Virtual Counting Line (Percentage from top, 0.0 - 1.0)
    this.countingLineY = 0.55;
    this.countingLineActive = true;
    this.lineFlashUntil = 0;

    // Tracking for Counting (Avoid duplicate counts)
    this.trackedVehicles = new Map(); // id -> { centroid: [x,y], class: string, lastSeen: time, counted: bool }
    this.nextTrackId = 1;

    // Cumulative Counts
    this.counts = {
      total: 0,
      car: 0,
      motorcycle: 0,
      bus: 0,
      truck: 0,
      person: 0,
      bicycle: 0
    };

    // Detection Event Log
    this.eventLogs = [];

    // Target Class Configurations
    this.classConfig = {
      car: { label: 'Mobil', color: '#38bdf8', icon: 'fa-car' },
      motorcycle: { label: 'Motor', color: '#fb923c', icon: 'fa-motorcycle' },
      bus: { label: 'Angkot / Bus', color: '#10b981', icon: 'fa-bus' },
      truck: { label: 'Truk', color: '#a855f7', icon: 'fa-truck' },
      person: { label: 'Pejalan Kaki', color: '#f43f5e', icon: 'fa-person-walking' },
      bicycle: { label: 'Sepeda', color: '#facc15', icon: 'fa-bicycle' }
    };

    // Demo Canvas Generation (Procedural CCTV Traffic Footage)
    this.demoCanvas = null;
    this.demoCtx = null;
    this.demoVehicles = [];
    this.demoStream = null;

    // Sound alert using Web Audio API
    this.audioCtx = null;

    this.initDOM();
  }

  async loadModel() {
    if (this.model || this.isLoadingModel) return;
    this.isLoadingModel = true;
    this.updateStatusBadge('Memuat Model AI...', 'loading');

    try {
      // Set WebGL backend for high performance GPU acceleration
      await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
      await tf.ready();

      // Load lightweight, high-FPS COCO-SSD MobileNet v2 model
      this.model = await cocoSsd.load({
        base: 'mobilenet_v2'
      });

      this.isModelReady = true;
      this.isLoadingModel = false;
      this.updateStatusBadge('Model AI Aktif (COCO-SSD)', 'ready');
      this.addLogEvent('Sistem AI Vision siap dengan akselerasi WebGL.');
    } catch (err) {
      console.error('Error loading COCO-SSD model:', err);
      this.isLoadingModel = false;
      this.updateStatusBadge('Gagal Memuat Model', 'error');
      this.addLogEvent('Gagal memuat model: ' + err.message);
    }
  }

  initDOM() {
    this.modal = document.getElementById('ai-vision-modal');
    this.videoEl = document.getElementById('ai-video-feed');
    this.overlayCanvas = document.getElementById('ai-overlay-canvas');
    this.fileInput = document.getElementById('ai-file-input');

    if (this.overlayCanvas) {
      this.ctx = this.overlayCanvas.getContext('2d');
    }

    this.bindEvents();
    this.initDemoStream();
  }

  bindEvents() {
    // Nav Button Toggle
    const toggleBtn = document.getElementById('btn-toggle-ai-vision');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleModal());
    }

    // Modal Close Button
    const closeBtn = document.getElementById('btn-close-ai-vision');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    // File Input
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }

    // Source Selector Buttons
    const sourceBtns = document.querySelectorAll('.ai-src-btn');
    sourceBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const src = btn.getAttribute('data-source');
        this.switchSource(src);
      });
    });

    // Sensitivity / Confidence Slider
    const confSlider = document.getElementById('ai-conf-slider');
    const confVal = document.getElementById('ai-conf-val');
    if (confSlider) {
      confSlider.addEventListener('input', (e) => {
        this.confidenceThreshold = parseFloat(e.target.value) / 100;
        if (confVal) confVal.textContent = `${e.target.value}%`;
      });
    }

    // Counting Line Slider
    const lineSlider = document.getElementById('ai-line-slider');
    const lineVal = document.getElementById('ai-line-val');
    if (lineSlider) {
      lineSlider.addEventListener('input', (e) => {
        this.countingLineY = parseFloat(e.target.value) / 100;
        if (lineVal) lineVal.textContent = `${e.target.value}%`;
      });
    }

    // Play/Pause Button
    const playBtn = document.getElementById('btn-ai-play-pause');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.togglePlayPause());
    }

    // Reset Counts Button
    const resetBtn = document.getElementById('btn-ai-reset-counts');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetCounters());
    }

    // Export Log Button
    const exportBtn = document.getElementById('btn-ai-export-log');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCSV());
    }

    // Snapshot Button
    const snapBtn = document.getElementById('btn-ai-snapshot');
    if (snapBtn) {
      snapBtn.addEventListener('click', () => this.captureSnapshot());
    }
  }

  toggleModal() {
    if (!this.modal) return;
    const isHidden = this.modal.classList.contains('hidden');
    if (isHidden) {
      this.openModal();
    } else {
      this.closeModal();
    }
  }

  openModal() {
    if (!this.modal) return;
    this.modal.classList.remove('hidden');

    if (!this.isModelReady && !this.isLoadingModel) {
      this.loadModel();
    }

    // Start with default source if not already running
    if (!this.isRunning) {
      this.switchSource(this.currentSource || 'live3d');
    }
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
    this.stopDetection();

    // Release camera stream if open
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }
  }

  switchSource(sourceKey) {
    this.currentSource = sourceKey;

    // Update active tab buttons
    document.querySelectorAll('.ai-src-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-source') === sourceKey);
    });

    const fileUploadContainer = document.getElementById('ai-upload-container');
    if (fileUploadContainer) {
      fileUploadContainer.style.display = sourceKey === 'file' ? 'flex' : 'none';
    }

    // Stop current media
    if (this.videoEl) {
      this.videoEl.pause();
      if (this.videoEl.srcObject) {
        this.videoEl.srcObject = null;
      }
    }

    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }

    switch (sourceKey) {
      case 'file':
        this.addLogEvent('Silakan pilih file video (MP4/WebM) untuk dianalisis.');
        break;

      case 'live3d':
        this.setupLive3DStream();
        break;

      case 'demo':
        this.setupDemoStream();
        break;

      case 'webcam':
        this.setupWebcamStream();
        break;
    }
  }

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    this.videoEl.src = fileUrl;
    this.videoEl.srcObject = null;
    this.videoEl.loop = true;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;

    this.videoEl.onloadeddata = () => {
      this.videoEl.play();
      this.startDetection();
      this.addLogEvent(`Video berhasil dimuat: ${file.name} (${Math.round(this.videoEl.duration)}s)`);
    };
  }

  setupLive3DStream() {
    if (!this.app || !this.app.renderer || !this.app.renderer.domElement) return;

    try {
      const canvas = this.app.renderer.domElement;
      this.live3dStream = canvas.captureStream ? canvas.captureStream(30) : null;

      if (this.live3dStream && this.videoEl) {
        this.videoEl.src = '';
        this.videoEl.srcObject = this.live3dStream;
        this.videoEl.muted = true;
        this.videoEl.playsInline = true;
        this.videoEl.play().catch(() => {});
        this.startDetection();
        this.addLogEvent('Terhubung ke feed Kamera 3D Simulasi Simpang Setiabudi.');
      } else {
        this.setupDemoStream();
      }
    } catch (e) {
      console.warn('captureStream error, falling back to demo stream:', e);
      this.setupDemoStream();
    }
  }

  setupWebcamStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Perangkat kamera/webcam tidak didukung di browser ini.');
      this.switchSource('demo');
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      audio: false
    }).then(stream => {
      this.webcamStream = stream;
      this.videoEl.src = '';
      this.videoEl.srcObject = stream;
      this.videoEl.play();
      this.startDetection();
      this.addLogEvent('Terhubung ke feed Kamera / Webcam langsung.');
    }).catch(err => {
      console.error('Camera access error:', err);
      alert('Tidak dapat mengakses kamera: ' + err.message);
      this.switchSource('demo');
    });
  }

  initDemoStream() {
    // Generate realistic procedural CCTV road footage canvas
    this.demoCanvas = document.createElement('canvas');
    this.demoCanvas.width = 1280;
    this.demoCanvas.height = 720;
    this.demoCtx = this.demoCanvas.getContext('2d');

    // Spawn sample moving vehicles on demo canvas
    this.demoVehicles = [
      { x: 340, y: 120, speed: 2.8, type: 'car', color: '#1e40af', width: 85, height: 160 },
      { x: 460, y: -40, speed: 3.5, type: 'car', color: '#dc2626', width: 80, height: 155 },
      { x: 620, y: 280, speed: 3.0, type: 'bus', color: '#059669', width: 95, height: 210 },
      { x: 740, y: 50, speed: 4.2, type: 'motorcycle', color: '#d97706', width: 45, height: 85 },
      { x: 440, y: 390, speed: 2.6, type: 'truck', color: '#7c3aed', width: 105, height: 240 },
      { x: 630, y: -90, speed: 4.0, type: 'motorcycle', color: '#2563eb', width: 45, height: 85 }
    ];
  }

  updateDemoFrame() {
    if (!this.demoCtx) return;
    const ctx = this.demoCtx;
    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    // 1. Asphalt Road background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    // Sidewalks
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, 260, h);
    ctx.fillRect(w - 260, 0, 260, h);

    // Curbs
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(255, 0, 10, h);
    ctx.fillRect(w - 265, 0, 10, h);

    // Lane markings (dashed white lines)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([35, 25]);
    ctx.beginPath();
    ctx.moveTo(500, 0); ctx.lineTo(500, h);
    ctx.moveTo(780, 0); ctx.lineTo(780, h);
    ctx.stroke();

    // Center divider (Double Yellow Line)
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(636, 0); ctx.lineTo(636, h);
    ctx.moveTo(644, 0); ctx.lineTo(644, h);
    ctx.stroke();

    // Zebra Cross at middle
    ctx.fillStyle = '#ffffff';
    for (let y = 320; y <= 400; y += 22) {
      ctx.fillRect(270, y, 740, 12);
    }

    // 2. Draw moving vehicles
    for (const v of this.demoVehicles) {
      v.y += v.speed * 2.2;
      if (v.y > h + 250) {
        v.y = -260;
        v.x = 320 + Math.random() * 600;
      }

      // Draw Vehicle Body
      ctx.save();
      ctx.translate(v.x, v.y);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(-v.width / 2 - 4, -v.height / 2 + 6, v.width + 8, v.height + 8, 8);
      ctx.fill();

      // Main Chassis
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.roundRect(-v.width / 2, -v.height / 2, v.width, v.height, 10);
      ctx.fill();

      // Windshield & Windows
      ctx.fillStyle = '#0f172a';
      if (v.type === 'car' || v.type === 'bus' || v.type === 'truck') {
        // Front Windshield
        ctx.fillRect(-v.width / 2 + 8, -v.height / 2 + 18, v.width - 16, 26);
        // Roof
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(-v.width / 2 + 10, -v.height / 2 + 48, v.width - 20, v.height - 80);
        // Rear Window
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-v.width / 2 + 8, v.height / 2 - 32, v.width - 16, 20);
      } else if (v.type === 'motorcycle') {
        // Rider helmet & handlebars
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(0, -10, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-18, -25, 36, 6);
      }

      // Headlights
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-v.width / 2 + 6, -v.height / 2, 12, 6);
      ctx.fillRect(v.width / 2 - 18, -v.height / 2, 12, 6);

      // Taillights
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-v.width / 2 + 6, v.height / 2 - 6, 12, 6);
      ctx.fillRect(v.width / 2 - 18, v.height / 2 - 6, 12, 6);

      ctx.restore();
    }

    // CCTV Timestamp HUD overlay on demo footage
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(15, 15, 340, 48);
    ctx.fillStyle = '#10b981';
    ctx.font = '600 16px "JetBrains Mono", monospace';
    const timeStr = new Date().toLocaleTimeString('id-ID');
    ctx.fillText(`CAM-01 • JL. SETIABUDI [${timeStr}]`, 28, 45);
  }

  setupDemoStream() {
    if (!this.demoCanvas) this.initDemoStream();
    this.demoStream = this.demoCanvas.captureStream(30);
    this.videoEl.src = '';
    this.videoEl.srcObject = this.demoStream;
    this.videoEl.play().catch(() => {});
    this.startDetection();
    this.addLogEvent('Menjalankan Rekaman CCTV Demo Simpang Setiabudi.');
  }

  startDetection() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();

    const loop = async () => {
      if (!this.isRunning) return;

      if (this.currentSource === 'demo') {
        this.updateDemoFrame();
      }

      await this.detectFrame();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  stopDetection() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.ctx && this.overlayCanvas) {
      this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }

  togglePlayPause() {
    const playBtn = document.getElementById('btn-ai-play-pause');
    if (this.isRunning) {
      this.stopDetection();
      if (this.videoEl) this.videoEl.pause();
      if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>Mulai Deteksi</span>';
      this.updateStatusBadge('Dijeda (Paused)', 'idle');
    } else {
      if (this.videoEl) this.videoEl.play().catch(() => {});
      this.startDetection();
      if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-pause"></i> <span>Jeda Deteksi</span>';
      this.updateStatusBadge('AI Mendeteksi...', 'ready');
    }
  }

  async detectFrame() {
    if (!this.videoEl || !this.overlayCanvas || !this.ctx) return;
    if (this.videoEl.readyState < 2) return; // HAVE_CURRENT_DATA

    const now = performance.now();
    const frameDt = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.fps = Math.round(1000 / (frameDt || 16.6));

    // Match overlay canvas size to video dimensions
    const vidW = this.videoEl.videoWidth || this.videoEl.clientWidth || 640;
    const vidH = this.videoEl.videoHeight || this.videoEl.clientHeight || 360;

    if (this.overlayCanvas.width !== vidW || this.overlayCanvas.height !== vidH) {
      this.overlayCanvas.width = vidW;
      this.overlayCanvas.height = vidH;
    }

    // Run AI Model Inference
    if (this.model && this.isModelReady) {
      const startTime = performance.now();
      try {
        const predictions = await this.model.detect(this.videoEl);
        this.latency = Math.round(performance.now() - startTime);

        // Filter for target vehicle and pedestrian categories above threshold
        const validPredictions = predictions.filter(p => {
          return this.classConfig[p.class] && p.score >= this.confidenceThreshold;
        });

        this.activeDetections = validPredictions;
        this.processTrackingAndCounting(validPredictions, vidW, vidH);
        this.renderAnnotations(validPredictions, vidW, vidH);
      } catch (err) {
        console.warn('AI inference frame error:', err);
      }
    } else {
      // If model not yet loaded, render virtual counting line only
      this.ctx.clearRect(0, 0, vidW, vidH);
      this.renderCountingLine(vidW, vidH);
    }

    this.updateTelemetryHUD();
  }

  processTrackingAndCounting(predictions, w, h) {
    const lineY = h * this.countingLineY;
    const now = performance.now();
    const currentFrameCentroids = [];

    for (const pred of predictions) {
      const [bx, by, bw, bh] = pred.bbox;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      currentFrameCentroids.push({ cx, cy, class: pred.class, score: pred.score });

      // Match with tracked vehicles
      let bestMatchId = null;
      let minDist = 75; // max pixel distance between frames

      for (const [id, track] of this.trackedVehicles.entries()) {
        const dx = track.cx - cx;
        const dy = track.cy - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist && track.class === pred.class) {
          minDist = dist;
          bestMatchId = id;
        }
      }

      if (bestMatchId) {
        const track = this.trackedVehicles.get(bestMatchId);
        const prevY = track.cy;
        track.cx = cx;
        track.cy = cy;
        track.lastSeen = now;

        // Check if crossed counting line
        if (!track.counted && this.countingLineActive) {
          const crossedDown = prevY < lineY && cy >= lineY;
          const crossedUp = prevY > lineY && cy <= lineY;

          if (crossedDown || crossedUp) {
            track.counted = true;
            this.recordCountEvent(pred.class, pred.score);
          }
        }
      } else {
        // Create new track
        const newId = this.nextTrackId++;
        this.trackedVehicles.set(newId, {
          id: newId,
          cx,
          cy,
          class: pred.class,
          lastSeen: now,
          counted: false
        });
      }
    }

    // Clean up stale tracks (older than 1.5 seconds)
    for (const [id, track] of this.trackedVehicles.entries()) {
      if (now - track.lastSeen > 1500) {
        this.trackedVehicles.delete(id);
      }
    }
  }

  recordCountEvent(category, score) {
    if (this.counts[category] !== undefined) {
      this.counts[category]++;
      this.counts.total++;
    }

    // Trigger visual line pulse
    this.lineFlashUntil = performance.now() + 350;

    // Play subtle detection acoustic ping
    this.playChime();

    // Log Event
    const cfg = this.classConfig[category] || { label: category };
    const timeStr = new Date().toLocaleTimeString('id-ID');
    this.addLogEvent(`[${timeStr}] Melintas: ${cfg.label} (${Math.round(score * 100)}%)`);

    // Update UI Counters
    this.updateCounterBadges();
  }

  playChime() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08); // E6

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}
  }

  renderAnnotations(predictions, w, h) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // 1. Render Virtual Counting Line
    this.renderCountingLine(w, h);

    // 2. Render Vehicle Bounding Boxes & Tags
    for (const pred of predictions) {
      const [x, y, width, height] = pred.bbox;
      const cfg = this.classConfig[pred.class] || { label: pred.class, color: '#06b6d4', icon: 'fa-car' };
      const color = cfg.color;
      const scorePct = `${Math.round(pred.score * 100)}%`;

      ctx.save();

      // Glowing Bounding Box Border
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;

      // Draw Main Box
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 6);
      ctx.stroke();

      // Draw High-Tech Corner Brackets
      const bracketLen = Math.min(18, width * 0.25, height * 0.25);
      ctx.lineWidth = 4;
      ctx.shadowBlur = 18;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(x, y + bracketLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + bracketLen, y);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(x + width - bracketLen, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + bracketLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(x, y + height - bracketLen);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x + bracketLen, y + height);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(x + width - bracketLen, y + height);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x + width, y + height - bracketLen);
      ctx.stroke();

      // Centroid Crosshair Marker
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Label Badge Tag
      const labelText = `${cfg.label} ${scorePct}`;
      ctx.font = '600 13px "Outfit", sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const tagW = textWidth + 24;
      const tagH = 22;
      const tagX = Math.max(0, x);
      const tagY = y > 26 ? y - tagH - 4 : y + height + 4;

      // Tag Background
      ctx.fillStyle = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 4);
      ctx.fill();

      // Tag Text
      ctx.fillStyle = '#0f172a';
      ctx.shadowBlur = 0;
      ctx.fillText(labelText, tagX + 8, tagY + 16);

      ctx.restore();
    }
  }

  renderCountingLine(w, h) {
    if (!this.countingLineActive) return;
    const ctx = this.ctx;
    const lineY = h * this.countingLineY;
    const isFlashing = performance.now() < this.lineFlashUntil;

    ctx.save();
    ctx.shadowBlur = isFlashing ? 24 : 10;
    ctx.shadowColor = isFlashing ? '#fde047' : '#38bdf8';
    ctx.strokeStyle = isFlashing ? '#fef08a' : 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = isFlashing ? 4 : 2.5;
    ctx.setLineDash([12, 8]);

    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(w, lineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Line Label Badge
    ctx.fillStyle = isFlashing ? '#fef08a' : '#38bdf8';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    const tagText = isFlashing ? '⚡ HITUNG KENDARAAN' : '⮞ GARIS DETEKSI LALU LINTAS';
    ctx.fillText(tagText, 16, lineY - 8);

    ctx.restore();
  }

  updateTelemetryHUD() {
    const fpsEl = document.getElementById('ai-fps-counter');
    const latEl = document.getElementById('ai-lat-counter');
    const onScreenEl = document.getElementById('ai-onscreen-counter');

    if (fpsEl) fpsEl.textContent = `${this.fps} FPS`;
    if (latEl) latEl.textContent = `${this.latency} ms`;
    if (onScreenEl) onScreenEl.textContent = `${this.activeDetections.length}`;
  }

  updateCounterBadges() {
    const totalEl = document.getElementById('cnt-total');
    const carEl = document.getElementById('cnt-car');
    const motorEl = document.getElementById('cnt-motor');
    const busEl = document.getElementById('cnt-bus');
    const truckEl = document.getElementById('cnt-truck');
    const personEl = document.getElementById('cnt-person');

    if (totalEl) totalEl.textContent = this.counts.total;
    if (carEl) carEl.textContent = this.counts.car;
    if (motorEl) motorEl.textContent = this.counts.motorcycle;
    if (busEl) busEl.textContent = this.counts.bus;
    if (truckEl) truckEl.textContent = this.counts.truck;
    if (personEl) personEl.textContent = this.counts.person;
  }

  resetCounters() {
    this.counts = { total: 0, car: 0, motorcycle: 0, bus: 0, truck: 0, person: 0, bicycle: 0 };
    this.trackedVehicles.clear();
    this.updateCounterBadges();
    this.addLogEvent('Data hitungan kendaraan di-reset ke 0.');
  }

  updateStatusBadge(text, state = 'ready') {
    const badge = document.getElementById('ai-status-badge');
    if (!badge) return;
    badge.innerHTML = `<span class="ai-status-dot dot-${state}"></span><span>${text}</span>`;
  }

  addLogEvent(message) {
    this.eventLogs.unshift({ time: new Date().toLocaleTimeString('id-ID'), message });
    if (this.eventLogs.length > 50) this.eventLogs.pop();

    const logContainer = document.getElementById('ai-event-stream');
    if (logContainer) {
      logContainer.innerHTML = this.eventLogs.map(l => `
        <div class="ai-log-entry">
          <span class="ai-log-time">${l.time}</span>
          <span class="ai-log-msg">${l.message}</span>
        </div>
      `).join('');
    }
  }

  exportCSV() {
    if (this.counts.total === 0 && this.eventLogs.length === 0) {
      alert('Belum ada data kendaraan yang terhitung.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Waktu,Kategori,Label,Jumlah_Terhitung\n';
    csvContent += `Semua,total,Total Kendaraan,${this.counts.total}\n`;
    csvContent += `Semua,car,Mobil,${this.counts.car}\n`;
    csvContent += `Semua,motorcycle,Sepeda Motor,${this.counts.motorcycle}\n`;
    csvContent += `Semua,bus,Angkot / Bus,${this.counts.bus}\n`;
    csvContent += `Semua,truck,Truk,${this.counts.truck}\n`;
    csvContent += `Semua,person,Pejalan Kaki,${this.counts.person}\n\n`;

    csvContent += 'Waktu_Kejadian,Aktivitas_Deteksi\n';
    this.eventLogs.forEach(row => {
      csvContent += `"${row.time}","${row.message.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ai_traffic_survey_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.addLogEvent('Laporan CSV berhasil diunduh.');
  }

  captureSnapshot() {
    if (!this.overlayCanvas) return;

    // Combine video frame and overlay canvas
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = this.overlayCanvas.width;
    snapCanvas.height = this.overlayCanvas.height;
    const snapCtx = snapCanvas.getContext('2d');

    if (this.videoEl) {
      snapCtx.drawImage(this.videoEl, 0, 0, snapCanvas.width, snapCanvas.height);
    }
    snapCtx.drawImage(this.overlayCanvas, 0, 0);

    const image = snapCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `cctv_ai_detection_${Date.now()}.png`;
    link.href = image;
    link.click();
    this.addLogEvent('Tangkapan layar deteksi AI berhasil disimpan.');
  }
}
