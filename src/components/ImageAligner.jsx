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
      if (workerRef.current) workerRef.current.terminate();
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
      processTimeoutRef.current = setTimeout(startImageProcessing, 300);
    }
  };

  const startImageProcessing = async () => {
    if (
      !firstImageUrl ||
      !currentImageUrl ||
      isProcessing.current ||
      firstImageUrl === currentImageUrl
    ) {
      onProcessed && onProcessed(firstImageUrl);
      return;
    }
    if (!isOpenCVLoaded) {
      openCVLoadCallbacks.push(() => startImageProcessing());
      return;
    }

    isProcessing.current = true;
    setStatus("이미지 로드 중...");
    try {
      const [img1, img2] = await Promise.all([
        loadImage(firstImageUrl),
        loadImage(currentImageUrl),
      ]);
      const [resized1, resized2] = await Promise.all([
        resizeImage(img1),
        resizeImage(img2),
      ]);

      const [img1r, img2r] = await Promise.all([
        loadImage(resized1),
        loadImage(resized2),
      ]);
      await processWithWorker(img1r, img2r);
      URL.revokeObjectURL(resized1);
      URL.revokeObjectURL(resized2);
    } catch (e) {
      console.error("처리 오류", e);
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
      img.onerror = () => reject(new Error("이미지 로드 실패: " + src));
      img.src = src;
    });

  const processWithWorker = (img1, img2) =>
    new Promise((resolve, reject) => {
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

      const code = `
      importScripts("https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.7.0-release.1/dist/opencv.js");
      
      self.onmessage = function (e) {
        const { img1Data, img2Data, width, height } = e.data;
      
        let Module = {
          onRuntimeInitialized() {
            try {
              // 1. 이미지 초기화
              const img1Mat = cv.matFromImageData(new ImageData(new Uint8ClampedArray(img1Data), width, height));
              const img2Mat = cv.matFromImageData(new ImageData(new Uint8ClampedArray(img2Data), width, height));
      
              // 2. Grayscale 변환
              const gray1 = new cv.Mat();
              const gray2 = new cv.Mat();
              cv.cvtColor(img1Mat, gray1, cv.COLOR_RGBA2GRAY);
              cv.cvtColor(img2Mat, gray2, cv.COLOR_RGBA2GRAY);
      
              // 3. SIFT 특징 추출
              const sift = new cv.SIFT();
              const kp1 = new cv.KeyPointVector();
              const kp2 = new cv.KeyPointVector();
              const des1 = new cv.Mat();
              const des2 = new cv.Mat();
              sift.detectAndCompute(gray1, new cv.Mat(), kp1, des1);
              sift.detectAndCompute(gray2, new cv.Mat(), kp2, des2);
      
              // 4. 매칭 및 호모그래피 계산
              const bf = new cv.BFMatcher(cv.NORM_L2, false);
              const matches = new cv.DMatchVectorVector();
              bf.knnMatch(des2, des1, matches, 2);
      
              let good = [];
              for (let i = 0; i < matches.size(); i++) {
                const m = matches.get(i).get(0);
                const n = matches.get(i).get(1);
                if (m.distance < 0.75 * n.distance) {
                  good.push([m.trainIdx, m.queryIdx]);
                }
              }
      
              if (good.length < 4) {
                throw new Error("호모그래피 계산을 위한 매칭 부족");
              }
      
              const pts1 = cv.matFromArray(good.length, 1, cv.CV_32FC2, [].concat(...good.map(([i, _]) => [kp1.get(i).pt.x, kp1.get(i).pt.y])));
              const pts2 = cv.matFromArray(good.length, 1, cv.CV_32FC2, [].concat(...good.map(([_, j]) => [kp2.get(j).pt.x, kp2.get(j).pt.y])));
              const M = cv.findHomography(pts2, pts1, cv.RANSAC, 3.0);
      
              // 5. 이미지 정렬
              const aligned = new cv.Mat();
              const dsize = new cv.Size(width, height);
              cv.warpPerspective(img2Mat, aligned, M, dsize, cv.INTER_CUBIC);
      
              // 6. 차이 계산 및 강조
              const diff = new cv.Mat();
              cv.absdiff(img1Mat, aligned, diff);
              const grayDiff = new cv.Mat();
              cv.cvtColor(diff, grayDiff, cv.COLOR_RGBA2GRAY);
              const blurred = new cv.Mat();
              cv.GaussianBlur(grayDiff, blurred, new cv.Size(5, 5), 0);
      
              const mask = new cv.Mat();
              cv.threshold(blurred, mask, 60, 255, cv.THRESH_BINARY);
      
              const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
              cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
      
              // 결과 덮어쓰기
              for (let y = 0; y < mask.rows; y++) {
                for (let x = 0; x < mask.cols; x++) {
                  if (mask.ucharPtr(y, x)[0] > 0) {
                    img1Mat.ucharPtr(y, x)[0] = 0;   // R
                    img1Mat.ucharPtr(y, x)[1] = 0;   // G
                    img1Mat.ucharPtr(y, x)[2] = 255; // B
                    img1Mat.ucharPtr(y, x)[3] = 255; // A
                  }
                }
              }
      
              // 반환
              self.postMessage({
                success: true,
                result: {
                  width: img1Mat.cols,
                  height: img1Mat.rows,
                  data: img1Mat.data.buffer
                }
              }, [img1Mat.data.buffer]);
      
              // 메모리 해제
              img1Mat.delete(); img2Mat.delete(); aligned.delete(); gray1.delete(); gray2.delete();
              kp1.delete(); kp2.delete(); des1.delete(); des2.delete(); matches.delete();
              diff.delete(); grayDiff.delete(); blurred.delete(); mask.delete(); kernel.delete(); M.delete();
              pts1.delete(); pts2.delete(); sift.delete(); bf.delete();
      
            } catch (err) {
              self.postMessage({ success: false, error: err.message });
            }
          }
        };
      };
      `;

      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { success, result, error } = e.data;

        if (success && result) {
          const canvas = canvasRef.current;
          canvas.width = result.width;
          canvas.height = result.height;
          const ctx = canvas.getContext("2d");
          const imageData = new ImageData(
            new Uint8ClampedArray(result.data),
            result.width,
            result.height
          );
          ctx.putImageData(imageData, 0, 0);

          // ✅ 분석 성공 로그
          console.log("✅ Worker 분석 완료", result);

          onProcessed && onProcessed(canvas.toDataURL("image/png"));
          setStatus("처리 완료");
          isProcessing.current = false;
          resolve();
        } else if (error) {
          // ❌ 분석 실패 로그
          console.error("❌ Worker 분석 실패:", error);
          setStatus("분석 실패: " + error);
          isProcessing.current = false;
          onProcessed && onProcessed(null);
          reject(new Error(error));
        }

        worker.terminate();
        URL.revokeObjectURL(url);
      };

      worker.onerror = (e) => {
        console.error("❌ Worker 오류:", e.message);
        setStatus("Worker 오류: " + e.message);
        isProcessing.current = false;
        onProcessed && onProcessed(null);
        reject(new Error("Worker 오류: " + e.message));
        worker.terminate();
        URL.revokeObjectURL(url);
      };

      worker.postMessage(
        {
          img1Data: imageData1.data.buffer, // Pass ArrayBuffer for transferability
          img2Data: imageData2.data.buffer, // Pass ArrayBuffer for transferability
          width: img1.width,
          height: img1.height,
        },
        [imageData1.data.buffer, imageData2.data.buffer]
      ); // Transferable objects
    });

  return (
    <div style={{ display: "none" }}>
      <canvas ref={canvasRef} width="800" height="600" />
    </div>
  );
});

export default ImageAligner;
