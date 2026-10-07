import * as ort from 'onnxruntime-web';
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

    // YOLO Pre-processing Offscreen Canvas (640x640 standard YOLO input)
    this.yoloCanvas = document.createElement('canvas');
    this.yoloCanvas.width = 640;
    this.yoloCanvas.height = 640;
    this.yoloCtx = this.yoloCanvas.getContext('2d', { willReadFrequently: true });

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

    // Performance & Telemetry
    this.confidenceThreshold = 0.35;
    this.lastRenderTime = performance.now();
    this.fps = 0;
    this.latency = 0;
    this.activeDetections = [];

    // Virtual Counting Line (Percentage from top, 0.1 - 0.9)
    this.countingLineY = 0.55;
    this.countingLineActive = true;
    this.lineFlashUntil = 0;
    this.isDraggingLine = false;

    // Tracking for Counting (Avoid duplicates)
    this.trackedVehicles = new Map(); // id -> { id, cx, cy, class, score, lastSeen, counted }
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
  // BULLETPROOF YOLOv8 ONNX MODEL LOADER
  // =========================================================================
  async loadModel() {
    if (this.isModelReady || this.isLoadingModel) return;
    this.isLoadingModel = true;
    this.updateStatusBadge('Memuat Model YOLO AI...', 'loading');

    try {
      // 1. Configure ONNX Runtime Web for bulletproof browser compatibility
      ort.env.wasm.numThreads = 1; // single-thread prevents SharedArrayBuffer / CORS header restrictions
      ort.env.wasm.simd = true;

      const yoloModelUrl = `${window.location.origin}/models/yolov8n.onnx`;

      try {
        // Attempt loading local YOLOv8 ONNX model
        this.yoloSession = await ort.InferenceSession.create(yoloModelUrl, {
          executionProviders: ['webgl', 'wasm']
        });
        this.engineType = 'yolo';
        this.isModelReady = true;
        this.isLoadingModel = false;
        this.updateStatusBadge('YOLOv8 AI Aktif (ONNX)', 'ready');
        this.addLogEvent('Model YOLOv8 Nano berhasil dimuat via ONNX Runtime. Siap mendeteksi Mobil & Motor.');
      } catch (yoloErr) {
        console.warn('YOLO ONNX gagal, beralih ke Fallback Engine Lokal:', yoloErr);

        // Fallback: Local MobileNet model
        await tf.setBackend('cpu');
        await tf.ready();
        const fallbackUrl = `${window.location.origin}/models/ssdlite_mobilenet_v2/model.json`;
        this.fallbackModel = await cocoSsd.load({ modelUrl: fallbackUrl });
        this.engineType = 'coco';
        this.isModelReady = true;
        this.isLoadingModel = false;
        this.updateStatusBadge('AI Vision Aktif (Local Engine)', 'ready');
        this.addLogEvent('Fallback engine aktif. Siap mendeteksi Mobil & Motor.');
      }

      // If video is already active, start detection immediately
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

    // 8. AI Play/Pause Inference Toggle
    const aiToggleBtn = document.getElementById('btn-ai-play-pause');
    if (aiToggleBtn) {
      aiToggleBtn.addEventListener('click', () => this.toggleAIInference());
    }

    // 9. Reset, Snapshot, CSV Export
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
    this.addLogEvent(`Sensitivitas YOLO diubah ke: ${preset.toUpperCase()} (${conf}%)`);
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
      this.addLogEvent(`Video dimuat: ${file.name} (${durSec}s). Deteksi YOLO Mobil & Motor aktif.`);
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
        this.updateStatusBadge('YOLO Mendeteksi...', 'ready');
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
        this.addLogEvent('Terhubung ke feed Kamera 3D Simulasi.');
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
    this.demoStream = this.demoCanvas.captureStream(30);
    this.videoEl.src = '';
    this.videoEl.srcObject = this.demoStream;
    this.videoEl.play().catch(() => {});
    this.startDetection();
    this.addLogEvent('Menjalankan rekaman CCTV Demo.');
  }

  // =========================================================================
  // DECOUPLED LOOPS: 60 FPS RENDER & NON-BLOCKING YOLO INFERENCE
  // =========================================================================
  startDetection() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastRenderTime = performance.now();

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
      this.inferenceTimeout = setTimeout(() => this.runInferenceLoop(), 16);
    }
  }

  // =========================================================================
  // YOLO INFERENCE PIPELINE (VEHICLE DETECTION: MOBIL & MOTOR)
  // =========================================================================
  async detectFrame() {
    if (!this.videoEl || this.videoEl.readyState < 2) return;

    const vidW = this.videoEl.videoWidth || 640;
    const vidH = this.videoEl.videoHeight || 360;

    let processedDetections = [];

    if (this.engineType === 'yolo' && this.yoloSession) {
      // 1. Draw into 640x640 canvas
      this.yoloCtx.drawImage(this.videoEl, 0, 0, 640, 640);
      const imgData = this.yoloCtx.getImageData(0, 0, 640, 640).data;

      // 2. Pre-process to Float32 Tensor [1, 3, 640, 640]
      const floatArr = new Float32Array(3 * 640 * 640);
      const numPixels = 640 * 640;
      for (let i = 0; i < numPixels; i++) {
        floatArr[i] = imgData[i * 4] / 255.0;
        floatArr[numPixels + i] = imgData[i * 4 + 1] / 255.0;
        floatArr[2 * numPixels + i] = imgData[i * 4 + 2] / 255.0;
      }

      const inputTensor = new ort.Tensor('float32', floatArr, [1, 3, 640, 640]);
      const results = await this.yoloSession.run({ images: inputTensor });
      const outputData = results.output0.data;

      // 3. Post-process: Extract Mobil and Sepeda Motor candidate boxes
      const candidates = [];
      const numCandidates = 8400;
      const scaleX = vidW / 640;
      const scaleY = vidH / 640;

      for (let c = 0; c < numCandidates; c++) {
        // COCO Classes: 2=car, 5=bus, 7=truck (Mobil) | 3=motorcycle, 1=bicycle (Sepeda Motor)
        const carScore = Math.max(
          outputData[6 * numCandidates + c],  // class 2: car
          outputData[9 * numCandidates + c],  // class 5: bus
          outputData[11 * numCandidates + c]  // class 7: truck
        );
        const motoScore = Math.max(
          outputData[7 * numCandidates + c],  // class 3: motorcycle
          outputData[5 * numCandidates + c]   // class 1: bicycle
        );

        const maxScore = Math.max(carScore, motoScore);
        if (maxScore >= this.confidenceThreshold) {
          const cx = outputData[0 * numCandidates + c] * scaleX;
          const cy = outputData[1 * numCandidates + c] * scaleY;
          const w = outputData[2 * numCandidates + c] * scaleX;
          const h = outputData[3 * numCandidates + c] * scaleY;
          const cls = carScore >= motoScore ? 'car' : 'motorcycle';

          candidates.push({
            bbox: [cx - w / 2, cy - h / 2, w, h],
            score: maxScore,
            class: cls
          });
        }
      }

      // 4. Non-Maximum Suppression (NMS)
      processedDetections = this.applyNMS(candidates, 0.45);
    } else if (this.fallbackModel) {
      // Fallback engine
      const predictions = await this.fallbackModel.detect(this.videoEl, 25, this.confidenceThreshold);
      for (const p of predictions) {
        let mappedClass = null;
        if (p.class === 'car' || p.class === 'truck' || p.class === 'bus') mappedClass = 'car';
        else if (p.class === 'motorcycle' || p.class === 'bicycle') mappedClass = 'motorcycle';

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

    // 5. Multi-Object Tracking & Virtual Line Counting
    this.processTrackingAndCounting(processedDetections, vidW, vidH);
  }

  applyNMS(boxes, iouThreshold = 0.45) {
    boxes.sort((a, b) => b.score - a.score);
    const selected = [];

    for (const b of boxes) {
      let overlap = false;
      for (const s of selected) {
        if (s.class === b.class && this.computeIoU(s.bbox, b.bbox) > iouThreshold) {
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

  processTrackingAndCounting(predictions, w, h) {
    const lineY = h * this.countingLineY;
    const now = performance.now();

    for (const pred of predictions) {
      const [bx, by, bw, bh] = pred.bbox;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;

      let bestMatchId = null;
      let minDist = 95;

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

        track.cx = cx;
        track.cy = cy;
        track.bbox = pred.bbox;
        track.score = pred.score;
        track.lastSeen = now;

        // Check if vehicle crossed the virtual line
        if (!track.counted && this.countingLineActive) {
          const crossedDown = prevY < lineY && cy >= lineY;
          const crossedUp = prevY > lineY && cy <= lineY;

          if (crossedDown || crossedUp) {
            track.counted = true;
            this.recordCountEvent(pred.class, pred.score);
          }
        }
      } else {
        const newId = this.nextTrackId++;
        this.trackedVehicles.set(newId, {
          id: newId,
          cx,
          cy,
          bbox: pred.bbox,
          class: pred.class,
          score: pred.score,
          firstSeen: now,
          lastSeen: now,
          counted: false
        });
      }
    }

    // Clean up stale tracks (older than 1.2s)
    for (const [id, track] of this.trackedVehicles.entries()) {
      if (now - track.lastSeen > 1200) {
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
  // 60 FPS RENDER LOOP: VIRTUAL LINE & CLEAN VEHICLE BOXES
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

    // 2. Render Vehicle Bounding Boxes (YOLO Style)
    this.renderVehicleBoxes(ctx, vidW, vidH);

    // 3. Update Telemetry HUD
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

    // Line Label
    ctx.fillStyle = isFlashing ? '#fef08a' : '#38bdf8';
    ctx.font = '700 11.5px "JetBrains Mono", monospace';
    const tagText = isFlashing ? '⚡ KENDARAAN TERHITUNG' : '⮞ GARIS PENGHITUNG KENDARAAN';
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

  renderVehicleBoxes(ctx, w, h) {
    for (const [id, track] of this.trackedVehicles.entries()) {
      if (!track.bbox) continue;
      const [x, y, width, height] = track.bbox;
      const cfg = this.classConfig[track.class] || { label: track.class, color: '#38bdf8' };
      const color = cfg.color;

      ctx.save();

      // Glowing YOLO Bounding Box
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 5);
      ctx.stroke();

      // Corner Brackets
      const bLen = Math.min(18, width * 0.25, height * 0.25);
      ctx.lineWidth = 3.5;
      ctx.shadowBlur = 14;

      ctx.beginPath();
      ctx.moveTo(x, y + bLen); ctx.lineTo(x, y); ctx.lineTo(x + bLen, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + width - bLen, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + bLen);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, y + height - bLen); ctx.lineTo(x, y + height); ctx.lineTo(x + bLen, y + height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + width - bLen, y + height); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width, y + height - bLen);
      ctx.stroke();

      // Centroid
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Label Tag: Mobil or Sepeda Motor + Confidence %
      const scorePct = `${Math.round(track.score * 100)}%`;
      const labelText = `${cfg.label} ${scorePct}`;

      ctx.font = '600 12px "Outfit", sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const tagW = textWidth + 16;
      const tagH = 22;
      const tagX = Math.max(0, x);
      const tagY = y > 26 ? y - tagH - 4 : y + height + 4;

      ctx.fillStyle = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 4);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.shadowBlur = 0;
      ctx.fillText(labelText, tagX + 8, tagY + 15);

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
