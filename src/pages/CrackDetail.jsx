import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CustomDropdown from "../components/CustomDropdown";
import { API_BASE_URL } from "../config/api";

import styles from "../styles/CrackDetail.module.css";
import KeyMetricCard from "../components/KeyMetricCard";
import GraphCard from "../components/GraphCard";
import ImageCard from "../components/ImageCard";
import KakaoMapCard from "../components/KakaoMapCard";
import RiskRankingCard from "../components/RiskRankingCard";

function CrackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [building, setBuilding] = useState(null);
  const [allBuildings, setAllBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 현재 건물 데이터 로드
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/buildings/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("건물 데이터를 불러오는 데 실패했습니다");
        return res.json();
      })
      .then((data) => {
        setBuilding(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("데이터 로딩 실패:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  // 전체 건물 목록 로드
  useEffect(() => {
    fetch(`${API_BASE_URL}/buildings`)
      .then((res) => res.json())
      .then((data) => setAllBuildings(data))
      .catch((err) => console.error("건물 목록 로딩 실패:", err));
  }, []);

  const handleBuildingChange = (newId) => {
    if (newId && newId !== id) {
      navigate(`/building/${newId}`);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.contentContainer}>
          <div className={styles.loading}>로딩 중...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.contentContainer}>
          <div className={styles.error}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.contentContainer}>
        {/* 상단 드롭다운으로 건물 선택 */}
        <div className={styles.buildingSelector}>
          <CustomDropdown
            value={id}
            onChange={handleBuildingChange}
            options={allBuildings.map((b) => ({
              value: b.id,
              label: b.name,
            }))}
          />
        </div>

        <main className={styles.main}>
          <div className={styles.dashboardGrid}>
            <div
              className={styles.gridItem}
              style={{ gridColumn: "1", gridRow: "1" }}
            >
              <KakaoMapCard buildingId={id} buildingData={building} />
            </div>
            <div
              className={styles.gridItem}
              style={{ gridColumn: "2 / span 2", gridRow: "1" }}
            >
              <ImageCard buildingId={id} buildingData={building} />
            </div>
            <div
              className={styles.gridItem}
              style={{ gridColumn: "1", gridRow: "2" }}
            >
              <GraphCard buildingId={id} buildingData={building} />
            </div>
            <div
              className={styles.gridItem}
              style={{ gridColumn: "2", gridRow: "2" }}
            >
              <RiskRankingCard buildingId={id} buildingData={building} />
            </div>
            <div
              className={styles.gridItem}
              style={{ gridColumn: "3", gridRow: "2" }}
            >
              <KeyMetricCard buildingId={id} buildingData={building} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default CrackDetail;
