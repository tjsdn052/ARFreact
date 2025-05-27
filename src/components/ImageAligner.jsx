import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";

let isOpenCVLoaded = false;
let openCVLoadCallbacks = [];

function handleOpenCVLoaded() {
  console.log("🔷 OpenCV script loaded successfully.");
  isOpenCVLoaded = true;
  openCVLoadCallbacks.forEach((cb) => cb());
  openCVLoadCallbacks = [];
}

function ensureOpenCVScriptLoaded() {
  if (typeof document === "undefined") {
    console.warn(
      "🔷 Document is not defined (not in browser env?), skipping OpenCV load."
    );
    return;
  }
  if (!isOpenCVLoaded && !document.getElementById("opencv-script")) {
    console.log("🔷 Attempting to load OpenCV script...");
    const script = document.createElement("script");
    script.id = "opencv-script";
    script.src =
      "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.7.0-release.1/dist/opencv.js";
    script.async = true;
    script.onload = handleOpenCVLoaded;
    script.onerror = () => console.error("❌ Failed to load OpenCV script!");
    document.head.appendChild(script);
  } else if (isOpenCVLoaded) {
    console.log("🔷 OpenCV script already loaded.");
  } else {
    console.log("🔷 OpenCV script is loading or already appended.");
  }
}

function resizeImage(imgElement, maxDim = 1200) {
  console.log(
    `🔷 Resizing image: original ${imgElement.width}x${imgElement.height} to maxDim ${maxDim}`
  );
  const canvas = document.createElement("canvas");
  let { width, height } = imgElement;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgElement, 0, 0, width, height);
  console.log(`🔷 Resized image to ${width}x${height}`);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          console.log("🔷 Image resized and converted to blob URL:", blobUrl);
          resolve(blobUrl);
        } else {
          console.error("❌ Failed to create blob from canvas (resizeImage).");
          reject(new Error("Failed to create blob from resized image."));
        }
      },
      "image/jpeg",
      0.9
    );
  });
}

