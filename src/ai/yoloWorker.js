import * as ort from 'onnxruntime-web';

// Always point to local /wasm/ directory containing all ort wasm files
if (typeof self !== 'undefined') {
  ort.env.wasm.wasmPaths = '/wasm/';
}

let session = null;
let inputName = 'images';
let isYolo26 = false;
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
        } catch (e) {}
        session = null;
      }

      const hasSAB = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
      ort.env.wasm.numThreads = hasSAB ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      ort.env.wasm.simd = true;

      // Ultra-stable and ultra-fast WebAssembly provider with local wasm binaries
      session = await ort.InferenceSession.create(data.modelUrl, {
        executionProviders: ['wasm'],
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
      // 1. Direct High-Speed Resize to 640x640 on worker thread (Native YOLOS/DETR format)
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

      // 4. Candidate extraction with ultra-sensitive omnidirectional motorcycle detection
      const motoThreshold = Math.max(0.04, confThreshold * 0.35);
      const carThreshold = Math.max(0.12, confThreshold * 0.70);
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

          // Omnidirectional detection for motorcycles:
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
            // Direct exact scaling to native video pixel coordinates [0..vidW, 0..vidH]
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
        // ULTRALYTICS YOLOv8: GRID-BASED RAW ANCHOR DECODER (8400 COLS)
        // ===================================================================
        const outputData = results.output0.data;
        const numCandidates = 8400;

        for (let c = 0; c < numCandidates; c++) {
          const personScore = outputData[4 * numCandidates + c] || 0;
          const bicycleScore = outputData[5 * numCandidates + c] || 0;
          const carScore = outputData[6 * numCandidates + c] || 0;
          const motoScore = outputData[7 * numCandidates + c] || 0;
          const busScore = outputData[9 * numCandidates + c] || 0;
          const truckScore = outputData[11 * numCandidates + c] || 0;

          // Automobiles in Indonesian traffic (Mobil pribadi, Angkot, Bus, Truk)
          const autoScore = Math.max(carScore, busScore, truckScore);

          // Motorcycles & 2-Wheelers (Sepeda Motor, Skuter matic, Bebek, Motor + Pengendara)
          // Indonesian CCTV often detects riders partly as person
          const riderBoost = (personScore >= 0.08 && (motoScore >= 0.02 || bicycleScore >= 0.02)) ? Math.max(motoScore, personScore * 0.88) : 0;
          const twoWheelerScore = Math.max(motoScore, bicycleScore, riderBoost);

          // Dedicated sensitive thresholds for traffic CCTV
          const isTwoWheeler = twoWheelerScore >= motoThreshold;
          const isCar = autoScore >= carThreshold;

          if (isTwoWheeler || isCar) {
            let cls = 'car';
            let score = autoScore;

            if (isTwoWheeler && (!isCar || twoWheelerScore >= autoScore * 0.70)) {
              cls = 'motorcycle';
              score = twoWheelerScore;
            } else {
              cls = 'car';
              score = autoScore;
            }

            const cx_raw = outputData[0 * numCandidates + c];
            const cy_raw = outputData[1 * numCandidates + c];
            const w_raw = outputData[2 * numCandidates + c];
            const h_raw = outputData[3 * numCandidates + c];

            const realX = Math.max(0, (cx_raw - w_raw / 2) * (vidW / 640));
            const realY = Math.max(0, (cy_raw - h_raw / 2) * (vidH / 640));
            const realW = Math.min(vidW - realX, w_raw * (vidW / 640));
            const realH = Math.min(vidH - realY, h_raw * (vidH / 640));

            if (realW >= 6 && realH >= 6 && realW <= vidW * 0.98 && realH <= vidH * 0.98) {
              candidates.push({
                bbox: [realX, realY, realW, realH],
                score: score,
                class: cls
              });
            }
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
