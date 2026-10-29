/**
 * Grovastra Poster Studio — Background Removal Web Worker
 * Runs U²-Netp ONNX model inference and alpha compositing off the main UI thread.
 */

import * as ort from "onnxruntime-web";
import {
  MODEL_INPUT_SIZE,
  preprocessImageToTensor,
  normalizeRawMask,
  createMaskCanvas,
  compositeAlphaMask,
} from "../services/ai/imagePreprocessUtils";

// Configure WASM paths and single-thread execution to avoid COOP/COEP isolation blockers
ort.env.wasm.wasmPaths = "/wasm/";
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

let session: ort.InferenceSession | null = null;
let currentModelPath = "/models/u2netp.onnx";
let sessionInitPromise: Promise<ort.InferenceSession> | null = null;

export interface WorkerInitMessage {
  type: "INIT";
  modelUrl?: string;
}

export interface WorkerProcessMessage {
  type: "PROCESS";
  id: string;
  imageBitmap: ImageBitmap;
  width: number;
  height: number;
}

export interface WorkerDisposeMessage {
  type: "DISPOSE";
}

export type WorkerInboundMessage = WorkerInitMessage | WorkerProcessMessage | WorkerDisposeMessage;

async function getOrInitSession(modelUrl: string): Promise<ort.InferenceSession> {
  if (session && currentModelPath === modelUrl) {
    return session;
  }

  // Prevent concurrent initialization attempts from colliding in ONNX Runtime
  if (sessionInitPromise) {
    return sessionInitPromise;
  }

  sessionInitPromise = (async () => {
    if (session) {
      try {
        await session.release();
      } catch (e) {
        console.warn("[bgRemoval.worker] Error releasing previous session:", e);
      }
      session = null;
    }

    currentModelPath = modelUrl;

    let newSession: ort.InferenceSession | null = null;
    let webgpuErr: any = null;

    // Attempt WebGPU where supported, fallback safely to WASM
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      try {
        newSession = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ["webgpu", "wasm"],
          graphOptimizationLevel: "all",
        });
      } catch (err: any) {
        webgpuErr = err;
        console.warn("[bgRemoval.worker] WebGPU session creation failed, falling back to WASM:", err);
      }
    }

    if (!newSession) {
      try {
        newSession = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        });
      } catch (wasmErr: any) {
        const wasmDetail = wasmErr?.message || String(wasmErr);
        const errorMsg = webgpuErr
          ? `WASM initialization failed (${wasmDetail}). Prior WebGPU attempt also failed (${webgpuErr?.message || webgpuErr}).`
          : `WASM initialization failed: ${wasmDetail}`;
        throw new Error(errorMsg);
      }
    }

    session = newSession;
    return session;
  })();

  try {
    return await sessionInitPromise;
  } finally {
    sessionInitPromise = null;
  }
}

self.onmessage = async (e: MessageEvent<WorkerInboundMessage>) => {
  const data = e.data;
  if (!data) return;

  switch (data.type) {
    case "INIT": {
      try {
        const url = data.modelUrl || "/models/u2netp.onnx";
        await getOrInitSession(url);
        self.postMessage({ type: "INIT_SUCCESS" });
      } catch (err: any) {
        self.postMessage({
          type: "INIT_ERROR",
          error: err?.message || "Failed to initialize ONNX Runtime Web session.",
        });
      }
      break;
    }

    case "PROCESS": {
      const { id, imageBitmap, width, height } = data;
      try {
        self.postMessage({ type: "PROGRESS", id, stage: "init", progress: 10 });
        let activeSession = await getOrInitSession(currentModelPath);

        self.postMessage({ type: "PROGRESS", id, stage: "preprocessing", progress: 30 });
        const tensorData = preprocessImageToTensor(imageBitmap, width, height);

        self.postMessage({ type: "PROGRESS", id, stage: "inference", progress: 60 });
        const inputTensor = new ort.Tensor("float32", tensorData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

        const inputName = activeSession.inputNames[0] || "input.1";
        const outputName = activeSession.outputNames[0] || "d0";

        const feeds: Record<string, ort.Tensor> = {
          [inputName]: inputTensor,
        };

        let results: ort.InferenceSession.ReturnType;
        try {
          results = await activeSession.run(feeds);
        } catch (runErr: any) {
          console.warn("[bgRemoval.worker] Inference run failed, attempting WASM retry:", runErr);
          try {
            await activeSession.release();
          } catch {
            // ignore release error
          }
          session = null;
          activeSession = await ort.InferenceSession.create(currentModelPath, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
          });
          session = activeSession;
          results = await activeSession.run(feeds);
        }

        const outputTensor = results[outputName];

        if (!outputTensor) {
          throw new Error(
            `Expected output tensor '${outputName}' not found. Available outputs: ${activeSession.outputNames.join(", ")}`
          );
        }

        self.postMessage({ type: "PROGRESS", id, stage: "compositing", progress: 85 });
        const rawMask = outputTensor.data as Float32Array;
        const normalizedMask = normalizeRawMask(rawMask);
        const maskCanvas = createMaskCanvas(normalizedMask, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

        const transparentBlob = await compositeAlphaMask(imageBitmap, maskCanvas, width, height);

        try {
          imageBitmap.close();
        } catch {
          // ignore bitmap close errors
        }

        self.postMessage({ type: "PROGRESS", id, stage: "complete", progress: 100 });
        self.postMessage({
          type: "PROCESS_SUCCESS",
          id,
          blob: transparentBlob,
        });
      } catch (err: any) {
        try {
          imageBitmap?.close();
        } catch {
          // ignore bitmap close errors
        }

        self.postMessage({
          type: "PROCESS_ERROR",
          id,
          error: err?.message || String(err) || "Inference or compositing failure during background removal.",
        });
      }
      break;
    }

    case "DISPOSE": {
      sessionInitPromise = null;
      if (session) {
        try {
          await session.release();
        } catch (e) {
          console.warn("[bgRemoval.worker] Error disposing session:", e);
        }
        session = null;
      }
      self.postMessage({ type: "DISPOSE_SUCCESS" });
      break;
    }
  }
};
