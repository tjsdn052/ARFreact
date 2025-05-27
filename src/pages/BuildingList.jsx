import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { API_BASE_URL } from "../config/api";

import styles from "../styles/BuildingsPage.module.css";
import CustomDropdown from "../components/CustomDropdown"; // 추가

// 요약 카드 컴포넌트
function SummaryCard({ title, value }) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.cardTitle}>{title}</div>
      <div className={styles.cardValue}>{value}</div>
    </div>
  );
}

// 건물 카드 컴포넌트
function BuildingCard({ building }) {
  // 건물 이름을 기반으로 이미지 선택
  const getDefaultImage = () => {
    if (building.name) {
      // 건물 이름을 파일명으로 사용 (공백을 하이픈으로 변경, 특수문자 제거)
      const fileName = building.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      const imagePath = `images/${building.name}.png`;
      console.log(
        `건물: ${building.name} -> 파일명: ${fileName} -> 경로: ${imagePath}`
      );
      return imagePath;
    }

    // 건물 이름이 없으면 기본 이미지 사용
    return "images/default-building.jpg";
  };

  // 건물의 웨이포인트와 균열 정보 확인
  const waypoints = building.waypoints || [];
  const cracks = [];

  // 모든 웨이포인트의 모든 균열 정보 수집
  waypoints.forEach((waypoint) => {
    if (waypoint.cracks && waypoint.cracks.length > 0) {
      cracks.push(
        ...waypoint.cracks.map((crack) => ({
          ...crack,
          waypointId: waypoint.id,
          waypointLabel: waypoint.label,
        }))
      );
    }
  });

  // 마지막 점검일 계산
  const lastChecked = cracks.length
    ? cracks.reduce((latest, curr) =>
        new Date(curr.timestamp) > new Date(latest.timestamp) ? curr : latest
      ).timestamp
    : null;

  const crackCount = cracks.length;
  const maxWidth = cracks.length
    ? Math.max(...cracks.map((c) => c.widthMm || 0))
    : 0;
  const avgWidth = cracks.length
    ? (
        cracks.reduce((sum, c) => sum + (c.widthMm || 0), 0) / cracks.length
      ).toFixed(2)
    : 0;

  const waypointCount = waypoints.length;

  return (
    <div className={styles.buildingCard}>
      <div className={styles.infoTop}>
        <h3 className={styles.buildingTitle}>{building.name}</h3>
        <p className={styles.address}>{building.address || "\u00A0"}</p>

        {/* 균열 종류 태그 */}
        <div className={styles.crackTags}>
          {building.crackTypes && building.crackTypes.length > 0 ? (
            building.crackTypes.map((type, index) => (
              <span key={index} className={styles.crackTag}>
                {type}
              </span>
            ))
          ) : (
            <div className={styles.emptyCrackArea}></div>
          )}
        </div>
      </div>

      <div className={styles.imagePlaceholder}>
        {building.thumbnail ? (
          <img
            src={building.thumbnail}
            alt={`${building.name} 균열 확장 이미지`}
            className={styles.buildingImage}
          />
        ) : (
          <img
            src={getDefaultImage()}
            alt={`${building.name} 건물 이미지`}
            className={styles.buildingImage}
            onError={(e) => {
              e.target.src = "/images/default-building.jpg";
            }}
          />
        )}
      </div>

      <div className={styles.infoBottom}>
        <div className={styles.metrics}>
          <p>
            균열 수: <strong>{waypointCount}</strong>
          </p>
          <p>
            최대 균열 폭: <strong>{maxWidth} mm</strong>
          </p>
          <p>
            평균 균열 폭: <strong>{avgWidth} mm</strong>
          </p>

          <div className={styles.metricRow}>
            <span>
              마지막 점검일:{" "}
              <strong>
                {lastChecked
                  ? new Date(lastChecked).toLocaleDateString("ko-KR")
                  : "-"}
              </strong>
            </span>
            <Link
              to={`/building/${building.id}`}
              className={styles.dashboardBtn}
            >
              대시보드 바로가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// 메인 페이지 컴포넌트
function BuildingList() {
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredBuildings, setFilteredBuildings] = useState([]);
  const [activeFilters, setActiveFilters] = useState([]);
  const [buildingsLoaded, setBuildingsLoaded] = useState(false); // 데이터 로드 여부 추적
  const [sortOption, setSortOption] = useState(""); // 정렬 기준

  useEffect(() => {
    // 데이터를 한 번만 로드하도록 함
    if (buildingsLoaded) return;

    setLoading(true);

    // db.json에서 건물 정보 가져오기
    fetch(`${API_BASE_URL}/buildings`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("건물 데이터를 불러오는 데 실패했습니다");
        }
        return res.json();
      })
      .then((data) => {
        // 🔽 여기부터 새로 추가된 로직
        const buildingsWithCrackTypes = data.map((building) => {
          const crackTypesSet = new Set();
          building.waypoints?.forEach((wp) => {
            wp.cracks?.forEach((crack) => {
              if (crack.crackType) crackTypesSet.add(crack.crackType);
            });
          });
          return {
            ...building,
            crackTypes: Array.from(crackTypesSet),
          };
        });

        setBuildings(buildingsWithCrackTypes);
        setFilteredBuildings(buildingsWithCrackTypes);
        setLoading(false);
        setBuildingsLoaded(true);
      })
      .catch((err) => {
        console.error("건물 데이터 불러오기 실패", err);
        setError(err.message);
        setLoading(false);
      });
  }, [buildingsLoaded]); // buildingsLoaded에만 의존하도록 변경

  // 검색어와 필터에 따라 건물 목록 필터링
  useEffect(() => {
    if (!buildingsLoaded || buildings.length === 0) return;

    console.log("필터링 실행: 검색어", searchTerm, "활성 필터:", activeFilters);

    let filtered = [...buildings];

    // 검색어로 필터링
    if (searchTerm) {
      filtered = filtered.filter(
        (building) =>
          building.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (building.address &&
            building.address.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // 균열 유형 필터 적용
    if (activeFilters.length > 0) {
      filtered = filtered.filter((building) => {
        if (!building.crackTypes) return false;
        return activeFilters.some((filter) =>
          building.crackTypes.includes(filter)
        );
      });
    }

    // 정렬 기준 적용
    if (sortOption) {
      filtered.sort((a, b) => {
        const getCrackStats = (building) => {
          let cracks = 0,
            max = 0,
            sum = 0,
            count = 0;
          building.waypoints?.forEach((wp) => {
            wp.cracks?.forEach((crack) => {
              cracks++;
              const width = crack.widthMm || 0;
              max = Math.max(max, width);
              sum += width;
              count++;
            });
          });
          return { cracks, max, avg: count > 0 ? sum / count : 0 };
        };

        const aStats = getCrackStats(a);
        const bStats = getCrackStats(b);

        if (sortOption === "count") return bStats.cracks - aStats.cracks;
        if (sortOption === "maxWidth") return bStats.max - aStats.max;
        if (sortOption === "avgWidth") return bStats.avg - aStats.avg;
        return 0;
      });
    }

    console.log("필터링 결과:", filtered.length, "개");
    setFilteredBuildings(filtered);
  }, [searchTerm, activeFilters, sortOption, buildings, buildingsLoaded]); // ← sortOption 추가됨
  // 균열 통계 계산
  const calculateCrackStats = () => {
    let totalCracks = 0;
    const buildingsWithCracks = [];

    buildings.forEach((building) => {
      const buildingWaypointCount = building.waypoints?.length || 0;
      let maxWidth = 0;
      let totalWidth = 0;
      let crackCount = 0;

      if (building.waypoints) {
        building.waypoints.forEach((waypoint) => {
          if (waypoint.cracks && waypoint.cracks.length > 0) {
            waypoint.cracks.forEach((crack) => {
              if (crack.widthMm) {
                maxWidth = Math.max(maxWidth, crack.widthMm);
                totalWidth += crack.widthMm;
                crackCount++;
              }
            });
          }
        });
      }

      totalCracks += buildingWaypointCount;

      if (buildingWaypointCount > 0) {
        buildingsWithCracks.push({
          id: building.id,
          name: building.name,
          crackCount: buildingWaypointCount,
          maxWidth: maxWidth,
          avgWidth: crackCount > 0 ? totalWidth / crackCount : 0,
        });
      }
    });

    // 균열 수로 정렬
    const sortedByCount = [...buildingsWithCracks].sort(
      (a, b) => b.crackCount - a.crackCount
    );

    // 최대 폭으로 정렬
    const sortedByWidth = [...buildingsWithCracks].sort(
      (a, b) => b.maxWidth - a.maxWidth
    );

    // 평균 폭으로 정렬 (확장 속도 대용)
    const sortedByAvgWidth = [...buildingsWithCracks].sort(
      (a, b) => b.avgWidth - a.avgWidth
    );

    return {
      totalCracks,
      sortedByCount: sortedByCount.slice(0, 3), // 상위 3개만 반환
      sortedByWidth: sortedByWidth.slice(0, 3), // 상위 3개만 반환
      sortedByAvgWidth: sortedByAvgWidth.slice(0, 3), // 상위 3개만 반환
    };
  };

  // 필터 토글
  const toggleFilter = (filter) => {
    if (activeFilters.includes(filter)) {
      setActiveFilters(activeFilters.filter((f) => f !== filter));
    } else {
      setActiveFilters([...activeFilters, filter]);
    }
  };

  // 균열 통계
  const crackStats = calculateCrackStats();

  if (loading) return <div className={styles.loading}></div>;
  if (error) return <div className={styles.error}>오류: {error}</div>;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.mainContent}>
          <h1 className={styles.pageTitle}>건물 종합 정보</h1>
          <div className={styles.summaryGrid}>
            <SummaryCard title="총 건물 수" value={`${buildings.length}`} />
            <SummaryCard
              title="총 균열 수"
              value={`${crackStats.totalCracks}`}
            />
            <SummaryCard
              title="건물별 균열 수 순위"
              value={
                <table className={styles.rankTable}>
                  <tbody>
                    {crackStats.sortedByCount.map((b, i) => (
                      <tr key={b.id}>
                        <td>{i + 1}</td>
                        <td>{b.name}</td>
                        <td>{b.crackCount}건</td>
                      </tr>
                    ))}
                    {crackStats.sortedByCount.length === 0 && (
                      <tr>
                        <td colSpan={3}>데이터 없음</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              }
            />
            <SummaryCard
              title="건물별 균열 최대 폭 순위"
              value={
                <table className={styles.rankTable}>
                  <tbody>
                    {crackStats.sortedByWidth.map((b, i) => (
                      <tr key={b.id}>
                        <td>{i + 1}</td>
                        <td>{b.name}</td>
                        <td>{b.maxWidth.toFixed(2)} mm</td>
                      </tr>
                    ))}
                    {crackStats.sortedByWidth.length === 0 && (
                      <tr>
                        <td colSpan={3}>데이터 없음</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              }
            />

            <SummaryCard
              title="평균 균열 폭 순위"
              value={
                <table className={styles.rankTable}>
                  <tbody>
                    {crackStats.sortedByAvgWidth.map((b, i) => (
                      <tr key={b.id}>
                        <td>{i + 1}</td>
                        <td>{b.name}</td>
                        <td>{b.avgWidth.toFixed(2)} mm</td>
                      </tr>
                    ))}
                    {crackStats.sortedByAvgWidth.length === 0 && (
                      <tr>
                        <td colSpan={3}>데이터 없음</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              }
            />
          </div>

          {/* 검색 및 버튼 */}
          <div className={styles.controlBar}>
            <div className={styles.searchWrapper}>
              <input
                type="text"
                placeholder="건물명을 검색하세요"
                className={styles.searchInput}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button className={styles.searchButton}>
                <img
                  src="/search_icon.svg"
                  alt="검색"
                  className={styles.searchIconWhite}
                />
              </button>
            </div>

            <div className={styles.buttonGroup}>
              <div className={styles.sortDropdown}>
                <CustomDropdown
                  value={sortOption}
                  onChange={setSortOption}
                  options={[
                    { value: "", label: "정렬 기준 선택" },
                    { value: "count", label: "건물별 균열 수" },
                    { value: "maxWidth", label: "건물별 균열 최대 폭" },
                    { value: "avgWidth", label: "평균 균열 폭 순" },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* 건물 카드 목록 */}
          <div className={styles.buildingGrid}>
            {filteredBuildings.length > 0 ? (
              filteredBuildings.map((building) => (
                <BuildingCard key={building.id} building={building} />
              ))
            ) : (
              <div className={styles.noResults}>검색 결과가 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuildingList;
