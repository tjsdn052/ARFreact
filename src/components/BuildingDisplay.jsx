import React, { useState, useEffect, memo, useMemo } from "react";
import styles from "./BuildingDisplay.module.css";
import { API_BASE_URL } from "../config/api";

// 캐시를 저장할 객체
const buildingCache = {};

// 이전 렌더링 추적을 위한 변수
let renderCount = 0;

function BuildingDisplayComponent({ buildingId }) {
  const renderCountRef = ++renderCount;
  console.log(
    `[BuildingDisplay #${renderCountRef}] 컴포넌트 렌더링 시작`,
    new Date().toISOString()
  );

  const [buildingName, setBuildingName] = useState("");
  const [loading, setLoading] = useState(true);

  // buildingId가 변경될 때마다 건물 정보 가져오기
  useEffect(() => {
    console.log(
      `[BuildingDisplay #${renderCountRef}] useEffect 실행됨 (의존성: [${buildingId}])`,
      new Date().toISOString()
    );

    // 유효한 buildingId가 없으면 API 호출 건너뛰기
    if (!buildingId) {
      console.log(
        `[BuildingDisplay #${renderCountRef}] buildingId 없음, API 호출 건너뜀`,
        new Date().toISOString()
      );
      return;
    }

    // 이펙트 클린업 추적
    const effectId = Math.random().toString(36).substr(2, 9);
    console.log(
      `[BuildingDisplay #${renderCountRef}] 이펙트 ${effectId} 시작`,
      new Date().toISOString()
    );

    async function fetchBuildingInfo() {
      const startTime = new Date();

      // 1. 캐시 확인
      if (buildingCache[buildingId]) {
        console.log(
          `[BuildingDisplay #${renderCountRef}] 캐시에서 데이터 로드됨`,
          new Date().toISOString()
        );
        setBuildingName(buildingCache[buildingId]);
        setLoading(false);
        return;
      }

      console.log(
        `[BuildingDisplay #${renderCountRef}] API 요청 시작`,
        startTime.toISOString()
      );
      try {
        setLoading(true);

        // API 요청에 타임아웃 적용
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // buildingId에 대한 건물 정보 가져오기
        const response = await fetch(`${API_BASE_URL}/buildings/${buildingId}`);

        clearTimeout(timeoutId);

        console.log(
          `[BuildingDisplay #${renderCountRef}] API 응답 수신`,
          new Date().toISOString(),
          `(소요시간: ${new Date() - startTime}ms)`
        );

        if (!response.ok) {
          throw new Error("건물 정보를 불러오는 데 실패했습니다.");
        }

        // 응답 처리
        const building = await response.json();

        console.log(
          `[BuildingDisplay #${renderCountRef}] 데이터 처리 완료`,
          new Date().toISOString(),
          `(소요시간: ${new Date() - startTime}ms)`
        );

        // 건물 이름만 캐싱
        buildingCache[buildingId] = building.name;
        setBuildingName(building.name);
      } catch (error) {
        if (error.name === "AbortError") {
          console.error(
            `[BuildingDisplay #${renderCountRef}] 요청 타임아웃`,
            new Date().toISOString()
          );
        } else {
          console.error(
            `[BuildingDisplay #${renderCountRef}] 건물 정보 가져오기 실패:`,
            error,
            new Date().toISOString()
          );
        }
        setBuildingName("정보 없음");
      } finally {
        setLoading(false);
        console.log(
          `[BuildingDisplay #${renderCountRef}] 로딩 완료`,
          new Date().toISOString(),
          `(총 소요시간: ${new Date() - startTime}ms)`
        );
      }
    }

    fetchBuildingInfo();

    // 클린업 함수
    return () => {
      console.log(
        `[BuildingDisplay #${renderCountRef}] 이펙트 ${effectId} 클린업`,
        new Date().toISOString()
      );
    };
  }, [buildingId]);

  console.log(
    `[BuildingDisplay #${renderCountRef}] 렌더링 반환`,
    new Date().toISOString()
  );

  return (
    <div className={styles.container}>
      <div className={styles.displayBox}>
        <span>{loading ? "로딩 중..." : buildingName}</span>
      </div>
    </div>
  );
}

// React.memo로 컴포넌트 래핑하여 불필요한 리렌더링 방지
const BuildingDisplay = memo(
  BuildingDisplayComponent,
  (prevProps, nextProps) => {
    const areEqual = prevProps.buildingId === nextProps.buildingId;
    console.log(
      `[BuildingDisplay] 메모이제이션 비교: ${areEqual ? "동일함" : "다름"}`,
      prevProps.buildingId,
      nextProps.buildingId,
      new Date().toISOString()
    );
    return areEqual;
  }
);

export default BuildingDisplay;
