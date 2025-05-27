import React, { useState, useEffect } from "react";
import styles from "./RiskRankingCard.module.css";
import { API_BASE_URL } from "../config/api";
import VWorldMaps from "./VWorldMaps";

export default function RiskRankingCard({ buildingId, buildingData }) {
  const [clusterData, setClusterData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [buildingName, setBuildingName] = useState("");

  const [showVWorldMap, setShowVWorldMap] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const handleVWorldMapClose = () => {
    setShowVWorldMap(false);
  };

  const handleCrackClick = (point) => {
    if (point.location && point.location.latitude && point.location.longitude) {
      const baseHeight = point.location.altitude || 100;
      const cameraHeight = baseHeight + 20;

      setSelectedLocation({
        latitude: point.location.latitude,
        longitude: point.location.longitude,
        altitude: cameraHeight,
        waypointId: String(point.id),
      });

      setTimeout(() => {
        setShowVWorldMap(true);
      }, 50);
    } else {
      console.warn("선택한 지점에 위치 정보가 없습니다:", point);
    }
  };

  useEffect(() => {
    if (buildingId) {
      if (buildingData) {
        processBuilding(buildingData);
        return;
      }

      setLoading(true);
      fetch(`${API_BASE_URL}/buildings/${buildingId}`)
        .then((res) => {
          if (!res.ok)
            throw new Error("건물 데이터를 불러오는 데 실패했습니다.");
          return res.json();
        })
        .then((data) => {
          processBuilding(data);
        })
        .catch((err) => {
          console.error("데이터 로딩 실패:", err);
          setError(err.message);
          setLoading(false);
        });
    }
  }, [buildingId, buildingData]);

  const processBuilding = (data) => {
    setBuildingName(data.name || "전체 건물");

    const pointsData = data.waypoints
      ? data.waypoints.map((point) => {
          if (!point.cracks || point.cracks.length === 0) {
            return {
              id: point.id,
              label: point.label,
              latestWidth: 0,
              timestamp: null,
              location: point.location,
              crackType: null,
            };
          }

          const sortedCracks = [...point.cracks].sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
          );

          return {
            id: point.id,
            label: point.label,
            latestWidth: sortedCracks[0].widthMm || 0,
            timestamp: sortedCracks[0].timestamp,
            location: point.location,
            crackType: sortedCracks[0].crackType || "미지정",
          };
        })
      : [];

    const sortedPoints = [...pointsData].sort((a, b) => {
      if (b.latestWidth === a.latestWidth) {
        return a.label.localeCompare(b.label);
      }
      return b.latestWidth - a.latestWidth;
    });

    setClusterData(sortedPoints);
    setLoading(false);
  };

  const getSeverityColor = (width) => {
    if (width >= 1.0) return "#e73c3c"; // 위험
    if (width >= 0.3) return "#FFDC3E"; // 주의
    return "#66cc66"; // 관찰
  };

  const getSeverityLabel = (width) => {
    if (width >= 1.0) return "위험";
    if (width >= 0.3) return "주의";
    return "관찰";
  };

  const getSeverityButtonClass = (width) => {
    if (width >= 1.0) return styles.severityHigh;
    if (width >= 0.3) return styles.severityMedium;
    return styles.severityLow;
  };

  const getClusterStats = () => {
    if (!clusterData || clusterData.length === 0) return null;

    const critical = clusterData.filter((p) => p.latestWidth >= 1.0).length;
    const warning = clusterData.filter(
      (p) => p.latestWidth >= 0.3 && p.latestWidth < 1.0
    ).length;
    const observe = clusterData.filter((p) => p.latestWidth < 0.3).length;

    return { critical, warning, observe };
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
  };

  const stats = getClusterStats();

  return (
    <div className={styles.clusterCard}>
      {loading ? (
        <div className={styles.loading}>데이터를 불러오는 중...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : clusterData.length === 0 ? (
        <div className={styles.noData}>
          해당 구조물의 측정 데이터가 없습니다.
        </div>
      ) : (
        <>
          {stats && (
            <div className={styles.statsContainer}>
              <div className={styles.statItem} style={{ color: "#e73c3c" }}>
                <div className={styles.statValue}>{stats.critical}</div>
                <div className={styles.statLabel}>위험</div>
              </div>
              <div className={styles.statItem} style={{ color: "#FFDC3E" }}>
                <div className={styles.statValue}>{stats.warning}</div>
                <div className={styles.statLabel}>주의</div>
              </div>
              <div className={styles.statItem} style={{ color: "#66cc66" }}>
                <div className={styles.statValue}>{stats.observe}</div>
                <div className={styles.statLabel}>관찰</div>
              </div>
            </div>
          )}

          <div className={styles.clusterContent}>
            <div className={styles.clusterList}>
              {clusterData.map((point) => (
                <div
                  key={point.id}
                  className={styles.clusterItem}
                  onClick={() => handleCrackClick(point)}
                >
                  <div className={styles.leftSection}>
                    <div
                      className={styles.statusIndicator}
                      style={{
                        backgroundColor: getSeverityColor(point.latestWidth),
                      }}
                    ></div>
                    <div className={styles.pointInfo}>
                      <div className={styles.pointLabel}>{point.label}</div>
                      <div className={styles.pointMeta}>
                        {point.timestamp && (
                          <>
                            <span className={styles.date}>
                              {formatDate(point.timestamp)}
                            </span>
                            <span className={styles.dot}>•</span>
                          </>
                        )}
                        <span className={styles.width}>
                          {point.latestWidth}mm
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    className={`${
                      styles.severityButton
                    } ${getSeverityButtonClass(point.latestWidth)}`}
                  >
                    {getSeverityLabel(point.latestWidth)}
                  </button>
                  {point.crackType && (
                    <span className={styles.crackTypeTag}>
                      {point.crackType}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showVWorldMap && selectedLocation && (
        <VWorldMaps
          visible={showVWorldMap}
          onClose={handleVWorldMapClose}
          latitude={selectedLocation.latitude}
          longitude={selectedLocation.longitude}
          height={selectedLocation.altitude}
          buildingId={buildingId}
          waypointId={selectedLocation.waypointId}
        />
      )}
    </div>
  );
}
