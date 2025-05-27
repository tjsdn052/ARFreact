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

      // --- 웹 워커 코드 시작 ---
      const workerCode = `
      importScripts('https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.7.0-release.1/dist/opencv.js');
    
      let isReady = false;
      cv['onRuntimeInitialized'] = () => { isReady = true; };
    
      self.onmessage = function (e) {
        if (!isReady) {
          setTimeout(() => self.onmessage(e), 50);
          return;
        }
    
        const { img1DataBuffer, img1Width, img1Height, img2DataBuffer, img2Width, img2Height } = e.data;
    
        let mat1, mat2, gray1, gray2, orb, kp1, des1, kp2, des2;
        let matchesVec, pts1, pts2, homography, aligned, grayAligned, maskAligned;
        let diff, blurred, mask, result;
    
        try {
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
          orb.detectAndCompute(gray1, new cv.Mat(), kp1, des1);
          orb.detectAndCompute(gray2, new cv.Mat(), kp2, des2);
    
          if (des1.empty() || des2.empty()) throw new Error("No descriptors found.");
    
          const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
          matchesVec = new cv.DMatchVectorVector();
          bf.knnMatch(des2, des1, matchesVec, 2);
    
          pts1 = []; pts2 = [];
          for (let i = 0; i < matchesVec.size(); i++) {
            const m = matchesVec.get(i).get(0);
            const n = matchesVec.get(i).get(1);
            if (m.distance < 0.75 * n.distance) {
              const p1 = kp1.get(m.trainIdx).pt;
              const p2 = kp2.get(m.queryIdx).pt;
              pts1.push(p1.x, p1.y);
              pts2.push(p2.x, p2.y);
            }
          }
    
          if (pts1.length < 8) throw new Error("Not enough good matches.");
    
          const pts1Mat = cv.matFromArray(pts1.length / 2, 1, cv.CV_32FC2, pts1);
          const pts2Mat = cv.matFromArray(pts2.length / 2, 1, cv.CV_32FC2, pts2);
          homography = cv.findHomography(pts2Mat, pts1Mat, cv.RANSAC);
    
          aligned = new cv.Mat();
          cv.warpPerspective(mat2, aligned, homography, new cv.Size(mat1.cols, mat1.rows));
    
          grayAligned = new cv.Mat();
          cv.cvtColor(aligned, grayAligned, cv.COLOR_RGBA2GRAY);
    
          maskAligned = new cv.Mat();
          cv.threshold(grayAligned, maskAligned, 1, 255, cv.THRESH_BINARY); // 정합된 부분만 255
    
          diff = new cv.Mat();
          cv.absdiff(gray1, grayAligned, diff);
    
          blurred = new cv.Mat();
          cv.GaussianBlur(diff, blurred, new cv.Size(5, 5), 0);
    
          mask = new cv.Mat();
          cv.threshold(blurred, mask, 40, 255, cv.THRESH_BINARY);
    
          result = aligned.clone(); // 원본(aligned)을 기반으로
    
          for (let y = 0; y < mask.rows; y++) {
            for (let x = 0; x < mask.cols; x++) {
              const isDiff = mask.ucharPtr(y, x)[0] === 255;
              const isInside = maskAligned.ucharPtr(y, x)[0] === 255;
              if (isDiff && isInside) {
                const pixel = result.ucharPtr(y, x);
                pixel[0] = 255; pixel[1] = 0; pixel[2] = 0; // 빨간색 표시
              }
            }
          }
    
          const output = new ImageData(new Uint8ClampedArray(result.data), result.cols, result.rows);
          self.postMessage({ success: true, result: { width: result.cols, height: result.rows, data: output.data.buffer } }, [output.data.buffer]);
    
        } catch (err) {
          self.postMessage({ success: false, error: err.message });
        } finally {
          [mat1, mat2, gray1, gray2, des1, des2, kp1, kp2, matchesVec, homography,
           aligned, grayAligned, maskAligned, diff, blurred, mask, result].forEach(m => { if (m) m.delete(); });
          if (orb) orb.delete();
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
