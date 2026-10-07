import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export class VehicleDetector {
  constructor(app) {
    this.app = app;
    this.model = null;
    this.isLoadingModel = false;
    this.isModelReady = false;

    // DOM Elements
    this.modal = null;
    this.videoEl = null;
    this.overlayCanvas = null;
    this.ctx = null;
    this.fileInput = null;
    this.viewportWrapper = null;
    this.uploadContainer = null;

    // Offscreen Canvas for Ultra-Fast WebGL Inference (Downscaled)
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenW = 480;
    this.offscreenH = 270;
    this.offscreenCanvas.width = this.offscreenW;
    this.offscreenCanvas.height = this.offscreenH;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });

    // Detection & Loop State
    this.isRunning = false;
    this.aiDetectionEnabled = true;
    this.isInferring = false;
    this.renderAnimId = null;
    this.inferenceTimeout = null;

    this.currentSource = 'file'; // Default to file/demo
    this.activeFileName = '';
    this.webcamStream = null;
    this.live3dStream = null;

    // Performance & Telemetry
    this.confidenceThreshold = 0.35;
    this.lastRenderTime = performance.now();
    this.fps = 0;
    this.latency = 0;
    this.activeDetections = [];

    // Feature Toggles
    this.showMotionTrails = true;
    this.showSpeedEstimate = true;
    this.showDirectionArrow = true;

    // Class Filter Toggles (Indonesian Traffic Categories)
    this.enabledClasses = {
      car: true,
      motorcycle: true,
      bus: true,
      truck: true,
      person: true,
      bicycle: true
    };

    // Virtual Counting Line (Percentage from top, 0.1 - 0.9)
    this.countingLineY = 0.55;
    this.countingLineActive = true;
    this.lineFlashUntil = 0;
    this.isDraggingLine = false;

    // Tracking for Counting & Speed (Multi-Object Tracking)
    this.trackedVehicles = new Map(); // id -> { id, cx, cy, class, score, history: [[x,y]], firstSeen, lastSeen, counted, dir, speedKmh }
    this.nextTrackId = 1;

    // Cumulative Counts (Total, Per-Class, & Directional)
    this.counts = {
      total: 0,
      dirUp: 0,   // Arah Lembang (Utara / Menjauh)
      dirDown: 0, // Arah Bandung (Selatan / Mendekat)
      car: 0,
      motorcycle: 0,
      bus: 0,
      truck: 0,
      person: 0,
      bicycle: 0
    };

    // Detection Event Log
    this.eventLogs = [];

    // Target Class Configurations & Styling
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

    // Web Audio Chime
    this.audioCtx = null;

    this.initDOM();
  }

  async loadModel() {
    if (this.model || this.isLoadingModel) return;
    this.isLoadingModel = true;
    this.updateStatusBadge('Memuat Model AI...', 'loading');

    try {
      // 1. Initialize WebGL backend with hardware GPU acceleration
      await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
      await tf.ready();

      const backendName = tf.getBackend();

      // 2. Load lightweight MobileNet COCO-SSD model optimized for browser edge inference
      this.model = await cocoSsd.load({
        base: 'lite_mobilenet_v2'
      });

      // 3. Model Warm-Up: Execute dummy inference to trigger WebGL shader compilation immediately
      // This eliminates the initial 8-second shader compilation stall!
      try {
        const warmUpCanvas = document.createElement('canvas');
        warmUpCanvas.width = 300;
        warmUpCanvas.height = 300;
        await this.model.detect(warmUpCanvas);
      } catch (e) {
        // Warm-up completed
      }

      this.isModelReady = true;
      this.isLoadingModel = false;
      this.updateStatusBadge(`Model Siap (${backendName.toUpperCase()} GPU)`, 'ready');
      this.addLogEvent(`Sistem AI Vision aktif dengan backend ${backendName.toUpperCase()} (Warm-up selesai).`);
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
    this.viewportWrapper = document.getElementById('ai-viewport-wrapper');
    this.uploadContainer = document.getElementById('ai-upload-container');

    if (this.overlayCanvas) {
      this.ctx = this.overlayCanvas.getContext('2d');
    }

    this.bindEvents();
    this.initDemoStream();
  }

  bindEvents() {
    // 1. Navbar Toggle & Modal Close
    const toggleBtn = document.getElementById('btn-toggle-ai-vision');
    if (toggleBtn) toggleBtn.addEventListener('click', () => this.toggleModal());

    const closeBtn = document.getElementById('btn-close-ai-vision');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());

    // 2. File Input & Drag-and-Drop
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileUpload(e.target.files[0]);
        }
      });
    }

    if (this.viewportWrapper) {
      this.viewportWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.viewportWrapper.classList.add('drag-over');
      });

      this.viewportWrapper.addEventListener('dragleave', () => {
        this.viewportWrapper.classList.remove('drag-over');
      });

      this.viewportWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        this.viewportWrapper.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.switchSource('file');
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });
    }

    // 3. Video Timeline Scrubber & Transport Controls
    const vidPlayBtn = document.getElementById('btn-video-play-pause');
    if (vidPlayBtn) {
      vidPlayBtn.addEventListener('click', () => this.toggleVideoPlayback());
    }

    const vidRestartBtn = document.getElementById('btn-video-restart');
    if (vidRestartBtn) {
      vidRestartBtn.addEventListener('click', () => {
        if (this.videoEl) {
          this.videoEl.currentTime = 0;
          this.videoEl.play().catch(() => {});
        }
      });
    }

    const scrubber = document.getElementById('ai-video-scrubber');
    if (scrubber && this.videoEl) {
      scrubber.addEventListener('input', (e) => {
        if (this.videoEl && this.videoEl.duration) {
          const seekTime = (parseFloat(e.target.value) / 100) * this.videoEl.duration;
          this.videoEl.currentTime = seekTime;
        }
      });
    }

    // Playback Speed Buttons (0.5x, 1x, 1.5x, 2x)
    document.querySelectorAll('.ai-speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ai-speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = parseFloat(btn.getAttribute('data-speed')) || 1.0;
        if (this.videoEl) this.videoEl.playbackRate = speed;
      });
    });

    // 4. Source Selector Tabs
    const sourceBtns = document.querySelectorAll('.ai-src-btn');
    sourceBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const src = btn.getAttribute('data-source');
        this.switchSource(src);
      });
    });

    // 5. Presets (Sensitif, Standar, Ketat)
    document.querySelectorAll('.ai-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ai-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.getAttribute('data-preset');
        this.applyPreset(preset);
      });
    });

    // 6. Confidence & Line Sliders
    const confSlider = document.getElementById('ai-conf-slider');
    const confVal = document.getElementById('ai-conf-val');
    if (confSlider) {
      confSlider.addEventListener('input', (e) => {
        this.confidenceThreshold = parseFloat(e.target.value) / 100;
        if (confVal) confVal.textContent = `${e.target.value}%`;
      });
    }

    const lineSlider = document.getElementById('ai-line-slider');
    const lineVal = document.getElementById('ai-line-val');
    if (lineSlider) {
      lineSlider.addEventListener('input', (e) => {
        this.countingLineY = parseFloat(e.target.value) / 100;
        if (lineVal) lineVal.textContent = `${e.target.value}%`;
      });
    }

    // 7. Interactive Virtual Line Dragging on Canvas
    if (this.overlayCanvas) {
      this.overlayCanvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
      window.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
      window.addEventListener('mouseup', () => this.handleCanvasMouseUp());
    }

    // 8. Class Filter Click Toggles
    document.querySelectorAll('.ai-count-box').forEach(box => {
      box.addEventListener('click', () => {
        const cls = box.getAttribute('data-class');
        if (cls && this.enabledClasses[cls] !== undefined) {
          this.enabledClasses[cls] = !this.enabledClasses[cls];
          box.classList.toggle('active', this.enabledClasses[cls]);
        }
      });
    });

    // 9. Feature Toggles
    const toggleTrailsBtn = document.getElementById('btn-ai-toggle-trails');
    if (toggleTrailsBtn) {
      toggleTrailsBtn.addEventListener('click', () => {
        this.showMotionTrails = !this.showMotionTrails;
        toggleTrailsBtn.classList.toggle('off', !this.showMotionTrails);
      });
    }

    const toggleSpeedBtn = document.getElementById('btn-ai-toggle-speed');
    if (toggleSpeedBtn) {
      toggleSpeedBtn.addEventListener('click', () => {
        this.showSpeedEstimate = !this.showSpeedEstimate;
        toggleSpeedBtn.classList.toggle('off', !this.showSpeedEstimate);
      });
    }

    // 10. AI Play/Pause Inference Toggle
    const aiToggleBtn = document.getElementById('btn-ai-play-pause');
    if (aiToggleBtn) {
      aiToggleBtn.addEventListener('click', () => this.toggleAIInference());
    }

    // 11. Reset, Snapshot, CSV Export
    const resetBtn = document.getElementById('btn-ai-reset-counts');
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetCounters());

    const exportBtn = document.getElementById('btn-ai-export-log');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportCSV());

    const snapBtn = document.getElementById('btn-ai-snapshot');
    if (snapBtn) snapBtn.addEventListener('click', () => this.captureSnapshot());
  }

  applyPreset(preset) {
    const slider = document.getElementById('ai-conf-slider');
    const valText = document.getElementById('ai-conf-val');

    let conf = 35;
    if (preset === 'sensitive') conf = 22;
    else if (preset === 'strict') conf = 52;

    this.confidenceThreshold = conf / 100;
    if (slider) slider.value = conf;
    if (valText) valText.textContent = `${conf}%`;
    this.addLogEvent(`Preset diterapkan: ${preset.toUpperCase()} (${conf}% threshold)`);
  }

  toggleModal() {
    if (!this.modal) return;
    const isHidden = this.modal.classList.contains('hidden');
    if (isHidden) this.openModal();
    else this.closeModal();
  }

  openModal() {
    if (!this.modal) return;
    this.modal.classList.remove('hidden');

    if (!this.isModelReady && !this.isLoadingModel) {
      this.loadModel();
    }

    if (!this.isRunning) {
      this.switchSource(this.currentSource || 'file');
    }
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
    this.stopDetection();

    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }
  }

  switchSource(sourceKey) {
    this.currentSource = sourceKey;

    document.querySelectorAll('.ai-src-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-source') === sourceKey);
    });

    // Handle Upload Prompt visibility
    if (this.uploadContainer) {
      if (sourceKey === 'file') {
        // Show upload prompt only if no video is currently loaded
        const hasLoadedVideo = this.videoEl && this.videoEl.src && !this.videoEl.srcObject;
        this.uploadContainer.style.display = hasLoadedVideo ? 'none' : 'flex';
      } else {
        this.uploadContainer.style.display = 'none';
      }
    }

    // Stop previous stream
    if (this.videoEl) {
      this.videoEl.pause();
      if (this.videoEl.srcObject) this.videoEl.srcObject = null;
    }

    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }

    switch (sourceKey) {
      case 'file':
        if (this.videoEl && this.videoEl.src && !this.videoEl.srcObject) {
          this.videoEl.play().catch(() => {});
          this.startDetection();
        } else {
          this.addLogEvent('Silakan pilih file video MP4/WebM atau drag & drop ke layar.');
        }
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

  handleFileUpload(file) {
    if (!file) return;

    // 1. Immediately hide the upload prompt!
    if (this.uploadContainer) {
      this.uploadContainer.style.display = 'none';
    }

    this.activeFileName = file.name;
    const fileUrl = URL.createObjectURL(file);

    this.videoEl.srcObject = null;
    this.videoEl.src = fileUrl;
    this.videoEl.loop = true;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;

    // Show file name in HUD
    const fnBadge = document.getElementById('ai-hud-filename');
    const fnTxt = document.getElementById('ai-file-name-txt');
    if (fnBadge && fnTxt) {
      fnTxt.textContent = file.name;
      fnBadge.style.display = 'inline-flex';
    }

    this.videoEl.onloadeddata = () => {
      this.videoEl.play().catch(() => {});
      this.startDetection();
      this.updatePlayBtnIcon(true);
      const durSec = Math.round(this.videoEl.duration || 0);
      this.addLogEvent(`Video berhasil dimuat: ${file.name} (${durSec}s). Deteksi berjalan.`);
    };
  }

  toggleVideoPlayback() {
    if (!this.videoEl) return;
    if (this.videoEl.paused) {
      this.videoEl.play().catch(() => {});
      this.updatePlayBtnIcon(true);
    } else {
      this.videoEl.pause();
      this.updatePlayBtnIcon(false);
    }
  }

  updatePlayBtnIcon(isPlaying) {
    const btn = document.getElementById('btn-video-play-pause');
    if (btn) {
      btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }
  }

  toggleAIInference() {
    this.aiDetectionEnabled = !this.aiDetectionEnabled;
    const btn = document.getElementById('btn-ai-play-pause');
    if (btn) {
      if (this.aiDetectionEnabled) {
        btn.innerHTML = '<i class="fa-solid fa-brain"></i> <span>Deteksi AI Aktif</span>';
        btn.classList.add('btn-primary');
        this.updateStatusBadge('AI Mendeteksi...', 'ready');
      } else {
        btn.innerHTML = '<i class="fa-solid fa-pause"></i> <span>Deteksi Dijeda</span>';
        btn.classList.remove('btn-primary');
        this.updateStatusBadge('AI Dijeda', 'idle');
      }
    }
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
        this.addLogEvent('Terhubung ke feed live 3D Simulasi Simpang Setiabudi.');
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
    this.demoCanvas = document.createElement('canvas');
    this.demoCanvas.width = 1280;
    this.demoCanvas.height = 720;
    this.demoCtx = this.demoCanvas.getContext('2d');

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

    // Road background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    // Sidewalks & curbs
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, 260, h);
    ctx.fillRect(w - 260, 0, 260, h);

    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(255, 0, 10, h);
    ctx.fillRect(w - 265, 0, 10, h);

    // Lane markings
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([35, 25]);
    ctx.beginPath();
    ctx.moveTo(500, 0); ctx.lineTo(500, h);
    ctx.moveTo(780, 0); ctx.lineTo(780, h);
    ctx.stroke();

    // Center divider
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(636, 0); ctx.lineTo(636, h);
    ctx.moveTo(644, 0); ctx.lineTo(644, h);
    ctx.stroke();

    // Zebra Cross
    ctx.fillStyle = '#ffffff';
    for (let y = 320; y <= 400; y += 22) {
      ctx.fillRect(270, y, 740, 12);
    }

    // Moving vehicles
    for (const v of this.demoVehicles) {
      v.y += v.speed * 2.2;
      if (v.y > h + 250) {
        v.y = -260;
        v.x = 320 + Math.random() * 600;
      }

      ctx.save();
      ctx.translate(v.x, v.y);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(-v.width / 2 - 4, -v.height / 2 + 6, v.width + 8, v.height + 8, 8);
      ctx.fill();

      // Chassis
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.roundRect(-v.width / 2, -v.height / 2, v.width, v.height, 10);
      ctx.fill();

      // Windows
      ctx.fillStyle = '#0f172a';
      if (v.type === 'car' || v.type === 'bus' || v.type === 'truck') {
        ctx.fillRect(-v.width / 2 + 8, -v.height / 2 + 18, v.width - 16, 26);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(-v.width / 2 + 10, -v.height / 2 + 48, v.width - 20, v.height - 80);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-v.width / 2 + 8, v.height / 2 - 32, v.width - 16, 20);
      } else if (v.type === 'motorcycle') {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(0, -10, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-18, -25, 36, 6);
      }

      // Lights
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-v.width / 2 + 6, -v.height / 2, 12, 6);
      ctx.fillRect(v.width / 2 - 18, -v.height / 2, 12, 6);

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-v.width / 2 + 6, v.height / 2 - 6, 12, 6);
      ctx.fillRect(v.width / 2 - 18, v.height / 2 - 6, 12, 6);

      ctx.restore();
    }

    // CCTV Timestamp HUD overlay
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(15, 15, 360, 48);
    ctx.fillStyle = '#10b981';
    ctx.font = '600 15px "JetBrains Mono", monospace';
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
    this.addLogEvent('Menjalankan rekaman CCTV Demo Simpang Setiabudi.');
  }

  // =========================================================================
  // DECOUPLED LOOPS: 60 FPS RENDER LOOP & ASYNC GPU INFERENCE LOOP
  // =========================================================================
  startDetection() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastRenderTime = performance.now();

    // 1. Launch 60 FPS Smooth Render Loop
    const renderLoop = () => {
      if (!this.isRunning) return;

      if (this.currentSource === 'demo') {
        this.updateDemoFrame();
      }

      this.updateTimelineUI();
      this.renderCanvasFrame();

      this.renderAnimId = requestAnimationFrame(renderLoop);
    };
    this.renderAnimId = requestAnimationFrame(renderLoop);

    // 2. Launch Non-Blocking Async Inference Loop
    this.runInferenceLoop();
  }

  stopDetection() {
    this.isRunning = false;
    if (this.renderAnimId) {
      cancelAnimationFrame(this.renderAnimId);
      this.renderAnimId = null;
    }
    if (this.inferenceTimeout) {
      clearTimeout(this.inferenceTimeout);
      this.inferenceTimeout = null;
    }
    if (this.ctx && this.overlayCanvas) {
      this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }

  async runInferenceLoop() {
    if (!this.isRunning) return;

    if (this.model && this.isModelReady && this.aiDetectionEnabled && !this.isInferring) {
      this.isInferring = true;
      const t0 = performance.now();
      try {
        await this.detectFrame();
      } catch (err) {
        console.warn('AI detectFrame error:', err);
      } finally {
        this.latency = Math.round(performance.now() - t0);
        this.isInferring = false;
      }
    }

    if (this.isRunning) {
      // Schedule next inference tick without locking main thread
      this.inferenceTimeout = setTimeout(() => this.runInferenceLoop(), 16);
    }
  }

  // =========================================================================
  // HIGH-PERFORMANCE INFERENCE (DOWNSCALED OFFSCREEN TEXTURE)
  // =========================================================================
  async detectFrame() {
    if (!this.videoEl || this.videoEl.readyState < 2) return;

    const vidW = this.videoEl.videoWidth || 640;
    const vidH = this.videoEl.videoHeight || 360;

    // 1. Draw into downscaled offscreen canvas (480x270)
    this.offscreenCtx.drawImage(this.videoEl, 0, 0, this.offscreenW, this.offscreenH);

    // 2. Run inference on small offscreen canvas (instant WebGL texture upload!)
    const rawPredictions = await this.model.detect(this.offscreenCanvas, 25, this.confidenceThreshold);

    // 3. Scale bounding boxes back up to full video size
    const scaleX = vidW / this.offscreenW;
    const scaleY = vidH / this.offscreenH;

    const scaledPredictions = rawPredictions.map(p => ({
      ...p,
      bbox: [
        p.bbox[0] * scaleX,
        p.bbox[1] * scaleY,
        p.bbox[2] * scaleX,
        p.bbox[3] * scaleY
      ]
    }));

    // 4. Fuse Indonesian Traffic Detections (Merge Rider + Motorcycle into Motorcycle)
    const fusedPredictions = this.fuseIndonesianTraffic(scaledPredictions);

    // 5. Filter for enabled classes and confidence threshold
    const validPredictions = fusedPredictions.filter(p => {
      return this.classConfig[p.class] &&
             this.enabledClasses[p.class] &&
             p.score >= this.confidenceThreshold;
    });

    this.activeDetections = validPredictions;

    // 6. Multi-Object Tracking & Virtual Line Counting
    this.processTrackingAndCounting(validPredictions, vidW, vidH);
  }

  fuseIndonesianTraffic(predictions) {
    const motorcycles = predictions.filter(p => p.class === 'motorcycle');
    const persons = predictions.filter(p => p.class === 'person');
    const others = predictions.filter(p => p.class !== 'motorcycle' && p.class !== 'person');

    // If person is riding motorcycle (bounding box center inside motorcycle box), suppress duplicate person box
    const filteredPersons = persons.filter(person => {
      const [px, py, pw, ph] = person.bbox;
      const pcx = px + pw / 2;
      const pcy = py + ph / 2;

      for (const moto of motorcycles) {
        const [mx, my, mw, mh] = moto.bbox;
        // Expand moto box slightly upwards for rider helmet
        if (pcx >= mx - 10 && pcx <= mx + mw + 10 &&
            pcy >= my - 40 && pcy <= my + mh + 10) {
          return false; // Person is rider, fuse into motorcycle
        }
      }
      return true;
    });

    return [...others, ...motorcycles, ...filteredPersons];
  }

  processTrackingAndCounting(predictions, w, h) {
    const lineY = h * this.countingLineY;
    const now = performance.now();

    for (const pred of predictions) {
      const [bx, by, bw, bh] = pred.bbox;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;

      // Find best matching track
      let bestMatchId = null;
      let minDist = 90; // max pixel distance between frames

      for (const [id, track] of this.trackedVehicles.entries()) {
        const dist = Math.hypot(track.cx - cx, track.cy - cy);
        if (dist < minDist && track.class === pred.class) {
          minDist = dist;
          bestMatchId = id;
        }
      }

      if (bestMatchId) {
        const track = this.trackedVehicles.get(bestMatchId);
        const prevY = track.cy;
        const prevX = track.cx;
        const dtSec = Math.max(0.016, (now - track.lastSeen) / 1000);

        // Calculate motion vector and direction
        const dy = cy - prevY;
        const dx = cx - prevX;

        track.cx = cx;
        track.cy = cy;
        track.bbox = pred.bbox;
        track.score = pred.score;
        track.lastSeen = now;

        // Append to history (for motion trails)
        track.history.push([cx, cy]);
        if (track.history.length > 12) track.history.shift();

        // Direction: Moving down (South/Bandung) vs Moving up (North/Lembang)
        if (dy > 1.5) track.dir = 'down';
        else if (dy < -1.5) track.dir = 'up';

        // Speed estimation in km/h (~35m road height mapped to pixel displacement)
        const pxPerSec = Math.hypot(dx, dy) / dtSec;
        const calibratedSpeed = Math.round((pxPerSec / h) * 95);
        track.speedKmh = Math.min(85, Math.max(12, calibratedSpeed));

        // Virtual Counting Line Collision Detection
        if (!track.counted && this.countingLineActive) {
          const crossedDown = prevY < lineY && cy >= lineY;
          const crossedUp = prevY > lineY && cy <= lineY;

          if (crossedDown || crossedUp) {
            track.counted = true;
            const direction = crossedDown ? 'down' : 'up';
            this.recordCountEvent(pred.class, pred.score, direction);
          }
        }
      } else {
        // Create new tracked object
        const newId = this.nextTrackId++;
        this.trackedVehicles.set(newId, {
          id: newId,
          cx,
          cy,
          bbox: pred.bbox,
          class: pred.class,
          score: pred.score,
          history: [[cx, cy]],
          firstSeen: now,
          lastSeen: now,
          counted: false,
          dir: 'down',
          speedKmh: 35
        });
      }
    }

    // Clean up stale tracks (older than 1.2 seconds)
    for (const [id, track] of this.trackedVehicles.entries()) {
      if (now - track.lastSeen > 1200) {
        this.trackedVehicles.delete(id);
      }
    }
  }

  recordCountEvent(category, score, direction = 'down') {
    if (this.counts[category] !== undefined) {
      this.counts[category]++;
      this.counts.total++;

      if (direction === 'up') this.counts.dirUp++;
      else this.counts.dirDown++;
    }

    // Visual pulse
    this.lineFlashUntil = performance.now() + 380;

    // Subtle acoustic ping
    this.playChime();

    // Event Log
    const cfg = this.classConfig[category] || { label: category };
    const timeStr = new Date().toLocaleTimeString('id-ID');
    const dirTxt = direction === 'up' ? '⬆️ Menuju Lembang' : '⬇️ Menuju Bandung';
    this.addLogEvent(`[${timeStr}] Melintas: ${cfg.label} (${Math.round(score * 100)}%) • ${dirTxt}`);

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
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}
  }

  // =========================================================================
  // 60 FPS RENDERING LOOP & ANNOTATIONS
  // =========================================================================
  renderCanvasFrame() {
    if (!this.videoEl || !this.overlayCanvas || !this.ctx) return;

    const vidW = this.videoEl.videoWidth || this.videoEl.clientWidth || 640;
    const vidH = this.videoEl.videoHeight || this.videoEl.clientHeight || 360;

    if (this.overlayCanvas.width !== vidW || this.overlayCanvas.height !== vidH) {
      this.overlayCanvas.width = vidW;
      this.overlayCanvas.height = vidH;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, vidW, vidH);

    // 1. Render Virtual Counting Line
    this.renderCountingLine(vidW, vidH);

    // 2. Render Motion Trails (Jejak Lintasan)
    if (this.showMotionTrails) {
      this.renderMotionTrails(ctx);
    }

    // 3. Render Vehicle Bounding Boxes & Tags
    this.renderVehicleBoxes(ctx, vidW, vidH);

    // 4. Render CCTV Watermark OSD Header
    this.renderCCTVWatermark(ctx, vidW, vidH);

    // 5. Update Telemetry HUD
    this.updateTelemetryHUD();
  }

  renderCountingLine(w, h) {
    if (!this.countingLineActive) return;
    const ctx = this.ctx;
    const lineY = h * this.countingLineY;
    const isFlashing = performance.now() < this.lineFlashUntil;

    ctx.save();
    ctx.shadowBlur = isFlashing ? 28 : 12;
    ctx.shadowColor = isFlashing ? '#fde047' : '#38bdf8';
    ctx.strokeStyle = isFlashing ? '#fef08a' : 'rgba(56, 189, 248, 0.9)';
    ctx.lineWidth = isFlashing ? 4.5 : 2.5;
    ctx.setLineDash([14, 8]);

    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(w, lineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Line Label & Drag Handle
    ctx.fillStyle = isFlashing ? '#fef08a' : '#38bdf8';
    ctx.font = '700 11.5px "JetBrains Mono", monospace';
    const tagText = isFlashing ? '⚡ KENDARAAN TERHITUNG' : '⮞ GARIS DETEKSI SURVEI LALU LINTAS';
    ctx.fillText(tagText, 18, lineY - 8);

    // Handle Grip Pill at right side
    ctx.fillStyle = isFlashing ? '#fde047' : '#0284c7';
    ctx.beginPath();
    ctx.roundRect(w - 110, lineY - 10, 95, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillText('↕ GESER GARIS', w - 102, lineY + 4);

    ctx.restore();
  }

  renderMotionTrails(ctx) {
    ctx.save();
    for (const [id, track] of this.trackedVehicles.entries()) {
      if (track.history.length < 2) continue;
      const cfg = this.classConfig[track.class] || { color: '#38bdf8' };

      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 1; i < track.history.length; i++) {
        const [x0, y0] = track.history[i - 1];
        const [x1, y1] = track.history[i];
        const alpha = (i / track.history.length) * 0.75;
        ctx.strokeStyle = cfg.color;
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  renderVehicleBoxes(ctx, w, h) {
    const now = performance.now();

    for (const [id, track] of this.trackedVehicles.entries()) {
      if (!track.bbox) continue;
      const [x, y, width, height] = track.bbox;
      const cfg = this.classConfig[track.class] || { label: track.class, color: '#38bdf8' };
      const color = cfg.color;

      ctx.save();

      // 1. Neon Glowing Bounding Box
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 5);
      ctx.stroke();

      // 2. High-Tech Corner Brackets
      const bLen = Math.min(18, width * 0.25, height * 0.25);
      ctx.lineWidth = 3.5;
      ctx.shadowBlur = 14;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(x, y + bLen); ctx.lineTo(x, y); ctx.lineTo(x + bLen, y);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(x + width - bLen, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + bLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(x, y + height - bLen); ctx.lineTo(x, y + height); ctx.lineTo(x + bLen, y + height);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(x + width - bLen, y + height); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width, y + height - bLen);
      ctx.stroke();

      // 3. Centroid Dot
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // 4. Label Badge Construction
      const scorePct = `${Math.round(track.score * 100)}%`;
      let labelText = `${cfg.label} ${scorePct}`;

      if (this.showDirectionArrow && track.dir) {
        const arrow = track.dir === 'up' ? '⬆️' : '⬇️';
        labelText = `${arrow} ${labelText}`;
      }

      if (this.showSpeedEstimate && track.speedKmh) {
        labelText += ` • ~${track.speedKmh} km/h`;
      }

      ctx.font = '600 12px "Outfit", sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const tagW = textWidth + 16;
      const tagH = 22;
      const tagX = Math.max(0, x);
      const tagY = y > 26 ? y - tagH - 4 : y + height + 4;

      // Tag Background
      ctx.fillStyle = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 4);
      ctx.fill();

      // Tag Text
      ctx.fillStyle = '#0f172a';
      ctx.shadowBlur = 0;
      ctx.fillText(labelText, tagX + 8, tagY + 15);

      ctx.restore();
    }
  }

  renderCCTVWatermark(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(w - 290, h - 34, 275, 24);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 10.5px "JetBrains Mono", monospace';
    ctx.fillText('🔴 SMCT-BDG-SP3-LEDENG • CCTV AI', w - 280, h - 18);
    ctx.restore();
  }

  // =========================================================================
  // INTERACTIVE VIRTUAL LINE DRAGGING
  // =========================================================================
  handleCanvasMouseDown(e) {
    if (!this.overlayCanvas) return;
    const rect = this.overlayCanvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const canvasH = rect.height;
    const lineY = canvasH * this.countingLineY;

    if (Math.abs(mouseY - lineY) < 18) {
      this.isDraggingLine = true;
      this.overlayCanvas.style.cursor = 'ns-resize';
    }
  }

  handleCanvasMouseMove(e) {
    if (!this.overlayCanvas) return;
    const rect = this.overlayCanvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const canvasH = rect.height;
    const lineY = canvasH * this.countingLineY;

    if (this.isDraggingLine) {
      const newYPct = Math.max(0.12, Math.min(0.88, mouseY / canvasH));
      this.countingLineY = newYPct;

      const slider = document.getElementById('ai-line-slider');
      const valTxt = document.getElementById('ai-line-val');
      const roundPct = Math.round(newYPct * 100);
      if (slider) slider.value = roundPct;
      if (valTxt) valTxt.textContent = `${roundPct}%`;
    } else {
      if (Math.abs(mouseY - lineY) < 18) {
        this.overlayCanvas.style.cursor = 'ns-resize';
      } else {
        this.overlayCanvas.style.cursor = 'default';
      }
    }
  }

  handleCanvasMouseUp() {
    if (this.isDraggingLine) {
      this.isDraggingLine = false;
      if (this.overlayCanvas) this.overlayCanvas.style.cursor = 'default';
    }
  }

  // =========================================================================
  // UI TIMELINE & TELEMETRY UPDATES
  // =========================================================================
  updateTimelineUI() {
    if (!this.videoEl) return;

    // Scrubber update
    const scrubber = document.getElementById('ai-video-scrubber');
    const timeLabel = document.getElementById('ai-video-time');

    if (this.videoEl.duration) {
      const pct = (this.videoEl.currentTime / this.videoEl.duration) * 100;
      if (scrubber && !this.isDraggingLine) {
        scrubber.value = pct;
      }
      if (timeLabel) {
        timeLabel.textContent = `${this.formatTime(this.videoEl.currentTime)} / ${this.formatTime(this.videoEl.duration)}`;
      }
    }

    // Play/Pause button sync
    this.updatePlayBtnIcon(!this.videoEl.paused);
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  updateTelemetryHUD() {
    const now = performance.now();
    const dt = now - this.lastRenderTime;
    this.lastRenderTime = now;
    this.fps = Math.round(1000 / (dt || 16.6));

    const fpsEl = document.getElementById('ai-fps-counter');
    const latEl = document.getElementById('ai-lat-counter');
    const onScreenEl = document.getElementById('ai-onscreen-counter');

    if (fpsEl) fpsEl.textContent = `${this.fps} FPS`;
    if (latEl) latEl.textContent = `${this.latency} ms`;
    if (onScreenEl) onScreenEl.textContent = `${this.activeDetections.length}`;
  }

  updateCounterBadges() {
    const totalEl = document.getElementById('cnt-total');
    const dirUpEl = document.getElementById('cnt-dir-up');
    const dirDownEl = document.getElementById('cnt-dir-down');

    const carEl = document.getElementById('cnt-car');
    const motorEl = document.getElementById('cnt-motor');
    const busEl = document.getElementById('cnt-bus');
    const truckEl = document.getElementById('cnt-truck');
    const personEl = document.getElementById('cnt-person');

    if (totalEl) totalEl.textContent = this.counts.total;
    if (dirUpEl) dirUpEl.textContent = this.counts.dirUp;
    if (dirDownEl) dirDownEl.textContent = this.counts.dirDown;

    if (carEl) carEl.textContent = this.counts.car;
    if (motorEl) motorEl.textContent = this.counts.motorcycle;
    if (busEl) busEl.textContent = this.counts.bus;
    if (truckEl) truckEl.textContent = this.counts.truck;
    if (personEl) personEl.textContent = this.counts.person;
  }

  resetCounters() {
    this.counts = { total: 0, dirUp: 0, dirDown: 0, car: 0, motorcycle: 0, bus: 0, truck: 0, person: 0, bicycle: 0 };
    this.trackedVehicles.clear();
    this.updateCounterBadges();
    this.addLogEvent('Data hitungan survei lalu lintas di-reset ke 0.');
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
    csvContent += 'Kategori,Label,Jumlah_Terhitung,Keterangan\n';
    csvContent += `total,Total Kendaraan Melintas,${this.counts.total},Semua Kategori\n`;
    csvContent += `dir_up,Arah Lembang (Utara),${this.counts.dirUp},Arus Menjauh\n`;
    csvContent += `dir_down,Arah Bandung (Selatan),${this.counts.dirDown},Arus Mendekat\n`;
    csvContent += `car,Mobil,${this.counts.car},Roda 4 Pribadi/Taksi\n`;
    csvContent += `motorcycle,Sepeda Motor,${this.counts.motorcycle},Roda 2\n`;
    csvContent += `bus,Angkot / Bus,${this.counts.bus},Angkutan Umum\n`;
    csvContent += `truck,Truk,${this.counts.truck},Kendaraan Berat\n`;
    csvContent += `person,Pejalan Kaki,${this.counts.person},Pedestrian\n\n`;

    csvContent += 'Waktu_Kejadian,Aktivitas_Deteksi_Survei\n';
    this.eventLogs.forEach(row => {
      csvContent += `"${row.time}","${row.message.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `survei_lalin_setiabudi_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.addLogEvent('Laporan survei CSV berhasil diunduh.');
  }

  captureSnapshot() {
    if (!this.overlayCanvas) return;

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
    link.download = `cctv_ai_survei_${Date.now()}.png`;
    link.href = image;
    link.click();
    this.addLogEvent('Tangkapan layar deteksi AI berhasil disimpan.');
  }
}