const ImageAligner = forwardRef(function ImageAligner(
  { firstImageUrl, currentImageUrl, onProcessed },
  ref
) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("대기 중");
  const [priority, setPriority] = useState("background");
  const isProcessing = useRef(false);
  const processTimeoutRef = useRef(null);
  const workerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    setPriorityMode: (mode) => {
      console.log(`🔷 Priority mode set to: ${mode}`);
      setPriority(mode);
    },
    getStatus: () => status,
    isProcessing: () => isProcessing.current,
    abort: () => {
      console.log("🔷 Abort called.");
      if (workerRef.current) {
        console.log("🔷 Terminating worker.");
        workerRef.current.terminate();
        workerRef.current = null;
        isProcessing.current = false;
        setStatus("처리 중단됨");
      } else {
        console.log("🔷 Abort called, but no active worker.");
      }
    },
  }));

  useEffect(() => {
    console.log(
      "🔷 ImageAligner effect: ensureOpenCVScriptLoaded (mount/update)"
    );
    ensureOpenCVScriptLoaded();
  }, []);

  useEffect(() => {
    console.log(
      `🔷 ImageAligner effect: URLs changed or component mounted. First: ${firstImageUrl}, Current: ${currentImageUrl}`
    );
    // Ensure OpenCV is loaded before attempting to process
    if (isOpenCVLoaded) {
      console.log("🔷 OpenCV is loaded, calling startProcessing.");
      startProcessing();
    } else {
      console.log(
        "🔷 OpenCV not yet loaded, pushing startProcessing to callbacks."
      );
      // Ensure script loading is initiated if it hasn't been
      ensureOpenCVScriptLoaded();
      const callback = () => {
        console.log("🔷 OpenCV loaded (callback), calling startProcessing.");
        startProcessing();
      };
      openCVLoadCallbacks.push(callback);
      // Cleanup this specific callback if component unmounts before OpenCV loads
      return () => {
        openCVLoadCallbacks = openCVLoadCallbacks.filter(
          (cb) => cb !== callback
        );
      };
    }

    return () => {
      console.log("🔷 Cleanup effect for [firstImageUrl, currentImageUrl]");
      if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current);
      if (workerRef.current) {
        console.log("🔷 Terminating worker due to URL change or unmount.");
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [firstImageUrl, currentImageUrl]);

  useEffect(() => {
    console.log(
      `🔷 Priority changed to: ${priority}. IsProcessing: ${isProcessing.current}`
    );
    if (priority === "foreground" && !isProcessing.current) {
      console.log(
        "🔷 Priority is foreground and not processing, clearing timeout and starting image processing."
      );
      if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current);
      startImageProcessing();
    }
  }, [priority]);

  const startProcessing = () => {
    console.log(
      `🔷 startProcessing called. IsProcessing: ${isProcessing.current}, Priority: ${priority}`
    );
    if (isProcessing.current) {
      console.log("🔷 Already processing, returning from startProcessing.");
      return;
    }
    if (priority === "foreground") {
      console.log(
        "🔷 Priority is foreground, starting image processing immediately."
      );
      startImageProcessing();
    } else {
      console.log(
        "🔷 Priority is background, setting timeout for image processing (300ms)."
      );
      if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current); // Clear existing timeout
      processTimeoutRef.current = setTimeout(startImageProcessing, 300);
    }
  };

  const startImageProcessing = async () => {
    console.log(
      `🔷 startImageProcessing called. FirstURL: ${firstImageUrl}, CurrentURL: ${currentImageUrl}, IsProcessing: ${isProcessing.current}, OpenCVLoaded: ${isOpenCVLoaded}`
    );

    if (
      !firstImageUrl ||
      !currentImageUrl ||
      firstImageUrl === currentImageUrl
    ) {
      console.log(
        "🔷 No processing needed (missing URLs or URLs are same). Calling onProcessed with firstImageUrl."
      );
      onProcessed && onProcessed(firstImageUrl);
      if (isProcessing.current && firstImageUrl === currentImageUrl) {
        // If it was processing but images became same
        isProcessing.current = false;
        setStatus("대기 중 (이미지 동일)");
      }
      return;
    }

    if (isProcessing.current) {
      console.log("🔷 startImageProcessing: Already processing, returning.");
      return;
    }

    if (!isOpenCVLoaded) {
      console.log(
        "🔷 OpenCV not loaded. Pushing startImageProcessing to callbacks and returning."
      );
      ensureOpenCVScriptLoaded(); // Make sure script is being loaded
      openCVLoadCallbacks.push(() => {
        console.log(
          "🔷 OpenCV loaded (callback from startImageProcessing), retrying startImageProcessing."
        );
        startImageProcessing();
      });
      return;
    }

    isProcessing.current = true;
    setStatus("이미지 로드 중...");
    console.log("🔷 Status: 이미지 로드 중...");

    try {
      console.log("🔷 Loading images...");
      const [img1Element, img2Element] = await Promise.all([
        loadImage(firstImageUrl),
        loadImage(currentImageUrl),
      ]);
      console.log("🔷 Images loaded. Resizing images...");
      setStatus("이미지 리사이징 중...");

      const [resized1Url, resized2Url] = await Promise.all([
        resizeImage(img1Element),
        resizeImage(img2Element),
      ]);
      console.log("🔷 Images resized. Loading resized images...");
      setStatus("리사이즈 이미지 로드 중...");

      const [img1ResizedElement, img2ResizedElement] = await Promise.all([
        loadImage(resized1Url),
        loadImage(resized2Url),
      ]);
      console.log("🔷 Resized images loaded. Processing with worker...");
      setStatus("이미지 분석 중...");

      await processWithWorker(img1ResizedElement, img2ResizedElement);

      console.log("🔷 Revoking object URLs for resized images.");
      URL.revokeObjectURL(resized1Url);
      URL.revokeObjectURL(resized2Url);
    } catch (e) {
      console.error("❌ Error in startImageProcessing:", e);
      setStatus("오류: " + e.message);
      isProcessing.current = false;
      onProcessed && onProcessed(null);
    }
  };

  const loadImage = (src) => {
    console.log(`🔷 loadImage called for src: ${src}`);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        console.log(
          `🔷 Image loaded successfully: ${src} (${img.width}x${img.height})`
        );
        resolve(img);
      };
      img.onerror = (err) => {
        console.error(`❌ Image load failed: ${src}`, err);
        reject(new Error("이미지 로드 실패: " + src));
      };
      img.src = src;
    });
  };

  const processWithWorker = (img1, img2) => {
    console.log(
      `🔷 processWithWorker called with images: img1 (${img1.width}x${img1.height}), img2 (${img2.width}x${img2.height})`
    );
    return new Promise((resolve, reject) => {
      const canvas1 = document.createElement("canvas");
      const canvas2 = document.createElement("canvas");
      canvas1.width = img1.width;
      canvas1.height = img1.height;
      canvas2.width = img2.width;
      canvas2.height = img2.height;
      const ctx1 = canvas1.getContext("2d");
      const ctx2 = canvas2.getContext("2d");
      ctx1.drawImage(img1, 0, 0);
      ctx2.drawImage(img2, 0, 0);
      const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
      const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
      console.log("🔷 Image data prepared for worker.");

      // --- Worker Code ---
      // Major change: Moved OpenCV logic out of the uncalled Module.onRuntimeInitialized
      const workerCode = `
console.log('[WORKER] Worker script started.');
importScripts("https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.7.0-release.1/dist/opencv.js");

self.onmessage = function (e) {
  console.log('[WORKER] Message received by worker:', e.data ? {width: e.data.width, height: e.data.height} : e.data);
  const { img1Data, img2Data, width, height } = e.data;

  if (typeof cv === 'undefined') {
    console.error('[WORKER] cv is undefined. OpenCV might not have loaded correctly.');
    self.postMessage({ success: false, error: 'cv is undefined in worker' });
    return;
  }
  console.log('[WORKER] cv object is available.');

  try {
    console.log('[WORKER] Starting OpenCV processing...');
    const startTime = performance.now();

    // --- 1. 이미지 초기화 ---
    console.log('[WORKER] Initializing images...');
    const img1Mat = cv.matFromImageData(new ImageData(new Uint8ClampedArray(img1Data), width, height));
    const img2Mat = cv.matFromImageData(new ImageData(new Uint8ClampedArray(img2Data), width, height));
    console.log('[WORKER] Images initialized.');

    // --- 2. Grayscale 변환 ---
    console.log('[WORKER] Converting to Grayscale...');
    const gray1 = new cv.Mat();
    const gray2 = new cv.Mat();
    cv.cvtColor(img1Mat, gray1, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(img2Mat, gray2, cv.COLOR_RGBA2GRAY);
    console.log('[WORKER] Grayscale conversion done.');

    // --- 3. ORB 특징점 검출 및 디스크립터 계산 ---
    console.log('[WORKER] ORB feature detection and computation...');
    const orb = new cv.ORB(); // Default params: nfeatures=500, scaleFactor=1.2, nlevels=8, edgeThreshold=31, firstLevel=0, WTA_K=2, scoreType=cv.ORB_HARRIS_SCORE, patchSize=31, fastThreshold=20
    const kp1 = new cv.KeyPointVector();
    const kp2 = new cv.KeyPointVector();
    const des1 = new cv.Mat();
    const des2 = new cv.Mat();
    const noArray = new cv.Mat(); // For empty mask

    orb.detectAndCompute(gray1, noArray, kp1, des1);
    orb.detectAndCompute(gray2, noArray, kp2, des2);
    console.log(\`[WORKER] ORB done. kp1: \${kp1.size()}, des1 type: \${des1.type()} empty: \${des1.empty()}, kp2: \${kp2.size()}, des2 type: \${des2.type()} empty: \${des2.empty()}\`);

    if (kp1.size() === 0 || kp2.size() === 0) {
      throw new Error(\`Not enough keypoints found. img1: \${kp1.size()}, img2: \${kp2.size()}\`);
    }
    if (des1.empty() || des2.empty()) {
        throw new Error(\`Descriptors are empty. img1: \${des1.empty()}, img2: \${des2.empty()}\`);
    }
    
    // --- 4. BFMatcher (Hamming 거리)로 매칭 ---
    console.log('[WORKER] BFMatcher matching...');
    const bf = new cv.BFMatcher(cv.NORM_HAMMING, false); // crossCheck = false for knnMatch
    const matches = new cv.DMatchVectorVector();
    // Match descriptors from img2 (query) to img1 (train)
    bf.knnMatch(des2, des1, matches, 2); 
    console.log('[WORKER] BFMatcher knnMatch done. Matches found:', matches.size());

    let good_matches = [];
    const ratio_thresh = 0.75;
    for (let i = 0; i < matches.size(); i++) {
      const match_pair = matches.get(i);
      if (match_pair.size() >= 2) { // Ensure there are two matches to compare
        const m = match_pair.get(0); // Best match
        const n = match_pair.get(1); // Second best match
        if (m.distance < ratio_thresh * n.distance) {
          // m.trainIdx corresponds to des1 (and kp1)
          // m.queryIdx corresponds to des2 (and kp2)
          good_matches.push(m);
        }
      }
    }
    console.log('[WORKER] Good matches count:', good_matches.length);

    const MIN_MATCH_COUNT = 10; // Increased for better homography
    if (good_matches.length < MIN_MATCH_COUNT) {
      throw new Error(\`호모그래피 계산을 위한 매칭 부족 (\${good_matches.length} < \${MIN_MATCH_COUNT})\`);
    }

    const srcPtsData = []; // Points from img2 (current image, to be warped)
    const dstPtsData = []; // Points from img1 (reference image)

    for (let i = 0; i < good_matches.length; i++) {
      dstPtsData.push(kp1.get(good_matches[i].trainIdx).pt.x);
      dstPtsData.push(kp1.get(good_matches[i].trainIdx).pt.y);
      srcPtsData.push(kp2.get(good_matches[i].queryIdx).pt.x);
      srcPtsData.push(kp2.get(good_matches[i].queryIdx).pt.y);
    }

    const pts1Mat = cv.matFromArray(good_matches.length, 1, cv.CV_32FC2, dstPtsData);
    const pts2Mat = cv.matFromArray(good_matches.length, 1, cv.CV_32FC2, srcPtsData);
    
    console.log('[WORKER] Finding Homography...');
    // Find homography to map points from img2 (pts2Mat) to points in img1 (pts1Mat)
    const M = cv.findHomography(pts2Mat, pts1Mat, cv.RANSAC, 3.0);
    if (M.empty()) {
        throw new Error("Homography matrix is empty. Not enough inliers or degenerate configuration.");
    }
    console.log('[WORKER] Homography matrix calculated.');

    // --- 5. 정렬 ---
    console.log('[WORKER] Warping perspective for img2Mat...');
    const aligned = new cv.Mat();
    const dsize = new cv.Size(width, height); // Target size same as img1Mat
    cv.warpPerspective(img2Mat, aligned, M, dsize, cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());
    console.log('[WORKER] Warping done.');

    // --- 6. 차이 및 강조 처리 ---
    console.log('[WORKER] Calculating difference and highlighting...');
    const diff = new cv.Mat();
    // Calculate difference between the reference image (img1Mat) and the aligned image (aligned)
    cv.absdiff(img1Mat, aligned, diff);
    const grayDiff = new cv.Mat();
    cv.cvtColor(diff, grayDiff, cv.COLOR_RGBA2GRAY);
    const blurred = new cv.Mat();
    cv.GaussianBlur(grayDiff, blurred, new cv.Size(5, 5), 0);
    const mask = new cv.Mat();
    cv.threshold(blurred, mask, 40, 255, cv.THRESH_BINARY); // Adjusted threshold slightly
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    console.log('[WORKER] Difference mask calculated.');

    // The user wants to modify img1Mat to highlight differences.
    // Let resultMat be img1Mat for modification.
    let resultMat = img1Mat; 

    for (let y = 0; y < mask.rows; y++) {
      for (let x = 0; x < mask.cols; x++) {
        if (mask.ucharPtr(y, x)[0] > 0) { // If difference is significant in the mask
          resultMat.ucharPtr(y, x)[0] = 0;   // Blue channel
          resultMat.ucharPtr(y, x)[1] = 0;   // Green channel
          resultMat.ucharPtr(y, x)[2] = 255; // Red channel - Highlighting in Red
          // resultMat.ucharPtr(y, x)[3] = 255; // Alpha (already should be 255)
        }
      }
    }
    console.log('[WORKER] Highlighting applied to resultMat.');

    const resultData = {
      width: resultMat.cols,
      height: resultMat.rows,
      data: resultMat.data.buffer, // Send ArrayBuffer
    };
    
    self.postMessage({ success: true, result: resultData }, [resultMat.data.buffer]); // Transfer ArrayBuffer
    
    const endTime = performance.now();
    console.log(\`[WORKER] Result posted. Processing time: \${(endTime - startTime).toFixed(2)} ms\`);

    // 메모리 해제
    console.log('[WORKER] Deleting Mats...');
    // resultMat is img1Mat, its buffer was transferred.
    // img1Mat.delete(); // Should be fine, it deletes the C++ object. The JS object still holds metadata.
    img2Mat.delete(); aligned.delete();
    gray1.delete(); gray2.delete(); diff.delete(); grayDiff.delete(); blurred.delete(); mask.delete(); kernel.delete();
    kp1.delete(); kp2.delete(); des1.delete(); des2.delete(); noArray.delete();
    matches.delete(); M.delete(); pts1Mat.delete(); pts2Mat.delete(); orb.delete(); bf.delete();
    // Note: resultMat (which is img1Mat) is not explicitly deleted here if its buffer is transferred.
    // OpenCV.js handles this; the Mat object is a wrapper. Deleting it frees the Emscripten heap space.
    // Since img1Mat's data buffer is transferred, we might not need to delete img1Mat if we are done with it.
    // However, standard practice is to delete all created cv.Mat objects.
    // If img1Mat.data.buffer is transferred, the Mat object might become invalid for further use on JS side anyway.
    // Let's ensure it's deleted if it was the source of the transferred buffer.
    if (resultMat) resultMat.delete();


    console.log('[WORKER] Mats deleted.');

  } catch (err) {
    console.error('[WORKER] Error during processing:', err, err.message, err.stack);
    self.postMessage({ success: false, error: err.message + (err.stack ? \`\\nStack: \${err.stack}\` : '') });
  }
};
`; // End of workerCode template literal

      const blob = new Blob([workerCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      workerRef.current = worker;
      console.log("🔷 Worker created with URL:", url);

      worker.onmessage = (e) => {
        console.log(
          "🔷 Message received from worker:",
          e.data
            ? {
                success: e.data.success,
                error: e.data.error,
                hasResult: !!e.data.result,
              }
            : e.data
        );
        const { success, result, error } = e.data;

        if (success && result) {
          const canvas = canvasRef.current;
          if (!canvas) {
            console.error("❌ CanvasRef is null when worker returned success.");
            setStatus("오류: 내부 UI 오류");
            isProcessing.current = false;
            reject(new Error("Canvas reference is null."));
            return;
          }
          canvas.width = result.width;
          canvas.height = result.height;
          const ctx = canvas.getContext("2d");
          const imageData = new ImageData(
            new Uint8ClampedArray(result.data), // Data is ArrayBuffer
            result.width,
            result.height
          );
          ctx.putImageData(imageData, 0, 0);

          console.log("✅ Worker analysis complete. Generating data URL...");
          const dataUrl = canvas.toDataURL("image/png");
          onProcessed && onProcessed(dataUrl);
          setStatus("처리 완료");
          isProcessing.current = false;
          resolve();
        } else if (error) {
          console.error("❌ Worker analysis failed:", error);
          setStatus("분석 실패: " + error);
          isProcessing.current = false;
          onProcessed && onProcessed(null);
          reject(new Error(error));
        } else {
          console.error(
            "❌ Worker returned an unexpected message format:",
            e.data
          );
          setStatus("분석 실패: 알 수 없는 워커 응답");
          isProcessing.current = false;
          onProcessed && onProcessed(null);
          reject(new Error("Unknown worker response"));
        }

        console.log(
          "🔷 Terminating worker and revoking blob URL after message."
        );
        worker.terminate();
        workerRef.current = null;
        URL.revokeObjectURL(url);
      };

      worker.onerror = (e) => {
        console.error("❌ Worker errored:", e.message, e);
        setStatus("Worker 오류: " + e.message);
        isProcessing.current = false;
        onProcessed && onProcessed(null);
        reject(new Error("Worker 오류: " + e.message));
        console.log("🔷 Terminating worker and revoking blob URL after error.");
        worker.terminate();
        workerRef.current = null;
        URL.revokeObjectURL(url);
      };

      console.log("🔷 Posting message to worker with image data buffers.");
      worker.postMessage(
        {
          img1Data: imageData1.data.buffer.slice(0), // Send a copy for safety, or transfer if img1 not needed after
          img2Data: imageData2.data.buffer.slice(0), // Send a copy
          width: img1.width, // Use width/height from the resized elements fed to worker
          height: img1.height,
        }
        // To transfer ownership (faster, data no longer usable here):
        // [imageData1.data.buffer, imageData2.data.buffer]
        // Sending copies for now to avoid issues if original buffers are needed.
        // The worker now expects to receive the buffer and will transfer it back.
        // The main thread sent copies, the worker will transfer its result buffer.
      );
      console.log("🔷 Message posted to worker.");
    });
  }; // end of processWithWorker

  return (
    <div style={{ display: "none" }}>
      <canvas ref={canvasRef} />
    </div>
  );
});

export default ImageAligner;
