import React, { useRef, useState, useEffect } from "react";
import styles from "./ImageCard.module.css";
import { API_BASE_URL } from "../config/api";
import ImagePopup from "./ImagePopup";
import ImageGallery from "./ImageGallery";

/**
 * 균열 이미지 카드 컴포넌트
 *
 * 건물의 균열 이미지를 표시합니다.
 * buildingId가 제공되면 해당 건물의 최신 균열 이미지를 표시합니다.
 * @param {Object} props.buildingData 건물 데이터 객체 (선택적)
 */
export default function ImageCard({ buildingId, buildingData }) {
  const scrollContainerRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imagesPerRow, setImagesPerRow] = useState(2);
  const [buildingImages, setBuildingImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [buildingName, setBuildingName] = useState("");

  // 날짜 선택 관련 상태
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [filteredImages, setFilteredImages] = useState([]);

  // 이미지 URL 검증 함수
  const validateImageUrl = (url) => {
    if (!url) return null;

    // URL이 이미 절대 경로인 경우 그대로 반환
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    // 상대 경로인 경우 슬래시로 시작하는지 확인하고 수정
    if (!url.startsWith("/")) {
      return `/${url}`;
    }

    return url;
  };

  // buildingId가 변경될 때마다 해당 건물의 이미지 데이터를 가져옴
  useEffect(() => {
    if (!buildingId) {
      setLoading(false);
      return;
    }

    // buildingData가 있으면 사용
    if (buildingData) {
      processBuilding(buildingData);
      return;
    }

    setLoading(true);

    // API에서 건물 데이터 가져오기
    fetch(`${API_BASE_URL}/buildings/${buildingId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("건물 데이터를 불러오는 데 실패했습니다");
        }
        return response.json();
      })
      .then((building) => {
        processBuilding(building);
      })
      .catch((err) => {
        console.error("이미지 데이터 로드 실패:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [buildingId, buildingData]);

  // 건물 데이터 처리 함수
  const processBuilding = (building) => {
    setBuildingName(building.name || `건물 ${buildingId}`);

    // 웨이포인트와 균열 데이터에서 이미지 정보 추출
    const images = [];
    const dateSet = new Set();

    if (building.waypoints && building.waypoints.length > 0) {
      building.waypoints.forEach((waypoint) => {
        if (waypoint.cracks && waypoint.cracks.length > 0) {
          waypoint.cracks.forEach((crack) => {
            // 날짜 정보 추가
            if (crack.timestamp) {
              dateSet.add(crack.timestamp);
            }

            // 이미지 정보 추가
            if (crack.imageUrl) {
              images.push({
                url: crack.imageUrl,
                date: crack.timestamp,
                widthMm: crack.widthMm,
                pointLabel: waypoint.label || `웨이포인트 ${waypoint.id}`,
              });
            }
          });
        }
      });
    }

    setBuildingImages(images);

    // 고유한 날짜 목록 설정 (최신 날짜순으로 정렬)
    const dateArray = Array.from(dateSet).sort(
      (a, b) => new Date(b) - new Date(a)
    );
    setAvailableDates(dateArray);

    // 최신 날짜를 기본값으로 설정
    if (dateArray.length > 0) {
      setSelectedDate(dateArray[0]);
      // 선택된 날짜에 해당하는 이미지만 필터링
      const filtered = images.filter((img) => img.date === dateArray[0]);
      setFilteredImages(filtered);
    }

    setLoading(false);
  };

  // 날짜 변경 핸들러
  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);

    // 선택된 날짜에 해당하는 이미지만 필터링
    const filtered = buildingImages.filter((img) => img.date === newDate);
    setFilteredImages(filtered);
    setCurrentImageIndex(0);

    // 스크롤 위치 초기화
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
      setScrollLeft(0);
    }
  };

  // 날짜 포맷 함수 (YYYY-MM-DD 형식을 YYYY년 MM월 DD일 형식으로 변환)
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);

    // 한국어 날짜 형식으로 변환
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return `${year}년 ${month}월 ${day}일`;
  };

  // 날짜 선택 옵션 포맷 함수 (선택 목록에 표시될 형식)
  const formatDateOption = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);

    // 한국어 날짜 형식으로 변환
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}.${month}.${day}`;
  };

  // 최종적으로 표시할 이미지 배열
  const displayImages =
    filteredImages && filteredImages.length > 0
      ? filteredImages.map((wp) => {
          return {
            url: validateImageUrl(wp.url || wp.imageUrl),
            label: wp.label || wp.pointLabel,
            date: wp.date,
            widthMm: wp.widthMm,
          };
        })
      : [];

  // 컨테이너 크기 변경 감지
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    const updateContainerSize = () => {
      if (scrollContainerRef.current) {
        const { offsetWidth, offsetHeight } = scrollContainerRef.current;
        setContainerSize({ width: offsetWidth, height: offsetHeight });

        // 컨테이너 너비에 따라 이미지 개수 조정
        const width = offsetWidth;
        // 이미지 너비(240) + 갭(16) 고려하여 계산
        const calcImagesPerRow = Math.max(1, Math.floor(width / 260));
        setImagesPerRow(calcImagesPerRow);
      }
    };

    // 초기 크기 설정
    updateContainerSize();

    // 리사이즈 이벤트 감지
    const resizeObserver = new ResizeObserver(updateContainerSize);
    resizeObserver.observe(scrollContainerRef.current);

    return () => {
      if (scrollContainerRef.current) {
        resizeObserver.unobserve(scrollContainerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setScrollLeft(scrollLeft);
      setMaxScroll(scrollWidth - clientWidth);
    }
  };

  // 마우스 휠로 가로 스크롤 처리
  const handleWheel = (e) => {
    if (scrollContainerRef.current) {
      // 기본 스크롤 동작 방지
      e.preventDefault();

      // deltaY 값을 사용하여 가로 스크롤 조정 (deltaMode에 따른 배수 적용)
      const multiplier = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 100 : 1;
      scrollContainerRef.current.scrollLeft += e.deltaY * multiplier;
    }
  };

  // 컨테이너에 마우스 휠 이벤트 리스너 추가
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const wheelHandler = (e) => handleWheel(e);
    container.addEventListener("wheel", wheelHandler, { passive: false });

    return () => {
      container.removeEventListener("wheel", wheelHandler);
    };
  }, []);

  const handleScrollbarChange = (e) => {
    if (scrollContainerRef.current) {
      const newScrollLeft = Number.parseInt(e.target.value);
      scrollContainerRef.current.scrollLeft = newScrollLeft;
      setScrollLeft(newScrollLeft);
    }
  };

  // 균열 심각도에 따른 색상 계산
  const getCrackSeverityColor = (width) => {
    if (width >= 2.0) return "#cc3300"; // 심각
    if (width >= 1.0) return "#ff9933"; // 주의
    if (width >= 0.5) return "#ffdb4d"; // 관찰
    return "#66cc66"; // 양호
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h2 className={styles.title}>관측 사진</h2>
          {availableDates.length > 0 && (
            <div className={styles.dateSelector}>
              <select
                value={selectedDate || ""}
                onChange={handleDateChange}
                className={styles.dateSelect}
              >
                {availableDates.map((date) => (
                  <option key={date} value={date}>
                    {formatDateOption(date)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        className={styles.imageContainer}
        onScroll={handleScroll}
      >
        <ImageGallery
          images={displayImages}
          loading={loading}
          error={error}
          buildingId={buildingId}
          buildingImages={buildingImages}
          validateImageUrl={validateImageUrl}
        />
      </div>
    </div>
  );
}
