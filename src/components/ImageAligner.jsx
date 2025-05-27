// components/ImageAligner.jsx
import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";

// 메인 스레드용 OpenCV 로드 함수 (기존 유지)
let isOpenCVLoaded = false;
let openCVLoadCallbacks = [];
function handleOpenCVLoaded() {
  isOpenCVLoaded = true;
  openCVLoadCallbacks.forEach((cb) => cb());
  openCVLoadCallbacks = [];
}
function ensureOpenCVScriptLoaded() {
  if (
    !isOpenCVLoaded &&
    typeof document !== "undefined" &&
    !document.getElementById("opencv-script")
  ) {
    const script = document.createElement("script");
    script.id = "opencv-script";
    script.src =
      "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.7.0-release.1/dist/opencv.js";
    script.async = true;
    script.onload = handleOpenCVLoaded;
    document.head.appendChild(script);
  }
}

// resizeImage 함수 (기존 유지)
function resizeImage(imgElement, maxDim = 1200) {
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
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(URL.createObjectURL(blob)),
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
    setPriorityMode: (mode) => setPriority(mode),
    getStatus: () => status,
    isProcessing: () => isProcessing.current,
    abort: () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        isProcessing.current = false;
        setStatus("처리 중단됨");
      }
    },
  }));

  useEffect(() => {
    ensureOpenCVScriptLoaded();
    startProcessing();
    return () => {
      if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [firstImageUrl, currentImageUrl]);

  useEffect(() => {
    if (priority === "foreground" && !isProcessing.current) {
      if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current);
      startImageProcessing();
    }
  }, [priority]);

  const startProcessing = () => {
    if (isProcessing.current) return;
    if (priority === "foreground") {
      startImageProcessing();
    } else {
      if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current);
      processTimeoutRef.current = setTimeout(startImageProcessing, 300);
    }
  };

  const startImageProcessing = async () => {
    if (!firstImageUrl || !currentImageUrl) {
      setStatus("이미지 URL 필요");
      onProcessed && onProcessed(firstImageUrl || currentImageUrl || null);
      return;
    }
    if (firstImageUrl === currentImageUrl) {
      setStatus("동일 이미지");
      onProcessed && onProcessed(firstImageUrl);
      return;
    }
    if (isProcessing.current) {
      setStatus("이미 처리 중");
      return;
    }

    if (!isOpenCVLoaded) {
      setStatus("OpenCV 로딩 중...");
      openCVLoadCallbacks.push(() => {
        console.log("메인 스레드 OpenCV 로드 완료, 이미지 처리 시작");
        startImageProcessing();
      });
      return;
    }
    if (typeof cv === "undefined" || !cv.imread) {
      setStatus("OpenCV 로드 실패 또는 초기화 안됨 (메인)");
      console.error("cv object or cv.imread is not available in main thread.");
      onProcessed && onProcessed(null);
      return;
    }

    isProcessing.current = true;
    setStatus("이미지 로드 중...");
    try {
      const [img1Element, img2Element] = await Promise.all([
        loadImage(firstImageUrl),
        loadImage(currentImageUrl),
      ]);
      await processWithWorker(img1Element, img2Element);
    } catch (e) {
      console.error("이미지 처리 오류 (메인 스레드):", e);
      setStatus("오류: " + e.message);
      isProcessing.current = false;
      onProcessed && onProcessed(null);
    }
  };

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        console.error("이미지 로드 실패:", src, err);
        reject(new Error("이미지 로드 실패: " + src));
      };
      img.src = src;
    });

  const processWithWorker = (img1, img2) => {
    return new Promise((resolve, reject) => {
      const canvas1 = document.createElement("canvas");
      canvas1.width = img1.naturalWidth;
      canvas1.height = img1.naturalHeight;
      const ctx1 = canvas1.getContext("2d");
      ctx1.drawImage(img1, 0, 0);
      const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);

      const canvas2 = document.createElement("canvas");
      canvas2.width = img2.naturalWidth;
      canvas2.height = img2.naturalHeight;
      const ctx2 = canvas2.getContext("2d");
      ctx2.drawImage(img2, 0, 0);
      const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);

      if (workerRef.current) {
        workerRef.current.terminate();
      }

      const workerCode = `
  importScripts('https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.7.0-release.1/dist/opencv.js');

  let isReady = false;
  cv['onRuntimeInitialized'] = () => { isReady = true; };

  self.onmessage = function (e) {
    if (!isReady) {
      setTimeout(() => self.onmessage(e), 50);
      return;
    }

    // --- Configuration Constants ---
    const LOWES_RATIO = 0.75;
    const ALIGNED_CONTENT_MASK_THRESHOLD = 1;
    const GAUSSIAN_BLUR_SIZE_W = 5;
    const GAUSSIAN_BLUR_SIZE_H = 5;
    const DIFF_INTENSITY_THRESHOLD = 60;
    const MORPH_KERNEL_SIZE_W = 5;
    const MORPH_KERNEL_SIZE_H = 5;
    const MORPH_CLOSE_ITERATIONS = 2;
    const MIN_DIFF_CONTOUR_AREA = 800;
    const HIGHLIGHT_COLOR_RGBA = [255, 0, 0, 255]; // R, G, B, A (Red)

    // --- OpenCV Variable Declarations ---
    let mat1, mat2, gray1, gray2, orb, kp1, des1, kp2, des2, bf, matchesVec;
    let pts1Mat, pts2Mat, homography, aligned;
    let maskAlignedFull, alignedGray, contours, hierarchy;
    let img1_crop, aligned_crop, mask_overlap;
    let diffMat, gray_diff, blurred, mask_diff, kernel, allContours, tempHierarchy, mask_filtered, highlight;
    let fallback = false;

    try {
      const { img1DataBuffer, img1Width, img1Height, img2DataBuffer, img2Width, img2Height } = e.data;

      const img1Array = new Uint8ClampedArray(img1DataBuffer);
      const img2Array = new Uint8ClampedArray(img2DataBuffer);

      mat1 = cv.matFromImageData({ data: img1Array, width: img1Width, height: img1Height });
      mat2 = cv.matFromImageData({ data: img2Array, width: img2Width, height: img2Height });

      gray1 = new cv.Mat();
      gray2 = new cv.Mat();
      cv.cvtColor(mat1, gray1, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(mat2, gray2, cv.COLOR_RGBA2GRAY);

      orb = new cv.ORB();
      kp1 = new cv.KeyPointVector(); des1 = new cv.Mat();
      kp2 = new cv.KeyPointVector(); des2 = new cv.Mat();
      orb.detectAndCompute(gray1, new cv.Mat(), kp1, des1); // new cv.Mat() for empty mask is fine
      orb.detectAndCompute(gray2, new cv.Mat(), kp2, des2); // new cv.Mat() for empty mask is fine

      bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
      matchesVec = new cv.DMatchVectorVector();
      if (!des1.empty() && !des2.empty()) { // Ensure descriptors are not empty before matching
        bf.knnMatch(des2, des1, matchesVec, 2);
      }

      const pts1 = []; const pts2 = [];
      for (let i = 0; i < matchesVec.size(); i++) {
        const matchPair = matchesVec.get(i);
        if (matchPair.size() >= 2) { // Ensure k=2 matches exist
            const m = matchPair.get(0);
            const n = matchPair.get(1);
            if (m.distance < LOWES_RATIO * n.distance) {
              const p1 = kp1.get(m.trainIdx).pt;
              const p2 = kp2.get(m.queryIdx).pt;
              pts1.push(p1.x, p1.y);
              pts2.push(p2.x, p2.y);
            }
        }
      }

      aligned = new cv.Mat();
      if (pts1.length >= 8) { // Need at least 4 points (8 values for x,y)
        pts1Mat = cv.matFromArray(pts1.length / 2, 1, cv.CV_32FC2, pts1);
        pts2Mat = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);
        homography = cv.findHomography(pts2Mat, pts1Mat, cv.RANSAC);

        if (!homography.empty()) {
            cv.warpPerspective(mat2, aligned, homography, new cv.Size(mat1.cols, mat1.rows));
        } else {
            fallback = true; // Homography calculation failed
        }
      } else {
        fallback = true; // Not enough good matches
      }

      if (fallback) {
        // Resize mat2 to mat1's dimensions for comparison if alignment failed
        cv.resize(mat2, aligned, new cv.Size(mat1.cols, mat1.rows), 0, 0, cv.INTER_LINEAR);
      }

      // Create mask of actual content in the (potentially warped or resized) 'aligned' image
      maskAlignedFull = new cv.Mat();
      alignedGray = new cv.Mat();
      cv.cvtColor(aligned, alignedGray, cv.COLOR_RGBA2GRAY);
      cv.threshold(alignedGray, maskAlignedFull, ALIGNED_CONTENT_MASK_THRESHOLD, 255, cv.THRESH_BINARY);

      contours = new cv.MatVector();
      hierarchy = new cv.Mat(); // For the first findContours
      cv.findContours(maskAlignedFull, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // Determine bounding box of content in 'aligned' image to crop both images
      let cropRect;
      if (contours.size() > 0) {
        cropRect = cv.boundingRect(contours.get(0));
        // Ensure rect is within bounds (especially if aligned was mat2 and smaller than mat1 initially)
        cropRect.x = Math.max(0, cropRect.x);
        cropRect.y = Math.max(0, cropRect.y);
        cropRect.width = Math.min(mat1.cols - cropRect.x, cropRect.width);
        cropRect.height = Math.min(mat1.rows - cropRect.y, cropRect.height);
      } else {
        // If no content in aligned (e.g., it's all black), use full dimensions of mat1
        cropRect = new cv.Rect(0, 0, mat1.cols, mat1.rows);
      }
      
      // ROI can't have zero or negative width/height
      if (cropRect.width <= 0 || cropRect.height <= 0) {
          // If cropRect is invalid, default to full images (or handle error appropriately)
          // For simplicity, let's assume this means no valid overlap or content to compare meaningfully with this method.
          // We could send back an empty result or one of the original images.
          // Here, we'll send an empty highlight for now if crop is invalid.
          img1_crop = mat1.clone(); // Or a small empty mat
          aligned_crop = aligned.clone();
          mask_filtered = cv.Mat.zeros(img1_crop.rows, img1_crop.cols, cv.CV_8U); // Empty diff mask
      } else {
          img1_crop = mat1.roi(cropRect);
          aligned_crop = aligned.roi(cropRect);
          mask_overlap = maskAlignedFull.roi(cropRect); // Mask of where 'aligned_crop' has content

          diffMat = new cv.Mat();
          cv.absdiff(img1_crop, aligned_crop, diffMat);
          gray_diff = new cv.Mat();
          cv.cvtColor(diffMat, gray_diff, cv.COLOR_RGBA2GRAY);

          blurred = new cv.Mat();
          cv.GaussianBlur(gray_diff, blurred, new cv.Size(GAUSSIAN_BLUR_SIZE_W, GAUSSIAN_BLUR_SIZE_H), 0);

          mask_diff = new cv.Mat();
          cv.threshold(blurred, mask_diff, DIFF_INTENSITY_THRESHOLD, 255, cv.THRESH_BINARY);

          kernel = cv.Mat.ones(MORPH_KERNEL_SIZE_H, MORPH_KERNEL_SIZE_W, cv.CV_8U);
          cv.morphologyEx(mask_diff, mask_diff, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), MORPH_CLOSE_ITERATIONS);

          allContours = new cv.MatVector();
          tempHierarchy = new cv.Mat(); // For the second findContours
          cv.findContours(mask_diff, allContours, tempHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
          
          mask_filtered = cv.Mat.zeros(mask_diff.rows, mask_diff.cols, cv.CV_8U);
          for (let i = 0; i < allContours.size(); ++i) {
            if (cv.contourArea(allContours.get(i)) > MIN_DIFF_CONTOUR_AREA) {
              cv.drawContours(mask_filtered, allContours, i, new cv.Scalar(255), -1);
            }
          }

          // If alignment was successful, ensure differences are only in the overlapping content area
          if (!fallback && mask_overlap && !mask_overlap.empty() && !mask_filtered.empty() && 
              mask_filtered.cols === mask_overlap.cols && mask_filtered.rows === mask_overlap.rows) {
            cv.bitwise_and(mask_filtered, mask_overlap, mask_filtered);
          }
      }


      highlight = img1_crop.clone();
      if (!mask_filtered.empty() && highlight.cols === mask_filtered.cols && highlight.rows === mask_filtered.rows) {
        highlight.setTo(HIGHLIGHT_COLOR_RGBA, mask_filtered); // Apply red highlight where differences are
      }
      
      const outputImageData = new ImageData(new Uint8ClampedArray(highlight.data), highlight.cols, highlight.rows);
      self.postMessage({ 
        success: true, 
        result: { 
          width: highlight.cols, 
          height: highlight.rows, 
          data: outputImageData.data.buffer 
        }, 
        fallback 
      }, [outputImageData.data.buffer]);

    } catch (err) {
      console.error("Error in OpenCV worker:", err);
      self.postMessage({ success: false, error: err.message, fallback });
    } finally {
      // --- Clean up OpenCV objects ---
      const matsToDelete = [
        mat1, mat2, gray1, gray2, des1, des2, pts1Mat, pts2Mat, homography, aligned,
        maskAlignedFull, alignedGray, hierarchy, img1_crop, aligned_crop, mask_overlap,
        diffMat, gray_diff, blurred, mask_diff, kernel, tempHierarchy, mask_filtered, highlight
      ];
      matsToDelete.forEach(mat => { if (mat && mat.delete) mat.delete(); });

      const vectorsToDelete = [kp1, kp2, matchesVec, contours, allContours];
      vectorsToDelete.forEach(vec => { if (vec && vec.delete) vec.delete(); });

      if (orb && orb.delete) orb.delete();
      if (bf && bf.delete) bf.delete();
    }
  };
`;

      // --- 웹 워커 코드 종료 ---

      const blob = new Blob([workerCode], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { success, result, error, fallback } = e.data;
        URL.revokeObjectURL(workerUrl); // Blob URL 해제

        if (success && result) {
          const canvas = canvasRef.current;
          if (!canvas) {
            console.error("Canvas ref is not available.");
            setStatus("오류: Canvas 없음");
            isProcessing.current = false;
            reject(new Error("Canvas ref is not available."));
            return;
          }
          canvas.width = result.width;
          canvas.height = result.height;
          const ctx = canvas.getContext("2d");
          const imageData = new ImageData(
            new Uint8ClampedArray(result.data), // ArrayBuffer로부터 Uint8ClampedArray 생성
            result.width,
            result.height
          );
          ctx.putImageData(imageData, 0, 0);
          onProcessed && onProcessed(canvas.toDataURL("image/png"));
          setStatus(fallback ? "정렬 실패, 단순 비교 수행됨" : "처리 완료");
        } else {
          console.error("워커 분석 실패 또는 오류:", error);
          setStatus(
            "분석 실패: " +
              (error ? error.substring(0, 150) + "..." : "알 수 없는 오류")
          );
          onProcessed &&
            onProcessed(fallback && !result ? currentImageUrl : null);
        }
        isProcessing.current = false;
        worker.terminate(); // 워커 종료
        workerRef.current = null;
        resolve();
      };

      worker.onerror = (e) => {
        URL.revokeObjectURL(workerUrl); // Blob URL 해제
        console.error("워커 오류:", e.message, e);
        setStatus("워커 오류: " + e.message);
        isProcessing.current = false;
        onProcessed && onProcessed(null);
        worker.terminate(); // 워커 종료
        workerRef.current = null;
        reject(new Error("Worker 오류: " + e.message));
      };

      worker.postMessage(
        {
          img1DataBuffer: imageData1.data.buffer,
          img1Width: imageData1.width,
          img1Height: imageData1.height,
          img2DataBuffer: imageData2.data.buffer,
          img2Width: imageData2.width,
          img2Height: imageData2.height,
        },
        [imageData1.data.buffer, imageData2.data.buffer] // ArrayBuffer 전송
      );
    });
  };

  return (
    // 이 컴포넌트는 UI를 직접 렌더링하지 않고, 처리 결과를 canvas에 그린 후
    // onProcessed 콜백을 통해 부모에게 Data URL을 전달합니다.
    // 따라서 실제 canvas는 보이지 않도록 스타일링합니다.
    <div style={{ display: "none" }}>
      <canvas ref={canvasRef} />
    </div>
  );
});

export default ImageAligner;
