import React from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./Sidebar.module.css";

/**
 * Sidebar 컴포넌트
 * 애플리케이션의 좌측에 표시되는 내비게이션 사이드바입니다.
 * 주요 페이지로의 링크와 아이콘을 제공합니다.
 */
export default function Sidebar() {
  const location = useLocation();

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
        <Link to="/building/1">
          <img src="/buildings.svg" alt="건물 통계" title="건물 통계" />
        </Link>
      </div>
    </div>
  );
}
