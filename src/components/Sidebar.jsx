import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
import styles from "./Sidebar.module.css";

/**
 * Sidebar 컴포넌트
 * 애플리케이션의 좌측에 표시되는 내비게이션 사이드바입니다.
 * 주요 페이지로의 링크와 아이콘을 제공합니다.
 */
export default function Sidebar() {
  const location = useLocation();
  const [firstBuildingId, setFirstBuildingId] = useState(null);

  // 첫 번째 건물 ID 가져오기
  useEffect(() => {
    fetch(`${API_BASE_URL}/buildings`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("건물 목록을 불러오는 데 실패했습니다");
        }
        return res.json();
      })
      .then((data) => {
        if (data && data.length > 0) {
          setFirstBuildingId(data[0].id);
        }
      })
      .catch((err) => {
        console.error("건물 목록 불러오기 실패:", err);
        // 에러 발생 시 기본값으로 27 사용
        setFirstBuildingId(28);
      });
  }, []);

  return (
    <div className={styles.sidebar}>
      {/* 대시보드 링크 */}
      <div
        className={`${styles.logo} ${
          location.pathname === "/" ? styles.active : ""
        }`}
      >
        <Link to="/">
          <img src="/logo.svg" alt="대시보드" title="대시보드" />
        </Link>
      </div>

      {/* 건물 통계 링크 */}
      <div
        className={`${styles.logo} ${
          location.pathname.startsWith("/building/") ? styles.active : ""
        }`}
      >
        {firstBuildingId ? (
          <Link to={`/building/${firstBuildingId}`}>
            <img src="/buildings.svg" alt="건물 통계" title="건물 통계" />
          </Link>
        ) : (
          <div>
            <img src="/buildings.svg" alt="건물 통계" title="건물 통계" />
          </div>
        )}
      </div>
    </div>
  );
}
