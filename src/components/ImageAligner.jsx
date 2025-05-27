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
  self.onmessage = function (e) {
    try {
      const { img1Data, img2Data, width, height } = e.data;
      const img1 = new Uint8ClampedArray(img1Data);
      const img2 = new Uint8ClampedArray(img2Data);

      // 1. 이미지 그레이 변환
      const toGray = (data) => {
        const gray = new Uint8ClampedArray(width * height);
        for (let i = 0; i < width * height; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
        return gray;
      };

      const gray1 = toGray(img1);
      const gray2 = toGray(img2);

      // 2. 절대차이 계산
      const diff = new Uint8ClampedArray(width * height);
      for (let i = 0; i < diff.length; i++) {
        diff[i] = Math.abs(gray1[i] - gray2[i]);
      }

      // 3. 이진화 (threshold = 40)
      const mask = new Uint8ClampedArray(width * height);
      for (let i = 0; i < mask.length; i++) {
        mask[i] = diff[i] > 40 ? 255 : 0;
      }

      // 4. 빨간색 표시된 결과 이미지 생성
      const result = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        if (mask[i]) {
          result[i * 4] = 255;     // R
          result[i * 4 + 1] = 0;   // G
          result[i * 4 + 2] = 0;   // B
          result[i * 4 + 3] = 255; // A
        } else {
          result[i * 4] = img2[i * 4];
          result[i * 4 + 1] = img2[i * 4 + 1];
          result[i * 4 + 2] = img2[i * 4 + 2];
          result[i * 4 + 3] = 255;
        }
      }

      self.postMessage({
        success: true,
        result: {
          width: width,
          height: height,
          data: result.buffer
        }
      }, [result.buffer]);
    } catch (err) {
      self.postMessage({ success: false, error: err.message });
    }
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
