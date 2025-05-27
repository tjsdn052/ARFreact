import React from "react";
import { useParams } from "react-router-dom";
import styles from "./Header.module.css";
import BuildingDisplay from "./BuildingDisplay";

/**
 * Header 컴포넌트
 * 애플리케이션 상단에 표시되는 헤더 컴포넌트입니다.
 * crack/[id] 페이지에서만 사용되며 건물 정보를 표시합니다.
 */
export default function Header() {
  const { id: routerId } = useParams();

  // 라우터 파라미터의 ID 사용
  const buildingId = routerId;

  return (
    <div className={styles.headerContainer}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          {/* BuildingDisplay 표시 - 이 컴포넌트는 오직 crack/[id] 페이지에서만 사용됨 */}
        </div>
      </header>
    </div>
  );
}
