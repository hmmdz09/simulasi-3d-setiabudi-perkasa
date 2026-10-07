import * as ort from 'onnxruntime-web';

let session = null;
let offCanvas = null;
let offCtx = null;
let floatArr = new Float32Array(3 * 640 * 640);
const inv255 = 1.0 / 255.0;
const numPixels = 640 * 640;

self.onmessage = async (e) => {
  const data = e.data;
  if (!data) return;

  if (data.type === 'INIT') {
    try {
      const hasSAB = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
      ort.env.wasm.numThreads = hasSAB ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      ort.env.wasm.simd = true;

      session = await ort.InferenceSession.create(data.modelUrl, {
        executionProviders: ['wasm']
      });

      offCanvas = new OffscreenCanvas(640, 640);
      offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

      self.postMessage({ type: 'INIT_SUCCESS' });
    } catch (err) {
      self.postMessage({ type: 'INIT_ERROR', error: err.message });
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

      // 2. Pre-process to pre-allocated Float32Array
      for (let i = 0; i < numPixels; i++) {
        const i4 = i * 4;
        floatArr[i] = imgData[i4] * inv255;
        floatArr[numPixels + i] = imgData[i4 + 1] * inv255;
        floatArr[2 * numPixels + i] = imgData[i4 + 2] * inv255;
      }

      // 3. Run YOLOv8 ONNX inference on background thread
      const inputTensor = new ort.Tensor('float32', floatArr, [1, 3, 640, 640]);
      const results = await session.run({ images: inputTensor });
      const outputData = results.output0.data;

      // 4. Extract candidates with ultra-sensitive motorcycle detection
      const motoThreshold = Math.max(0.05, confThreshold * 0.40);
      const carThreshold = Math.max(0.15, confThreshold * 0.80);

      const candidates = [];
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

        // Sensitive rider fusion for Indonesian traffic CCTV
        const riderFusion = (personScore >= 0.10 && (twoWheelerScore >= 0.03 || personScore >= 0.18));
        const effectiveMotoScore = riderFusion
          ? Math.max(twoWheelerScore, personScore * 0.90)
          : twoWheelerScore;

        const w_letter = outputData[2 * numCandidates + c];
        const h_letter = outputData[3 * numCandidates + c];
        const aspectRatio = w_letter / Math.max(1, h_letter);

        let cls = null;
        let score = 0;

        if (effectiveMotoScore >= motoThreshold && (effectiveMotoScore >= autoScore * 0.80 || aspectRatio < 0.72)) {
          cls = 'motorcycle';
          score = effectiveMotoScore;
        } else if (autoScore >= carThreshold && (autoScore > effectiveMotoScore || aspectRatio >= 0.72)) {
          cls = 'car';
          score = autoScore;
        } else if (effectiveMotoScore >= motoThreshold) {
          cls = 'motorcycle';
          score = effectiveMotoScore;
        } else if (autoScore >= carThreshold) {
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

      // 5. NMS with cross-class duplicate suppression
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
        latency
      });
    } catch (err) {
      self.postMessage({ type: 'DETECT_ERROR', error: err.message, captureMeta });
    }
  }
};
