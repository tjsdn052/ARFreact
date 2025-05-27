import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./ImagePopup.module.css";

// ✅ S3 URL → Netlify 프록시 경로로 변환
function applyProxy(url) {
  if (!url) return null;
  return url.replace(
    "https://arc-risk-finder.s3.ap-northeast-2.amazonaws.com",
    "/proxy-image"
  );
}

const ImagePopup = ({ imageUrl, description, onClose, metadata }) => {
  const [compareMode, setCompareMode] = useState(false);
  const [analysisMode, setAnalysisMode] = useState(false);
  const [alignedImageUrl, setAlignedImageUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");

  // ✅ 프록시 경로로 변환한 이미지 URL 사용
  const proxiedCurrentImage = applyProxy(imageUrl);
  const proxiedFirstImage = applyProxy(metadata?.firstImageUrl || null);
  const hasFirstImage = Boolean(proxiedFirstImage);

  const alignerRef = useRef(null);
  const contentRef = useRef(null);

  const toggleCompareMode = () => {
    if (hasFirstImage) {
      setCompareMode(!compareMode);
      setAnalysisMode(false);
      setAlignedImageUrl(null);
    }
  };

  const toggleAnalysisMode = () => {
    if (hasFirstImage) {
      setAnalysisMode(!analysisMode);
      if (!analysisMode && !alignedImageUrl) {
        processImages();
      }
    }
  };

  const processImages = async () => {
    if (!proxiedFirstImage || !proxiedCurrentImage) {
      console.warn("⚠️ 분석할 이미지 URL이 없습니다");
      return;
    }

    setIsProcessing(true);
    setProcessingStatus("이미지 분석 중...");

    try {
      const ImageAlignerModule = await import("./ImageAligner").catch(
        () => null
      );
      if (!ImageAlignerModule)
        throw new Error("ImageAligner 모듈을 로드할 수 없습니다.");
      const ImageAligner = ImageAlignerModule.default;

      const tempDiv = document.createElement("div");
      document.body.appendChild(tempDiv);

      const aligner = document.createElement("div");
      tempDiv.appendChild(aligner);

      const handleProcessed = (resultImageUrl) => {
        setAlignedImageUrl(resultImageUrl);
        setIsProcessing(false);
        setProcessingStatus("");
        document.body.removeChild(tempDiv);
      };

      const { createRoot } = await import("react-dom/client");
      const root = createRoot(aligner);
      root.render(
        <ImageAligner
          firstImageUrl={proxiedFirstImage}
          currentImageUrl={proxiedCurrentImage}
          onProcessed={handleProcessed}
          ref={alignerRef}
        />
      );
    } catch (error) {
      console.error("❌ 이미지 분석 오류:", error);
      setIsProcessing(false);
      setProcessingStatus("이미지 분석 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    return () => {
      if (alignerRef.current?.abort) alignerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const crackWidth = metadata?.width || metadata?.crackWidth || null;

  const popup = (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div
        className={styles.popupContent}
        onClick={(e) => e.stopPropagation()}
        ref={contentRef}
      >
        <div className={styles.popupHeader}>
          <h3 className={styles.popupTitle}>{description}</h3>
          <div className={styles.headerRight}>
            {crackWidth && (
              <div className={styles.crackWidthBadge}>
                균열 폭: {crackWidth}
              </div>
            )}
            <button className={styles.closeButton} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className={styles.imageContainer}>
          {isProcessing ? (
            <div className={styles.processingContainer}>
              <div className={styles.spinner}></div>
              <p className={styles.processingText}>
                {processingStatus || "처리 중..."}
              </p>
            </div>
          ) : analysisMode && alignedImageUrl ? (
            <div className={styles.analysisContainer}>
              <img
                src={alignedImageUrl}
                alt="균열 변화 분석"
                className={styles.popupImage}
              />
            </div>
          ) : analysisMode && !alignedImageUrl ? (
            <div className={styles.analysisError}>
              분석 결과를 불러오지 못했습니다. (정렬 실패 또는 매칭 부족)
            </div>
          ) : compareMode ? (
            <div className={styles.compareContainer}>
              <div className={styles.compareImageWrapper}>
                <img
                  src={proxiedFirstImage}
                  alt="첫 관측 이미지"
                  className={styles.compareImage}
                />
                <div className={styles.compareLabel}>
                  첫 관측 ({metadata?.firstWidth || "측정값 없음"})
                </div>
              </div>
              <div className={styles.compareImageWrapper}>
                <img
                  src={proxiedCurrentImage}
                  alt={description}
                  className={styles.compareImage}
                />
                <div className={styles.compareLabel}>
                  최근 관측 ({metadata?.width || "측정값 없음"})
                </div>
              </div>
            </div>
          ) : (
            <img
              src={proxiedCurrentImage}
              alt={description}
              className={styles.popupImage}
            />
          )}
        </div>

        <div className={styles.popupFooter}>
          {analysisMode && alignedImageUrl && (
            <div className={styles.analysisCaption}>
              <span className={styles.newCrackIndicator}></span> 첫 관측 대비
              변화를 보이는 부분
            </div>
          )}
          {hasFirstImage && (
            <div className={styles.buttonContainer}>
              <button
                className={`${styles.compareButton} ${
                  compareMode ? styles.active : ""
                }`}
                onClick={toggleCompareMode}
                disabled={isProcessing}
              >
                {compareMode ? "단일 이미지 보기" : "첫 관측과 비교하기"}
              </button>
              <button
                className={`${styles.analysisButton} ${
                  analysisMode ? styles.active : ""
                }`}
                onClick={toggleAnalysisMode}
                disabled={isProcessing}
              >
                {analysisMode ? "원본 이미지 보기" : "균열 변화 분석하기"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(popup, document.body);
};

export default ImagePopup;
