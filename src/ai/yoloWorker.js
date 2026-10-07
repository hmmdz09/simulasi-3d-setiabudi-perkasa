import * as ort from 'onnxruntime-web/webgpu';

// Explicitly provide jsDelivr CDN paths for all ONNX WASM binaries so it works 100% on Vercel
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';

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

  if (data.type === 'INIT' || data.type === 'SWITCH_MODEL') {
    try {
      if (session) {
        try {
          await session.release();
        } catch (e) {
          console.warn('Session release error:', e);
        }
        session = null;
      }

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

      if (!offCanvas) {
        offCanvas = new OffscreenCanvas(640, 640);
        offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      }

      self.postMessage({
        type: 'INIT_SUCCESS',
        isYolo26,
        modelName: isYolo26 ? 'YOLOv26' : 'YOLOv8',
        modelUrl: data.modelUrl
      });
    } catch (err) {
      console.error('Worker ONNX session creation failed:', err);
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
      // 1. Direct High-Speed Resize to 640x640 on worker thread
      offCtx.drawImage(bitmap, 0, 0, 640, 640);
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

      // 4. Candidate extraction with sensitive motorcycle and car detection for Indonesian CCTV
      const motoThreshold = Math.max(0.04, confThreshold * 0.35);
      const carThreshold = Math.max(0.12, confThreshold * 0.65);
      const candidates = [];

      if (isYolo26 && results.logits && results.pred_boxes) {
        // ===================================================================
        // ULTRALYTICS YOLOv26: NMS-FREE END-TO-END DECODER (DUAL-HEAD QUERIES)
        // ===================================================================
        const logits = results.logits.data;
        const predBoxes = results.pred_boxes.data;
        const numQueries = results.logits.dims ? results.logits.dims[1] : 300;
        const numClasses = results.logits.dims ? results.logits.dims[2] : 80;

        for (let i = 0; i < numQueries; i++) {
          const off = i * numClasses;
          const personScore = sigmoid(logits[off + 0]);
          const bicycleScore = sigmoid(logits[off + 1]);
          const carScore = sigmoid(logits[off + 2]);
          const motoScore = sigmoid(logits[off + 3]);
          const busScore = sigmoid(logits[off + 5]);
          const truckScore = sigmoid(logits[off + 7]);

          // Indonesian traffic: Angkot, bus, truck counted under 4-wheel/automobile
          const autoScore = Math.max(carScore, busScore, truckScore);
          const twoWheelerScore = Math.max(motoScore, bicycleScore);

          // Rear-view motorcyclist fusion (rider + motorcycle detected in same query)
          const riderFusion = (twoWheelerScore >= 0.04 && personScore >= 0.06);
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
        // ULTRALYTICS YOLOv8: MULTI-SCALE CNN ANCHOR DECODER
        // ===================================================================
        const output = results.output0;
        const outputData = output.data;
        const dims = output.dims || [1, 84, 8400];
        
        let numCandidates = 8400;
        let isTransposed = false;
        if (dims.length === 3) {
          if (dims[1] === 84 && dims[2] === 8400) {
            numCandidates = dims[2];
            isTransposed = false;
          } else if (dims[1] === 8400 && dims[2] === 84) {
            numCandidates = dims[1];
            isTransposed = true;
          }
        }

        for (let c = 0; c < numCandidates; c++) {
          let personScore, bicycleScore, carScore, motoScore, busScore, truckScore;
          let cx_raw, cy_raw, w_raw, h_raw;

          if (!isTransposed) {
            // [1, 84, 8400]: index = attr * 8400 + c
            cx_raw = outputData[0 * numCandidates + c];
            cy_raw = outputData[1 * numCandidates + c];
            w_raw = outputData[2 * numCandidates + c];
            h_raw = outputData[3 * numCandidates + c];

            personScore = outputData[4 * numCandidates + c];
            bicycleScore = outputData[5 * numCandidates + c];
            carScore = outputData[6 * numCandidates + c];
            motoScore = outputData[7 * numCandidates + c];
            busScore = outputData[9 * numCandidates + c];
            truckScore = outputData[11 * numCandidates + c];
          } else {
            // [1, 8400, 84]: index = c * 84 + attr
            const base = c * 84;
            cx_raw = outputData[base + 0];
            cy_raw = outputData[base + 1];
            w_raw = outputData[base + 2];
            h_raw = outputData[base + 3];

            personScore = outputData[base + 4];
            bicycleScore = outputData[base + 5];
            carScore = outputData[base + 6];
            motoScore = outputData[base + 7];
            busScore = outputData[base + 9];
            truckScore = outputData[base + 11];
          }

          const autoScore = Math.max(carScore, busScore, truckScore);
          const twoWheelerScore = Math.max(motoScore, bicycleScore);

          const riderFusion = (twoWheelerScore >= 0.04 && personScore >= 0.06);
          const effectiveMotoScore = riderFusion
            ? Math.max(twoWheelerScore, personScore * 0.90)
            : twoWheelerScore;

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
            const cx_norm = cx_raw / 640;
            const cy_norm = cy_raw / 640;
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

      // 5. Clean Bounding Box Duplicate Suppression (NMS)
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
      console.warn('Inference error in worker:', err);
      self.postMessage({ type: 'DETECT_ERROR', error: err.message, captureMeta });
    }
  }
};
