import * as ort from 'onnxruntime-web/webgpu';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export class VehicleDetector {
  constructor(app) {
    this.app = app;
    this.yoloSession = null;
    this.fallbackModel = null;
    this.engineType = 'yolo'; // 'yolo' | 'coco'
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

    // YOLO Pre-processing Offscreen Canvas (640x640 with proper letterboxing)
    this.yoloCanvas = document.createElement('canvas');
    this.yoloCanvas.width = 640;
    this.yoloCanvas.height = 640;
    this.yoloCtx = this.yoloCanvas.getContext('2d', { willReadFrequently: true });

    // Pre-allocated Float32Array buffer (avoids 4.8MB garbage collection per frame!)
    this.floatArr = new Float32Array(3 * 640 * 640);

    // Letterbox metadata for current frame
    this.letterbox = { scale: 1, padX: 0, padY: 0 };

    // Detection & Loop State
    this.isRunning = false;
    this.aiDetectionEnabled = true;
    this.isInferring = false;
    this.renderAnimId = null;
    this.inferenceTimeout = null;

    this.currentSource = 'file';
    this.activeFileName = '';
    this.webcamStream = null;
    this.live3dStream = null;

    // Dedicated Web Worker for Offloaded YOLO Inference (Main Thread 60 FPS unblocked)
    this.worker = null;
    this.isWorkerBusy = false;
    this.workerFrameTimeout = null;
    this.forceFrameInference = false;

    // Sliding Window FPS Metering (smooth 60 FPS readout without jitter)
    this.fpsFrameCount = 0;
    this.fpsLastUpdate = performance.now();
    this.modelVersion = 'YOLOv26';

    // Default Confidence: 18% (Ultra-responsive for traffic CCTV surveillance)
    this.confidenceThreshold = 0.18;
    this.showTrails = false;
    this.showSpeed = false;
    this.lastRenderTime = performance.now();
    this.fps = 60;
    this.latency = 0;
    this.activeDetections = [];

    // Purely automatic vehicle counting without lines
    this.countingLineActive = false;
    this.lastVideoTime = null;
    this.trackedVehicles = new Map(); // id -> { id, cx, cy, w, h, vx, vy, class, score, lastSeen, counted }
    this.nextTrackId = 1;

    // Cumulative Counts (Total, Mobil, Sepeda Motor)
    this.counts = {
      total: 0,
      car: 0,
      motorcycle: 0
    };

    // Detection Event Log
    this.eventLogs = [];

    // Target Class Configurations: Only Mobil and Sepeda Motor
    this.classConfig = {
      car: { label: 'Mobil', color: '#38bdf8', icon: 'fa-car' },
      motorcycle: { label: 'Sepeda Motor', color: '#fb923c', icon: 'fa-motorcycle' }
    };

    // Demo Canvas Generation
    this.demoCanvas = null;
    this.demoCtx = null;
    this.demoVehicles = [];
    this.demoStream = null;

    // Web Audio Chime
    this.audioCtx = null;

    this.initDOM();
  }

  // =========================================================================
  // BULLETPROOF ULTRALYTICS YOLOv26 ONNX MODEL LOADER & WEB WORKER PIPELINE
  // =========================================================================
  async loadModel() {
    if (this.isModelReady || this.isLoadingModel) return;
    this.isLoadingModel = true;
    this.updateStatusBadge('Memuat Model YOLOv26 AI...', 'loading');

    const yolo26ModelUrl = `${window.location.origin}/models/yolov26n.onnx`;
    const yolo8ModelUrl = `${window.location.origin}/models/yolov8n.onnx`;

    // 1. Preferred High-Performance: Dedicated Web Worker with YOLOv26 (60 FPS unblocked!)
    try {
      if (typeof Worker !== 'undefined') {
        let workerReady = false;
        try {
          workerReady = await this.initWorker(yolo26ModelUrl);
        } catch (err26) {
          console.warn('YOLOv26 worker init failed, mencoba fallback YOLOv8:', err26);
          try {
            workerReady = await this.initWorker(yolo8ModelUrl);
          } catch (err8) {
            console.warn('YOLOv8 worker init failed:', err8);
          }
        }

        if (workerReady) {
          this.engineType = 'yolo_worker';
          this.isModelReady = true;
          this.isLoadingModel = false;
          const label = this.modelVersion || 'YOLOv26';
          this.updateStatusBadge(`${label} AI Aktif (60 FPS Worker)`, 'ready');
          this.addLogEvent(`Model Ultralytics ${label} Nano (NMS-Free End-to-End) aktif via Web Worker (60 FPS).`);
          if (this.videoEl && !this.videoEl.paused) {
            this.startDetection();
          }
          return;
        }
      }
    } catch (workerErr) {
      console.warn('Web Worker initialization failed, fallback ke Main Thread:', workerErr);
    }

    // 2. Fallback: Main Thread ONNX WebAssembly Session (YOLOv26 / YOLOv8)
    try {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;

      try {
        this.yoloSession = await ort.InferenceSession.create(yolo26ModelUrl, {
          executionProviders: ['webgpu', 'webgl', 'wasm'],
          graphOptimizationLevel: 'all'
        });
        this.modelVersion = 'YOLOv26';
      } catch (err26Main) {
        console.warn('YOLOv26 main-thread failed, fallback to YOLOv8:', err26Main);
        this.yoloSession = await ort.InferenceSession.create(yolo8ModelUrl, {
          executionProviders: ['webgpu', 'webgl', 'wasm'],
          graphOptimizationLevel: 'all'
        });
        this.modelVersion = 'YOLOv8';
      }

      this.engineType = 'yolo';
      this.isModelReady = true;
      this.isLoadingModel = false;
      this.updateStatusBadge(`${this.modelVersion} AI Aktif (ONNX)`, 'ready');
      this.addLogEvent(`Model Ultralytics ${this.modelVersion} Nano aktif via ONNX Runtime.`);
      if (this.videoEl && !this.videoEl.paused) {
        this.startDetection();
      }
      return;
    } catch (yoloErr) {
      console.warn('YOLO ONNX fallback ke Engine Lokal:', yoloErr);
    }

    // 3. Fallback: Local COCO-SSD Engine
    try {
      await tf.setBackend('cpu');
      await tf.ready();
      const fallbackUrl = `${window.location.origin}/models/ssdlite_mobilenet_v2/model.json`;
      this.fallbackModel = await cocoSsd.load({ modelUrl: fallbackUrl });
      this.engineType = 'coco';
      this.isModelReady = true;
      this.isLoadingModel = false;
      this.updateStatusBadge('AI Vision Aktif (Local Engine)', 'ready');
      this.addLogEvent('Fallback engine aktif.');
      if (this.videoEl && !this.videoEl.paused) {
        this.startDetection();
      }
    } catch (err) {
      console.error('Fatal error loading model:', err);
      this.isLoadingModel = false;
      this.updateStatusBadge('Gagal Memuat Model', 'error');
      this.addLogEvent('Gagal memuat model: ' + err.message);
    }
  }

  initWorker(modelUrl) {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(new URL('./yoloWorker.js', import.meta.url), { type: 'module' });

        const timer = setTimeout(() => {
          reject(new Error('Inisialisasi Web Worker timeout'));
        }, 60000);

        this.worker.onmessage = (e) => {
          const data = e.data;
          if (!data) return;

          if (data.type === 'INIT_SUCCESS') {
            clearTimeout(timer);
            this.modelVersion = data.modelName || 'YOLOv26';
            resolve(true);
          } else if (data.type === 'INIT_ERROR') {
            clearTimeout(timer);
            reject(new Error(data.error));
          } else if (data.type === 'DETECTIONS') {
            this.handleWorkerDetections(data);
          } else if (data.type === 'DETECT_ERROR') {
            this.isWorkerBusy = false;
            console.warn('Worker detection error:', data.error);
            this.scheduleNextWorkerFrame(60);
          }
        };

        this.worker.onerror = (err) => {
          clearTimeout(timer);
          reject(err);
        };

        this.worker.postMessage({ type: 'INIT', modelUrl });
      } catch (err) {
        reject(err);
      }
    });
  }

  async dispatchNextWorkerFrame() {
    if (!this.isRunning || !this.isModelReady || !this.aiDetectionEnabled) return;
    if (this.engineType !== 'yolo_worker' || !this.worker) return;
    if (this.isWorkerBusy) return;

    if (!this.videoEl || this.videoEl.readyState < 2) {
      this.scheduleNextWorkerFrame(60);
      return;
    }

    if (this.videoEl.paused && !this.forceFrameInference) {
      this.scheduleNextWorkerFrame(120);
      return;
    }
    this.forceFrameInference = false;

    this.isWorkerBusy = true;
    const captureMeta = {
      wallTime: performance.now(),
      videoTime: (!isNaN(this.videoEl.currentTime)) ? this.videoEl.currentTime : null,
      vidW: this.videoEl.videoWidth || 640,
      vidH: this.videoEl.videoHeight || 360
    };

    try {
      // Transfer frame to worker zero-copy via createImageBitmap
      const bitmap = await createImageBitmap(this.videoEl);
      this.worker.postMessage({
        type: 'DETECT',
        bitmap,
        captureMeta,
        confThreshold: this.confidenceThreshold
      }, [bitmap]);
    } catch (err) {
      this.isWorkerBusy = false;
      this.scheduleNextWorkerFrame(60);
    }
  }

  scheduleNextWorkerFrame(delay = 0) {
    if (!this.isRunning || this.engineType !== 'yolo_worker') return;
    if (this.workerFrameTimeout) clearTimeout(this.workerFrameTimeout);

    if (delay === 0 && this.videoEl && typeof this.videoEl.requestVideoFrameCallback === 'function' && !this.videoEl.paused) {
      this.videoEl.requestVideoFrameCallback(() => {
        this.dispatchNextWorkerFrame();
      });
    } else {
      this.workerFrameTimeout = setTimeout(() => {
        this.dispatchNextWorkerFrame();
      }, delay);
    }
  }

  handleWorkerDetections(data) {
    this.isWorkerBusy = false;
    this.latency = data.latency || 0;
    this.activeDetections = data.detections || [];

    const vidW = data.captureMeta.vidW || (this.videoEl ? this.videoEl.videoWidth : 640);
    const vidH = data.captureMeta.vidH || (this.videoEl ? this.videoEl.videoHeight : 360);

    // Update tracking and automatic vehicle counting
    this.processTrackingAndCounting(this.activeDetections, vidW, vidH, data.captureMeta);

    // Pipelined: immediately request next frame without idle gap
    this.scheduleNextWorkerFrame(0);
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
          this.forceFrameInference = true;
          if (this.engineType === 'yolo_worker') this.scheduleNextWorkerFrame(0);
        }
      });
    }

    const scrubber = document.getElementById('ai-video-scrubber');
    if (scrubber && this.videoEl) {
      scrubber.addEventListener('input', (e) => {
        if (this.videoEl && this.videoEl.duration) {
          const seekTime = (parseFloat(e.target.value) / 100) * this.videoEl.duration;
          this.videoEl.currentTime = seekTime;
          this.forceFrameInference = true;
          if (this.engineType === 'yolo_worker') this.scheduleNextWorkerFrame(0);
        }
      });
    }

    // Playback Speed Buttons
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

    // 5. Presets (Sensitif Motor: 18%, Standar: 25%, Ketat: 40%)
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

    // 7. AI Play/Pause Inference Toggle
    const aiToggleBtn = document.getElementById('btn-ai-play-pause');
    if (aiToggleBtn) {
      aiToggleBtn.addEventListener('click', () => this.toggleAIInference());
    }

    // Optional Speed HUD toggle
    const speedBtn = document.getElementById('btn-ai-toggle-speed');
    if (speedBtn) {
      speedBtn.addEventListener('click', () => {
        this.showSpeed = !this.showSpeed;
        speedBtn.classList.toggle('active-toggle', this.showSpeed);
        this.addLogEvent(`Estimasi Kecepatan Kendaraan: ${this.showSpeed ? 'AKTIF' : 'NONAKTIF'}`);
      });
    }

    // 8. Reset, Snapshot, CSV Export
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

    let conf = 18;
    if (preset === 'sensitive') conf = 12;
    else if (preset === 'strict') conf = 30;

    this.confidenceThreshold = conf / 100;
    if (slider) slider.value = conf;
    if (valText) valText.textContent = `${conf}%`;
    this.addLogEvent(`Sensitivitas YOLO diatur ke: ${preset.toUpperCase()} (${conf}%)`);
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

    if (this.uploadContainer) {
      if (sourceKey === 'file') {
        const hasLoadedVideo = this.videoEl && this.videoEl.src && !this.videoEl.srcObject;
        this.uploadContainer.style.display = hasLoadedVideo ? 'none' : 'flex';
      } else {
        this.uploadContainer.style.display = 'none';
      }
    }

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
          this.addLogEvent('Silakan pilih file video rekaman CCTV.');
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
      this.addLogEvent(`Video dimuat: ${file.name} (${durSec}s). Deteksi YOLO berjalan.`);
    };
  }

  toggleVideoPlayback() {
    if (!this.videoEl) return;
    if (this.videoEl.paused) {
      this.videoEl.play().catch(() => {});
      this.updatePlayBtnIcon(true);
      if (this.engineType === 'yolo_worker') {
        this.forceFrameInference = true;
        this.scheduleNextWorkerFrame(0);
      }
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
        this.updateStatusBadge('YOLO Mendeteksi...', 'ready');
        if (this.engineType === 'yolo_worker') {
          this.forceFrameInference = true;
          this.scheduleNextWorkerFrame(0);
        } else {
          this.runInferenceLoop();
        }
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
      this.live3dStream = canvas.captureStream ? canvas.captureStream(60) : null;

      if (this.live3dStream && this.videoEl) {
        this.videoEl.src = '';
        this.videoEl.srcObject = this.live3dStream;
        this.videoEl.muted = true;
        this.videoEl.playsInline = true;
        this.videoEl.play().catch(() => {});
        this.startDetection();
        this.addLogEvent('Terhubung ke feed Kamera 3D Simulasi (60 FPS).');
      } else {
        this.setupDemoStream();
      }
    } catch (e) {
      console.warn('captureStream fallback to demo:', e);
      this.setupDemoStream();
    }
  }

  setupWebcamStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Perangkat webcam tidak didukung.');
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
      this.addLogEvent('Terhubung ke Webcam.');
    }).catch(err => {
      console.error('Camera error:', err);
      alert('Tidak dapat mengakses webcam: ' + err.message);
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
      { x: 620, y: 280, speed: 3.0, type: 'car', color: '#059669', width: 95, height: 210 },
      { x: 740, y: 50, speed: 4.2, type: 'motorcycle', color: '#d97706', width: 45, height: 85 },
      { x: 440, y: 390, speed: 2.6, type: 'car', color: '#7c3aed', width: 105, height: 240 },
      { x: 630, y: -90, speed: 4.0, type: 'motorcycle', color: '#2563eb', width: 45, height: 85 }
    ];
  }

  updateDemoFrame() {
    if (!this.demoCtx) return;
    const ctx = this.demoCtx;
    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, 260, h);
    ctx.fillRect(w - 260, 0, 260, h);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([35, 25]);
    ctx.beginPath();
    ctx.moveTo(500, 0); ctx.lineTo(500, h);
    ctx.moveTo(780, 0); ctx.lineTo(780, h);
    ctx.stroke();

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(640, 0); ctx.lineTo(640, h);
    ctx.stroke();

    for (const v of this.demoVehicles) {
      v.y += v.speed * 2.2;
      if (v.y > h + 250) {
        v.y = -260;
        v.x = 320 + Math.random() * 600;
      }

      ctx.save();
      ctx.translate(v.x, v.y);

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(-v.width / 2 - 4, -v.height / 2 + 6, v.width + 8, v.height + 8, 8);
      ctx.fill();

      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.roundRect(-v.width / 2, -v.height / 2, v.width, v.height, 10);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      if (v.type === 'car') {
        ctx.fillRect(-v.width / 2 + 8, -v.height / 2 + 18, v.width - 16, 26);
        ctx.fillRect(-v.width / 2 + 8, v.height / 2 - 32, v.width - 16, 20);
      } else if (v.type === 'motorcycle') {
        ctx.beginPath();
        ctx.arc(0, -10, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  setupDemoStream() {
    if (!this.demoCanvas) this.initDemoStream();
    this.demoStream = this.demoCanvas.captureStream(60);
    this.videoEl.src = '';
    this.videoEl.srcObject = this.demoStream;
    this.videoEl.play().catch(() => {});
    this.startDetection();
    this.addLogEvent('Menjalankan rekaman CCTV Demo (60 FPS).');
  }

  // =========================================================================
  // DECOUPLED LOOPS: 60 FPS RENDER & NON-BLOCKING INFERENCE
  // =========================================================================
  startDetection() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastRenderTime = performance.now();
    this.fpsFrameCount = 0;
    this.fpsLastUpdate = performance.now();

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

    if (this.engineType === 'yolo_worker') {
      this.scheduleNextWorkerFrame(0);
    } else {
      this.runInferenceLoop();
    }
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
    if (this.workerFrameTimeout) {
      clearTimeout(this.workerFrameTimeout);
      this.workerFrameTimeout = null;
    }
    this.isWorkerBusy = false;
    if (this.ctx && this.overlayCanvas) {
      this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }

  async runInferenceLoop() {
    if (!this.isRunning) return;

    if (this.isModelReady && this.aiDetectionEnabled && !this.isInferring) {
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
      // 0ms timeout: execute next inference loop with zero delay
      this.inferenceTimeout = setTimeout(() => this.runInferenceLoop(), 0);
    }
  }

  // =========================================================================
  // ADVANCED LETTERBOXED YOLOv8 INFERENCE WITH MAXIMUM MOTORCYCLE RESPONSIVENESS
  // =========================================================================
  async detectFrame() {
    if (!this.videoEl || this.videoEl.readyState < 2) return;

    const vidW = this.videoEl.videoWidth || 640;
    const vidH = this.videoEl.videoHeight || 360;

    // Capture precise timestamps at the exact instant the frame is captured
    const captureMeta = {
      wallTime: performance.now(),
      videoTime: (this.videoEl && !isNaN(this.videoEl.currentTime)) ? this.videoEl.currentTime : null
    };

    let processedDetections = [];

    // Calculate dynamic thresholds:
    // Motorcycles are smaller and have lower confidence in CCTV -> highly sensitive threshold
    const motoThreshold = Math.max(0.06, this.confidenceThreshold * 0.45);
    const carThreshold = Math.max(0.16, this.confidenceThreshold * 0.85);

    if (this.engineType === 'yolo' && this.yoloSession) {
      // 1. Direct High-Speed Resize to 640x640 (Native YOLOS/DETR format)
      this.yoloCtx.drawImage(this.videoEl, 0, 0, 640, 640);

      const imgData = this.yoloCtx.getImageData(0, 0, 640, 640).data;

      // 2. Pre-process to pre-allocated Float32Array [1, 3, 640, 640]
      const inv255 = 1.0 / 255.0;
      const numPixels = 640 * 640;
      for (let i = 0; i < numPixels; i++) {
        const i4 = i * 4;
        this.floatArr[i] = imgData[i4] * inv255;
        this.floatArr[numPixels + i] = imgData[i4 + 1] * inv255;
        this.floatArr[2 * numPixels + i] = imgData[i4 + 2] * inv255;
      }

      const inputTensor = new ort.Tensor('float32', this.floatArr, [1, 3, 640, 640]);
      const inputName = (this.yoloSession.inputNames && this.yoloSession.inputNames[0]) || 'pixel_values';
      const feeds = {};
      feeds[inputName] = inputTensor;
      const results = await this.yoloSession.run(feeds);

      const candidates = [];
      const isYolo26 = results.logits && results.pred_boxes;

      if (isYolo26) {
        // ===================================================================
        // ULTRALYTICS YOLOv26: NMS-FREE END-TO-END DECODER (300 QUERIES)
        // ===================================================================
        const logits = results.logits.data;
        const predBoxes = results.pred_boxes.data;
        const sigmoid = (x) => 1.0 / (1.0 + Math.exp(-x));

        for (let i = 0; i < 300; i++) {
          const off = i * 80;
          const personScore = sigmoid(logits[off + 0]);
          const bicycleScore = sigmoid(logits[off + 1]);
          const carScore = sigmoid(logits[off + 2]);
          const motoScore = sigmoid(logits[off + 3]);
          const busScore = sigmoid(logits[off + 5]);
          const truckScore = sigmoid(logits[off + 7]);

          const autoScore = Math.max(carScore, busScore, truckScore);
          const twoWheelerScore = Math.max(motoScore, bicycleScore);

          const riderFusion = (personScore >= 0.08 && (twoWheelerScore >= 0.02 || personScore >= 0.14));
          const effectiveMotoScore = riderFusion
            ? Math.max(twoWheelerScore, personScore * 0.90)
            : twoWheelerScore;

          const boxOff = i * 4;
          const cx_norm = predBoxes[boxOff + 0];
          const cy_norm = predBoxes[boxOff + 1];
          const w_norm = predBoxes[boxOff + 2];
          const h_norm = predBoxes[boxOff + 3];

          const aspectRatio = w_norm / Math.max(0.001, h_norm);

          let cls = null;
          let score = 0;

          const isTwoWheeler = effectiveMotoScore >= motoThreshold;
          const isAutomobile = autoScore >= carThreshold;

          if (isTwoWheeler && (effectiveMotoScore >= autoScore * 0.65 || riderFusion || aspectRatio < 1.15)) {
            cls = 'motorcycle';
            score = effectiveMotoScore;
          } else if (isAutomobile && (autoScore > effectiveMotoScore || aspectRatio >= 0.70)) {
            cls = 'car';
            score = autoScore;
          } else if (isTwoWheeler) {
            cls = 'motorcycle';
            score = effectiveMotoScore;
          } else if (isAutomobile) {
            cls = 'car';
            score = autoScore;
          }

          if (cls) {
            const realX = Math.max(0, (cx_norm - w_norm / 2) * vidW);
            const realY = Math.max(0, (cy_norm - h_norm / 2) * vidH);
            const realW = Math.min(vidW - realX, w_norm * vidW);
            const realH = Math.min(vidH - realY, h_norm * vidH);

            candidates.push({
              bbox: [realX, realY, realW, realH],
              score: score,
              class: cls
            });
          }
        }
      } else if (results.output0) {
        // ===================================================================
        // ULTRALYTICS YOLOv8 FALLBACK: GRID-BASED RAW ANCHOR DECODER (8400 COLS)
        // ===================================================================
        const outputData = results.output0.data;
        const numCandidates = 8400;

        for (let c = 0; c < numCandidates; c++) {
          const personScore = outputData[4 * numCandidates + c];
          const bicycleScore = outputData[5 * numCandidates + c];
          const carScore = outputData[6 * numCandidates + c];
          const motoScore = outputData[7 * numCandidates + c];
          const busScore = outputData[9 * numCandidates + c];
          const truckScore = outputData[11 * numCandidates + c];

          const autoScore = Math.max(carScore, busScore, truckScore);
          const twoWheelerScore = Math.max(motoScore, bicycleScore);

          const riderFusion = (personScore >= 0.08 && (twoWheelerScore >= 0.02 || personScore >= 0.14));
          const effectiveMotoScore = riderFusion 
            ? Math.max(twoWheelerScore, personScore * 0.90) 
            : twoWheelerScore;

          const w_raw = outputData[2 * numCandidates + c];
          const h_raw = outputData[3 * numCandidates + c];
          const aspectRatio = w_raw / Math.max(1, h_raw);

          let cls = null;
          let score = 0;

          const isTwoWheeler = effectiveMotoScore >= motoThreshold;
          const isAutomobile = autoScore >= carThreshold;

          if (isTwoWheeler && (effectiveMotoScore >= autoScore * 0.65 || riderFusion || aspectRatio < 1.15)) {
            cls = 'motorcycle';
            score = effectiveMotoScore;
          } else if (isAutomobile && (autoScore > effectiveMotoScore || aspectRatio >= 0.70)) {
            cls = 'car';
            score = autoScore;
          } else if (isTwoWheeler) {
            cls = 'motorcycle';
            score = effectiveMotoScore;
          } else if (isAutomobile) {
            cls = 'car';
            score = autoScore;
          }

          if (cls) {
            const cx_norm = outputData[0 * numCandidates + c] / 640;
            const cy_norm = outputData[1 * numCandidates + c] / 640;
            const w_norm = w_raw / 640;
            const h_norm = h_raw / 640;

            const realX = Math.max(0, (cx_norm - w_norm / 2) * vidW);
            const realY = Math.max(0, (cy_norm - h_norm / 2) * vidH);
            const realW = Math.min(vidW - realX, w_norm * vidW);
            const realH = Math.min(vidH - realY, h_norm * vidH);

            candidates.push({
              bbox: [realX, realY, realW, realH],
              score: score,
              class: cls
            });
          }
        }
      }

      // 4. Non-Maximum Suppression (NMS) with Cross-Class Duplicate Elimination
      processedDetections = this.applyNMS(candidates, 0.45);
    } else if (this.fallbackModel) {
      // Fallback engine
      const predictions = await this.fallbackModel.detect(this.videoEl, 25, motoThreshold);
      for (const p of predictions) {
        let mappedClass = null;
        if ((p.class === 'car' || p.class === 'truck' || p.class === 'bus') && p.score >= carThreshold) {
          mappedClass = 'car';
        } else if ((p.class === 'motorcycle' || p.class === 'bicycle' || p.class === 'person') && p.score >= motoThreshold) {
          mappedClass = 'motorcycle';
        }

        if (mappedClass) {
          processedDetections.push({
            class: mappedClass,
            score: p.score,
            bbox: p.bbox
          });
        }
      }
    }

    this.activeDetections = processedDetections;

    // 5. Track with Zero-Delay Velocity Prediction and Automatic Counting
    this.processTrackingAndCounting(processedDetections, vidW, vidH, captureMeta);
  }

  applyNMS(boxes, iouThreshold = 0.45) {
    boxes.sort((a, b) => b.score - a.score);
    const selected = [];

    for (const b of boxes) {
      let overlap = false;
      for (const s of selected) {
        const iou = this.computeIoU(s.bbox, b.bbox);
        // Suppress same class
        if (s.class === b.class && iou > iouThreshold) {
          overlap = true;
          break;
        }
        // Suppress overlapping cross-class duplicate bounding boxes (same vehicle detected twice)
        if (s.class !== b.class && iou > 0.52) {
          overlap = true;
          break;
        }
      }
      if (!overlap) selected.push(b);
    }
    return selected;
  }

  computeIoU(b1, b2) {
    const x1 = Math.max(b1[0], b2[0]);
    const y1 = Math.max(b1[1], b2[1]);
    const x2 = Math.min(b1[0] + b1[2], b2[0] + b2[2]);
    const y2 = Math.min(b1[1] + b1[3], b2[1] + b2[3]);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    const inter = w * h;
    const union = b1[2] * b1[3] + b2[2] * b2[3] - inter;
    return union <= 0 ? 0 : inter / union;
  }

  // =========================================================================
  // PIXEL-PERFECT CANVAS TO VIDEO FRAME SYNCHRONIZATION
  // =========================================================================
  syncCanvasToVideo() {
    if (!this.videoEl || !this.overlayCanvas) return;
    const vidW = this.videoEl.videoWidth || this.videoEl.clientWidth || 640;
    const vidH = this.videoEl.videoHeight || this.videoEl.clientHeight || 360;

    const wrapper = this.viewportWrapper || this.videoEl.parentElement;
    if (!wrapper) return;
    const wrapW = wrapper.clientWidth;
    const wrapH = wrapper.clientHeight;
    if (!wrapW || !wrapH) return;

    // Accurate letterbox/pillarbox calculation matching CSS object-fit: contain
    const videoAspect = vidW / vidH;
    const wrapAspect = wrapW / wrapH;

    let renderW, renderH, renderX, renderY;
    if (wrapAspect > videoAspect) {
      // Black bars on left & right
      renderH = wrapH;
      renderW = wrapH * videoAspect;
      renderY = 0;
      renderX = (wrapW - renderW) / 2;
    } else {
      // Black bars on top & bottom
      renderW = wrapW;
      renderH = wrapW / videoAspect;
      renderX = 0;
      renderY = (wrapH - renderH) / 2;
    }

    if (this.overlayCanvas.width !== vidW || this.overlayCanvas.height !== vidH) {
      this.overlayCanvas.width = vidW;
      this.overlayCanvas.height = vidH;
    }

    const sLeft = `${Math.round(renderX)}px`;
    const sTop = `${Math.round(renderY)}px`;
    const sW = `${Math.round(renderW)}px`;
    const sH = `${Math.round(renderH)}px`;

    if (this.overlayCanvas.style.left !== sLeft) this.overlayCanvas.style.left = sLeft;
    if (this.overlayCanvas.style.top !== sTop) this.overlayCanvas.style.top = sTop;
    if (this.overlayCanvas.style.width !== sW) this.overlayCanvas.style.width = sW;
    if (this.overlayCanvas.style.height !== sH) this.overlayCanvas.style.height = sH;
  }

  // =========================================================================
  // ZERO-LAG VELOCITY PREDICTION & SMOOTH FORWARD TRACKING
  // =========================================================================
  processTrackingAndCounting(predictions, w, h, captureMeta) {
    const now = performance.now();
    const captureVideoTime = captureMeta ? captureMeta.videoTime : null;
    const captureWallTime = captureMeta ? captureMeta.wallTime : now;

    // Reset tracking if video looped back or user scrubbed backward
    if (this.currentSource === 'file' && captureVideoTime != null) {
      if (this.lastVideoTime != null && captureVideoTime < this.lastVideoTime - 1.5) {
        this.trackedVehicles.clear();
      }
      this.lastVideoTime = captureVideoTime;
    }

    // Dynamic matching distance scaled with video resolution
    const diag = Math.hypot(w, h);
    const baseMatchDist = Math.max(140, diag * 0.13);

    const matchedTrackIds = new Set();

    for (const pred of predictions) {
      const [bx, by, bw, bh] = pred.bbox;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;

      let bestMatchId = null;
      let bestScore = Infinity;

      for (const [id, track] of this.trackedVehicles.entries()) {
        if (matchedTrackIds.has(id)) continue;

        const trackCx = track.cx;
        const trackCy = track.cy;

        const dist = Math.hypot(trackCx - cx, trackCy - cy);
        const iou = this.computeIoU(pred.bbox, [track.cx - track.w / 2, track.cy - track.h / 2, track.w, track.h]);

        const sameClass = track.class === pred.class;
        const matchThreshold = track.class === 'motorcycle'
          ? Math.max(baseMatchDist * 1.3, 200)
          : Math.max(baseMatchDist, Math.max(bw, bh) * 1.4);

        if ((sameClass && (iou > 0.08 || dist < matchThreshold)) || (!sameClass && (iou > 0.35 || dist < matchThreshold * 0.55))) {
          const score = dist - iou * 140;
          if (score < bestScore) {
            bestScore = score;
            bestMatchId = id;
          }
        }
      }

      if (bestMatchId != null) {
        matchedTrackIds.add(bestMatchId);
        const track = this.trackedVehicles.get(bestMatchId);
        track.seenCount = (track.seenCount || 1) + 1;

        // Update class consensus
        if (pred.score >= track.score * 0.85) {
          track.class = pred.class;
        }

        // Measure smooth physical displacement between detection observations
        const dx = cx - (track.lastRawX ?? cx);
        const dy = cy - (track.lastRawY ?? cy);
        const moveDist = Math.hypot(dx, dy);

        const dtSec = Math.max(0.016, (captureWallTime - (track.lastCaptureWallTime ?? (captureWallTime - 0.05))) / 1000);

        if (moveDist >= 5 && dtSec > 0.02) {
          const instVx = dx / dtSec;
          const instVy = dy / dtSec;
          track.vx = (track.vx || 0) * 0.60 + Math.max(-800, Math.min(800, instVx)) * 0.40;
          track.vy = (track.vy || 0) * 0.60 + Math.max(-800, Math.min(800, instVy)) * 0.40;
        } else if (moveDist < 3) {
          track.vx = (track.vx || 0) * 0.50;
          track.vy = (track.vy || 0) * 0.50;
        }

        // Gentle, clamped latency lead (at most 24px, zero jitter)
        const latencySec = Math.max(0, Math.min(0.20, (now - captureWallTime) / 1000));
        const leadX = Math.max(-24, Math.min(24, (track.vx || 0) * latencySec));
        const leadY = Math.max(-24, Math.min(24, (track.vy || 0) * latencySec));

        track.targetCx = cx + leadX;
        track.targetCy = cy + leadY;
        track.cx = cx;
        track.cy = cy;
        track.w = bw;
        track.h = bh;
        track.score = pred.score;
        track.lastRawX = cx;
        track.lastRawY = cy;
        track.lastCaptureWallTime = captureWallTime;
        track.lastWallTime = now;
        track.lastSeen = now;

        // Counting: confirmed after 2 frames or initial confidence >= 0.22
        if (!track.counted) {
          const totalMove = Math.hypot(cx - (track.initX ?? cx), cy - (track.initY ?? cy));
          if (track.seenCount >= 2 || totalMove >= 10 || track.score >= 0.22) {
            track.counted = true;
            this.recordCountEvent(track.class, track.score);
          }
        }
      } else {
        const newId = this.nextTrackId++;
        const newTrack = {
          id: newId,
          cx,
          cy,
          targetCx: cx,
          targetCy: cy,
          smoothCx: cx,
          smoothCy: cy,
          smoothW: bw,
          smoothH: bh,
          initX: cx,
          initY: cy,
          lastRawX: cx,
          lastRawY: cy,
          lastCaptureWallTime: captureWallTime,
          seenCount: 1,
          w: bw,
          h: bh,
          vx: 0,
          vy: 0,
          class: pred.class,
          score: pred.score,
          firstSeen: now,
          lastSeen: now,
          lastWallTime: now,
          counted: false
        };
        if (pred.score >= 0.22) {
          newTrack.counted = true;
          this.recordCountEvent(pred.class, pred.score);
        }
        this.trackedVehicles.set(newId, newTrack);
      }
    }

    // Clean up stale tracks (older than 1.8s)
    for (const [id, track] of this.trackedVehicles.entries()) {
      if (now - track.lastSeen > 1800) {
        this.trackedVehicles.delete(id);
      }
    }
  }

  recordCountEvent(category, score) {
    if (this.counts[category] !== undefined) {
      this.counts[category]++;
      this.counts.total++;
    }

    this.lineFlashUntil = performance.now() + 380;
    this.playChime();

    const cfg = this.classConfig[category] || { label: category };
    const timeStr = new Date().toLocaleTimeString('id-ID');
    this.addLogEvent(`[${timeStr}] Melintas: ${cfg.label} (${Math.round(score * 100)}%)`);

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
  // 60 FPS RENDER LOOP: PIXEL-PERFECT SYNCHRONIZED BOUNDING BOXES
  // =========================================================================
  renderCanvasFrame() {
    if (!this.videoEl || !this.overlayCanvas || !this.ctx) return;

    this.syncCanvasToVideo();

    const vidW = this.overlayCanvas.width;
    const vidH = this.overlayCanvas.height;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, vidW, vidH);

    // 1. Render Clean Bounding Boxes (Cuman Kotak Aja, Tanpa Garis!)
    this.renderVehicleBoxes(ctx, vidW, vidH);

    // 2. Update Telemetry HUD
    this.updateTelemetryHUD();
  }

  renderVehicleBoxes(ctx, w, h) {
    const now = performance.now();
    const isPlaying = this.videoEl && !this.videoEl.paused;
    const playbackRate = (this.videoEl && this.videoEl.playbackRate) ? this.videoEl.playbackRate : 1.0;

    for (const [id, track] of this.trackedVehicles.entries()) {
      const cfg = this.classConfig[track.class] || { label: track.class, color: '#38bdf8' };
      const color = cfg.color;

      // Real-Time 60 FPS forward extrapolation between worker updates
      let dt = 0;
      if (isPlaying && track.lastWallTime != null) {
        dt = Math.max(0, (now - track.lastWallTime) / 1000) * playbackRate;
        if (dt > 0.35) dt = 0.35;
      }

      const forwardX = (track.targetCx ?? track.cx) + Math.max(-18, Math.min(18, (track.vx || 0) * dt));
      const forwardY = (track.targetCy ?? track.cy) + Math.max(-18, Math.min(18, (track.vy || 0) * dt));

      // 60 FPS Smooth Position and Box Size Interpolation
      if (track.smoothCx === undefined) {
        track.smoothCx = forwardX;
        track.smoothCy = forwardY;
        track.smoothW = track.w;
        track.smoothH = track.h;
      } else {
        track.smoothCx += (forwardX - track.smoothCx) * 0.75;
        track.smoothCy += (forwardY - track.smoothCy) * 0.75;
        track.smoothW += (track.w - track.smoothW) * 0.75;
        track.smoothH += (track.h - track.smoothH) * 0.75;
      }

      const renderX = track.smoothCx - track.smoothW / 2;
      const renderY = track.smoothCy - track.smoothH / 2;

      ctx.save();

      // Clean High-Tech Bounding Box (Cuman Kotak Aja, Tanpa Garis!)
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(renderX, renderY, track.smoothW, track.smoothH, 4);
      ctx.stroke();

      // Clean Label Badge on top: Mobil or Sepeda Motor + Confidence %
      const scorePct = `${Math.round(track.score * 100)}%`;
      let speedText = '';
      if (this.showSpeed && (track.vx || track.vy)) {
        const pxPerSec = Math.hypot(track.vx || 0, track.vy || 0);
        const estKmh = Math.round((pxPerSec / 16) * 3.6);
        if (estKmh >= 5 && estKmh <= 120) {
          speedText = ` • ${estKmh} km/j`;
        }
      }
      const labelText = `${cfg.label} ${scorePct}${speedText}`;

      ctx.font = '600 12px "Outfit", sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const tagW = textWidth + 14;
      const tagH = 20;
      const tagX = Math.max(0, renderX);
      const tagY = renderY > 24 ? renderY - tagH - 2 : renderY + track.smoothH + 2;

      ctx.fillStyle = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 3);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.shadowBlur = 0;
      ctx.fillText(labelText, tagX + 7, tagY + 14);

      ctx.restore();
    }
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
    this.fpsFrameCount = (this.fpsFrameCount || 0) + 1;
    if (!this.fpsLastUpdate) this.fpsLastUpdate = now;
    const elapsed = now - this.fpsLastUpdate;
    if (elapsed >= 350) {
      this.fps = Math.round((this.fpsFrameCount * 1000) / elapsed);
      this.fpsFrameCount = 0;
      this.fpsLastUpdate = now;
    }

    const fpsEl = document.getElementById('ai-fps-counter');
    const latEl = document.getElementById('ai-lat-counter');
    const onScreenEl = document.getElementById('ai-onscreen-counter');

    if (fpsEl) fpsEl.textContent = `${this.fps || 60} FPS`;
    if (latEl) latEl.textContent = `${this.latency} ms`;
    if (onScreenEl) onScreenEl.textContent = `${this.activeDetections.length}`;
  }

  updateCounterBadges() {
    const totalEl = document.getElementById('cnt-total');
    const carEl = document.getElementById('cnt-car');
    const motorEl = document.getElementById('cnt-motor');

    if (totalEl) totalEl.textContent = this.counts.total;
    if (carEl) carEl.textContent = this.counts.car;
    if (motorEl) motorEl.textContent = this.counts.motorcycle;
  }

  resetCounters() {
    this.counts = { total: 0, car: 0, motorcycle: 0 };
    this.trackedVehicles.clear();
    this.updateCounterBadges();
    this.addLogEvent('Jumlah hitungan kendaraan di-reset ke 0.');
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
    csvContent += 'Kategori,Label,Jumlah_Terhitung\n';
    csvContent += `total,Total Semua Kendaraan,${this.counts.total}\n`;
    csvContent += `car,Mobil (Roda 4+),${this.counts.car}\n`;
    csvContent += `motorcycle,Sepeda Motor (Roda 2),${this.counts.motorcycle}\n\n`;

    csvContent += 'Waktu_Kejadian,Aktivitas_Deteksi_YOLO\n';
    this.eventLogs.forEach(row => {
      csvContent += `"${row.time}","${row.message.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `survei_yolo_setiabudi_${Date.now()}.csv`);
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
    link.download = `cctv_yolo_survei_${Date.now()}.png`;
    link.href = image;
    link.click();
    this.addLogEvent('Tangkapan layar deteksi YOLO berhasil disimpan.');
  }
}
