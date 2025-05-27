import React, { useState, useEffect } from "react";
import styles from "./KeyMetricCard.module.css";
import { API_BASE_URL } from "../config/api";

function KeyMetricCard({ buildingId, buildingData: propsBuildingData }) {
  const [loading, setLoading] = useState(true);
  const [buildingData, setBuildingData] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [lastInspection, setLastInspection] = useState(null);

  useEffect(() => {
    if (!buildingId) {
      setLoading(false);
      return;
    }

    if (propsBuildingData) {
      setBuildingData(propsBuildingData);
      calculateMetrics(propsBuildingData);
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch(`${API_BASE_URL}/buildings/${buildingId}`)
      .then((res) => {
        if (!res.ok) throw new Error("건물 데이터를 불러오는 데 실패했습니다");
        return res.json();
      })
      .then((data) => {
        setBuildingData(data);
        calculateMetrics(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("건물 정보 로드 실패:", err);
        setLoading(false);
      });
  }, [buildingId, propsBuildingData]);

  const calculateMetrics = (data) => {
    if (!data || !data.waypoints) {
      setMetrics([]);
      return;
    }

    const cracksByDate = {};
    let latestDate = null;

    data.waypoints.forEach((waypoint) => {
      if (waypoint.cracks && waypoint.cracks.length > 0) {
        waypoint.cracks.forEach((crack) => {
          if (!crack.timestamp || isNaN(new Date(crack.timestamp))) return;
          const crackDate = new Date(crack.timestamp);
          const dateStr = crack.timestamp;

          if (!cracksByDate[dateStr]) {
            cracksByDate[dateStr] = {
              waypointIds: new Set(),
              maxWidth: 0,
            };
          }

          cracksByDate[dateStr].waypointIds.add(waypoint.id);
          cracksByDate[dateStr].maxWidth = Math.max(
            cracksByDate[dateStr].maxWidth,
            crack.widthMm || 0
          );

          if (!latestDate || crackDate > latestDate) {
            latestDate = crackDate;
          }
        });
      }
    });

    setLastInspection(latestDate ? latestDate.toISOString() : null);

    const sortedDates = Object.keys(cracksByDate).sort(
      (a, b) => new Date(b) - new Date(a)
    );

    const latestDateStr = sortedDates[0] || null;
    const previousDateStr = sortedDates[1] || null;

    const latestCrackCount = latestDateStr
      ? cracksByDate[latestDateStr].waypointIds.size
      : 0;

    const latestMaxWidth = latestDateStr
      ? cracksByDate[latestDateStr].maxWidth
      : 0;

    let crackCountChange = 0;
    if (latestDateStr && previousDateStr) {
      const previousCrackCount = cracksByDate[previousDateStr].waypointIds.size;
      crackCountChange = latestCrackCount - previousCrackCount;
    }

    setMetrics([
      {
        id: "crack_count",
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
            />
          </svg>
        ),
        label: "전체 균열 수",
        value: latestCrackCount,
        unit: "개",
        change: null,
        changeType: null,
      },
      {
        id: "max_width",
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
            />
          </svg>
        ),
        label: "최대 균열 폭",
        value: latestMaxWidth,
        unit: "mm",
        change: null,
        changeType: null,
      },
      {
        id: "crack_count_change",
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        ),
        label: "균열 변화량",
        value: Math.abs(crackCountChange),
        unit: "개",
        change: crackCountChange === 0 ? null : crackCountChange,
        changeType:
          crackCountChange > 0
            ? "increase"
            : crackCountChange < 0
            ? "decrease"
            : null,
      },
    ]);
  };

  if (loading) {
    return (
      <div className={styles.card}>{/* 로딩 중일 때는 빈 화면 표시 */}</div>
    );
  }

  return (
    <div className={styles.card}>
      {lastInspection && (
        <span className={styles.inspectionDate}>
          마지막 점검일: {new Date(lastInspection).toLocaleDateString("ko-KR")}
        </span>
      )}

      <div className={styles.metricsContainer}>
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className={
              metric.id === "crack_type_distribution"
                ? `${styles.metricItem} ${styles.donutMetricItem}`
                : styles.metricItem
            }
          >
            {metric.id === "crack_type_distribution" ? (
              <div className={styles.donutPlaceholder}>{metric.icon}</div>
            ) : (
              <div className={styles.metricIcon}>{metric.icon}</div>
            )}
            <div className={styles.metricContent}>
              {metric.value !== null && (
                <div className={styles.metricValue}>
                  {metric.value}
                  {metric.unit && (
                    <span className={styles.unit}>{metric.unit}</span>
                  )}
                  {metric.change && (
                    <span
                      className={`${styles[metric.changeType]}`}
                      style={{ fontSize: "0.8rem", marginLeft: "0.5rem" }}
                    >
                      {metric.changeType === "increase" ? "+" : ""}
                      {Math.abs(metric.change)}
                    </span>
                  )}
                </div>
              )}
              <div className={styles.metricLabel}>{metric.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default KeyMetricCard;
