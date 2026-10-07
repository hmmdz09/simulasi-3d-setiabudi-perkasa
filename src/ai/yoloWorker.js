import * as ort from 'onnxruntime-web/webgpu';

let session = null;
let inputName = 'pixel_values';
let isYolo26 = true;
let offCanvas = null;
let offCtx = null;
let floatArr = new Float32Array(3 * 640 * 640);
const inv255 = 1.0 / 255.0;
const numPixels = 640 * 640;

const sigmoid = (x) => 1.0 / (1.0 + Math.exp(-x));

self.onmessage = async (e) => {
  const data = e.data;
  if (!data) return;

  if (data.type === 'INIT') {
    try {
      const hasSAB = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
      ort.env.wasm.numThreads = hasSAB ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      ort.env.wasm.simd = true;

      // Prioritize WebGPU hardware acceleration on GPU for ultra-low latency (<25ms)
      session = await ort.InferenceSession.create(data.modelUrl, {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all'
      });

      inputName = session.inputNames[0] || 'pixel_values';
      const outputNames = session.outputNames || [];
      isYolo26 = outputNames.includes('logits') && outputNames.includes('pred_boxes');

      offCanvas = new OffscreenCanvas(640, 640);
      offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

      self.postMessage({
        type: 'INIT_SUCCESS',
        isYolo26,
        modelName: isYolo26 ? 'YOLOv26' : 'YOLOv8',
        modelUrl: data.modelUrl
      });
    } catch (err) {
      self.postMessage({ type: 'INIT_ERROR', error: err.message, modelUrl: data.modelUrl });
    }
  } else if (data.type === 'DETECT') {
    if (!session || !offCtx) {
      if (data.bitmap) data.bitmap.close();
      return;
    }

    const t0 = performance.now();
    const { bitmap, captureMeta, confThreshold } = data;
    const vidW = captureMeta.vidW || 640;
    const vidH = captureMeta.vidH || 360;

    try {
      // 1. Precise Letterboxing to 640x640 on worker thread
      const scale = Math.min(640 / vidW, 640 / vidH);
      const nw = Math.round(vidW * scale);
      const nh = Math.round(vidH * scale);
      const padX = (640 - nw) / 2;
      const padY = (640 - nh) / 2;

      offCtx.fillStyle = '#727272';
      offCtx.fillRect(0, 0, 640, 640);
      offCtx.drawImage(bitmap, padX, padY, nw, nh);
      bitmap.close(); // Immediate GPU memory release

      const imgData = offCtx.getImageData(0, 0, 640, 640).data;

      // 2. High-Speed 4x Loop-Unrolled Pre-processing to Float32Array [1, 3, 640, 640]
      const offsetG = numPixels;
      const offsetB = numPixels * 2;
      for (let i = 0; i < numPixels; i += 4) {
        const i4 = i * 4;
        floatArr[i] = imgData[i4] * inv255;
        floatArr[i + 1] = imgData[i4 + 4] * inv255;
        floatArr[i + 2] = imgData[i4 + 8] * inv255;
        floatArr[i + 3] = imgData[i4 + 12] * inv255;

        floatArr[offsetG + i] = imgData[i4 + 1] * inv255;
        floatArr[offsetG + i + 1] = imgData[i4 + 5] * inv255;
        floatArr[offsetG + i + 2] = imgData[i4 + 9] * inv255;
        floatArr[offsetG + i + 3] = imgData[i4 + 13] * inv255;

        floatArr[offsetB + i] = imgData[i4 + 2] * inv255;
        floatArr[offsetB + i + 1] = imgData[i4 + 6] * inv255;
        floatArr[offsetB + i + 2] = imgData[i4 + 10] * inv255;
        floatArr[offsetB + i + 3] = imgData[i4 + 14] * inv255;
      }

      // 3. Run Inference on background thread with dynamic input name
      const inputTensor = new ort.Tensor('float32', floatArr, [1, 3, 640, 640]);
      const feeds = {};
      feeds[inputName] = inputTensor;
      const results = await session.run(feeds);

      // 4. Candidate extraction with ultra-sensitive omnidirectional motorcycle detection
      const motoThreshold = Math.max(0.045, confThreshold * 0.35);
      const carThreshold = Math.max(0.14, confThreshold * 0.75);
      const candidates = [];

      if (isYolo26 && results.logits && results.pred_boxes) {
        // ===================================================================
        // ULTRALYTICS YOLOv26: NMS-FREE END-TO-END DECODER (300 DUAL-HEAD QUERIES)
        // ===================================================================
        const logits = results.logits.data;
        const predBoxes = results.pred_boxes.data;

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

          // Sensitive rider fusion for Indonesian traffic CCTV
          const riderFusion = (personScore >= 0.08 && (twoWheelerScore >= 0.025 || personScore >= 0.16));
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

          // Omnidirectional detection for motorcycles:
          // Detect motorcycles whether moving straight, turning, or crossing horizontally from the side
          if (isTwoWheeler && (effectiveMotoScore >= autoScore * 0.68 || riderFusion || aspectRatio < 1.15)) {
            cls = 'motorcycle';
            score = effectiveMotoScore;
          } else if (isAutomobile && (autoScore > effectiveMotoScore || aspectRatio >= 0.75)) {
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
            const cx_letter = cx_norm * 640;
            const cy_letter = cy_norm * 640;
            const w_letter = w_norm * 640;
            const h_letter = h_norm * 640;

            const realX = Math.max(0, ((cx_letter - w_letter / 2) - padX) / scale);
            const realY = Math.max(0, ((cy_letter - h_letter / 2) - padY) / scale);
            const realW = Math.min(vidW - realX, w_letter / scale);
            const heightMultiplier = (cls === 'motorcycle' && riderFusion) ? 1.35 : 1.0;
            const realH = Math.min(vidH - realY, (h_letter * heightMultiplier) / scale);

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

          const riderFusion = (personScore >= 0.08 && (twoWheelerScore >= 0.025 || personScore >= 0.16));
          const effectiveMotoScore = riderFusion
            ? Math.max(twoWheelerScore, personScore * 0.90)
            : twoWheelerScore;

          const w_letter = outputData[2 * numCandidates + c];
          const h_letter = outputData[3 * numCandidates + c];
          const aspectRatio = w_letter / Math.max(1, h_letter);

          let cls = null;
          let score = 0;

          const isTwoWheeler = effectiveMotoScore >= motoThreshold;
          const isAutomobile = autoScore >= carThreshold;

          if (isTwoWheeler && (effectiveMotoScore >= autoScore * 0.68 || riderFusion || aspectRatio < 1.15)) {
            cls = 'motorcycle';
            score = effectiveMotoScore;
          } else if (isAutomobile && (autoScore > effectiveMotoScore || aspectRatio >= 0.75)) {
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
            const cx_letter = outputData[0 * numCandidates + c];
            const cy_letter = outputData[1 * numCandidates + c];

            const realX = Math.max(0, ((cx_letter - w_letter / 2) - padX) / scale);
            const realY = Math.max(0, ((cy_letter - h_letter / 2) - padY) / scale);
            const realW = Math.min(vidW - realX, w_letter / scale);
            const heightMultiplier = (cls === 'motorcycle' && riderFusion) ? 1.35 : 1.0;
            const realH = Math.min(vidH - realY, (h_letter * heightMultiplier) / scale);

            candidates.push({
              bbox: [realX, realY, realW, realH],
              score: score,
              class: cls
            });
          }
        }
      }

      // 5. Clean Bounding Box Duplicate Suppression
      candidates.sort((a, b) => b.score - a.score);
      const selected = [];

      for (const b of candidates) {
        let overlap = false;
        for (const s of selected) {
          const x1 = Math.max(s.bbox[0], b.bbox[0]);
          const y1 = Math.max(s.bbox[1], b.bbox[1]);
          const x2 = Math.min(s.bbox[0] + s.bbox[2], b.bbox[0] + b.bbox[2]);
          const y2 = Math.min(s.bbox[1] + s.bbox[3], b.bbox[1] + b.bbox[3]);
          const w = Math.max(0, x2 - x1);
          const h = Math.max(0, y2 - y1);
          const inter = w * h;
          const union = s.bbox[2] * s.bbox[3] + b.bbox[2] * b.bbox[3] - inter;
          const iou = union <= 0 ? 0 : inter / union;

          if (s.class === b.class && iou > 0.45) {
            overlap = true;
            break;
          }
          if (s.class !== b.class && iou > 0.52) {
            overlap = true;
            break;
          }
        }
        if (!overlap) selected.push(b);
      }

      const latency = Math.round(performance.now() - t0);
      self.postMessage({
        type: 'DETECTIONS',
        detections: selected,
        captureMeta,
        latency,
        isYolo26
      });
    } catch (err) {
      self.postMessage({ type: 'DETECT_ERROR', error: err.message, captureMeta });
    }
  }
};
