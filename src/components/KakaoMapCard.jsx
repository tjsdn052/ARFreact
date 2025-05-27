import React, { useState, useEffect, useRef } from "react";
import styles from "./MapCard.module.css"; // 카드 스타일
import mapStyles from "./KakaoMap.module.css"; // 지도 스타일
import { API_BASE_URL } from "../config/api";

import VWorldMaps from "./VWorldMaps"; // VWorldMaps 컴포넌트 import

/**
 * KakaoMapCard 컴포넌트
 *
 * 카카오맵 API를 사용하여 지도를 표시하는 카드 컴포넌트입니다.
 *
 * @param {Object} props 컴포넌트 props
 * @param {string} props.buildingId 건물 ID (선택적)
 * @param {Object} props.buildingData 건물 데이터 객체 (선택적)
 */
export default function KakaoMapCard({ buildingId, buildingData }) {
  // 지도 관련 상태와 참조
  const mapRef = useRef(null); // 지도를 담을 div 요소의 ref
  const [mapInstance, setMapInstance] = useState(null); // 지도 인스턴스
  const [markers, setMarkers] = useState([]); // 마커 인스턴스 배열
  const [building, setBuilding] = useState(null); // 건물 정보
  const [mapInitialized, setMapInitialized] = useState(false); // 지도 초기화 여부
  const [loading, setLoading] = useState(true); // 로딩 상태
  const [error, setError] = useState(null); // 오류 상태
  const [mapUnavailable, setMapUnavailable] = useState(false); // 지도 사용 불가 상태
  const [scriptLoaded, setScriptLoaded] = useState(false); // 스크립트 로드 상태 추가

  // VWorldMaps 모달 관련 상태 추가
  const [vworldVisible, setVworldVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState({ lat: 0, lng: 0 });
  const [selectedWaypointId, setSelectedWaypointId] = useState(null);

  // 카카오맵 스크립트 로드
  useEffect(() => {
    const KAKAO_MAP_API_KEY = import.meta.env.VITE_KAKAO_MAP_API_KEY;

    // API 키가 없을 경우 백업 값 사용
    if (!KAKAO_MAP_API_KEY) {
      console.error("카카오맵 API 키가 환경변수에 설정되지 않았습니다.");
      setMapUnavailable(true);
      setLoading(false);
      return;
    }

    // 이미 로드된 경우 중복 로드 방지
    if (window.kakao && window.kakao.maps) {
      setScriptLoaded(true);
      return;
    }

    // 카카오맵 API 스크립트 로드
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_API_KEY}&autoload=false`;

    let mapLoadingTimeout = setTimeout(() => {
      setMapUnavailable(true);
      setLoading(false);
    }, 10000); // 10초로 타임아웃 증가

    script.onload = () => {
      clearTimeout(mapLoadingTimeout);
      window.kakao.maps.load(() => {
        setScriptLoaded(true);
      });
    };

    script.onerror = () => {
      clearTimeout(mapLoadingTimeout);
      console.error("카카오맵 스크립트 로드 실패");
      setMapUnavailable(true);
      setLoading(false);
    };

    document.head.appendChild(script);

    return () => {
      if (mapLoadingTimeout) {
        clearTimeout(mapLoadingTimeout);
      }
    };
  }, []); // 컴포넌트 마운트 시 한 번만 실행

  // buildingData가 전달되면 사용하고, 아니면 API로 가져오기
  useEffect(() => {
    if (!buildingId) {
      setLoading(false);
      return;
    }

    if (buildingData) {
      // 부모로부터 전달받은 데이터 사용
      setBuilding(buildingData);
      setLoading(false);
      return;
    }

    // buildingData가 없는 경우에만 API 요청
    setLoading(true);

    fetch(`${API_BASE_URL}/buildings/${buildingId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("건물 데이터를 불러오는 데 실패했습니다");
        }
        return response.json();
      })
      .then((data) => {
        setBuilding(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("건물 정보 로드 실패:", err);
        setError("데이터를 불러오는 데 실패했습니다");
        setLoading(false);
      });
  }, [buildingId, buildingData]);

  // 지도 초기화 - 스크립트 로드 완료 및 ref 준비되면 실행
  useEffect(() => {
    if (!mapRef.current || !scriptLoaded) return;

    try {
      // 지도 기본 옵션 - 건물 위치 또는 기본 위치(서울시청)
      let centerLat = 37.566826;
      let centerLng = 126.9786567;

      // 건물 정보가 있으면 건물 위치를 중심으로 설정
      if (building && building.location) {
        centerLat = building.location.latitude;
        centerLng = building.location.longitude;
      }

      const options = {
        center: new window.kakao.maps.LatLng(centerLat, centerLng),
        level: 3, // 확대 레벨
      };

      // 지도 생성
      const map = new window.kakao.maps.Map(mapRef.current, options);
      setMapInstance(map);

      // 지도 컨트롤 추가
      const zoomControl = new window.kakao.maps.ZoomControl();
      map.addControl(zoomControl, window.kakao.maps.ControlPosition.RIGHT);

      setMapInitialized(true);
    } catch (err) {
      console.error("지도 초기화 오류:", err);
      setMapUnavailable(true);
    }
  }, [scriptLoaded, mapRef, building]);

  // 건물 정보가 변경될 때 지도 위치 및 마커 업데이트
  useEffect(() => {
    if (!mapInstance || !building || !building.location || !mapInitialized)
      return;

    try {
      // 기존 마커 모두 제거
      markers.forEach((marker) => {
        if (marker) marker.setMap(null);
      });
      setMarkers([]);

      const { latitude, longitude } = building.location;
      const buildingPosition = new window.kakao.maps.LatLng(
        latitude,
        longitude
      );

      // 지도 중심 변경
      mapInstance.setCenter(buildingPosition);

      // 새 마커 생성
      const buildingMarker = new window.kakao.maps.Marker({
        position: buildingPosition,
        map: mapInstance,
      });

      // 인포윈도우 생성
      const infowindow = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:5px;font-size:12px;color:black;">${building.name}</div>`,
      });

      // 마커 클릭 시 인포윈도우 표시
      window.kakao.maps.event.addListener(buildingMarker, "click", function () {
        // infowindow.open(mapInstance, buildingMarker);

        // 건물 마커 클릭 시 VWorldMaps 모달 열기
        setSelectedLocation({ lat: latitude, lng: longitude });
        setSelectedWaypointId(null);
        // 건물의 경우 기본 높이 200m로 설정
        setVworldVisible(true);
      });

      // 마커 배열에 건물 마커 추가
      const newMarkers = [buildingMarker];

      // 웨이포인트 마커 추가
      if (building.waypoints && building.waypoints.length > 0) {
        building.waypoints.forEach((point, index) => {
          // 웨이포인트 위치가 있는 경우에만 마커 생성
          if (
            point.location &&
            point.location.latitude &&
            point.location.longitude
          ) {
            const pointPosition = new window.kakao.maps.LatLng(
              point.location.latitude,
              point.location.longitude
            );

            // 커스텀 오버레이 생성 (원형 마커) - 모든 웨이포인트 빨간색으로 통일
            const customOverlay = new window.kakao.maps.CustomOverlay({
              position: pointPosition,
              content: `
                <div class="${mapStyles.waypointMarker}" 
                  style="background-color: #FF0000; 
                  width: 15px; height: 15px; border-radius: 50%; 
                  border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"
                  title="${point.label || `웨이포인트 ${index + 1}`}">
                </div>
              `,
              map: mapInstance,
              zIndex: 1,
            });

            // 인포윈도우 생성
            const pointInfoWindow = new window.kakao.maps.InfoWindow({
              content: `
                <div style="padding:5px;font-size:12px;">
                  <b>${point.label || `웨이포인트 ${index + 1}`}</b>
                  ${
                    point.cracks && point.cracks.length > 0
                      ? `<br>최근 측정: ${point.cracks[0].widthMm}mm`
                      : ""
                  }
                </div>
              `,
            });

            // 커스텀 오버레이 클릭 이벤트
            window.kakao.maps.event.addListener(
              customOverlay,
              "click",
              function () {
                pointInfoWindow.open(mapInstance, customOverlay);

                // 웨이포인트 마커 클릭 시 VWorldMaps 모달 열기
                setSelectedLocation({
                  lat: point.location.latitude,
                  lng: point.location.longitude,
                });
                setSelectedWaypointId(point.id);
                setVworldVisible(true);
              }
            );

            // 마커 배열에 추가 (실제론 오버레이지만 관리 용도로 마커 배열에 포함)
            newMarkers.push(customOverlay);
          }
        });
      }

      setMarkers(newMarkers);

      // 마커들이 모두 보이도록 지도 영역 설정 (첫 마커가 하나라도 있을 경우)
      if (newMarkers.length > 1) {
        const bounds = new window.kakao.maps.LatLngBounds();

        // 모든 마커의 위치를 경계에 추가
        bounds.extend(buildingPosition);

        building.waypoints.forEach((point) => {
          if (
            point.location &&
            point.location.latitude &&
            point.location.longitude
          ) {
            bounds.extend(
              new window.kakao.maps.LatLng(
                point.location.latitude,
                point.location.longitude
              )
            );
          }
        });

        // 지도 범위 설정
        mapInstance.setBounds(bounds);
      }
    } catch (err) {
      console.error("지도 업데이트 오류:", err);
    }
  }, [mapInstance, building, mapInitialized]);

  // 로딩 중 표시
  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.mapPlaceholder}>
          {/* 로딩 중일 때는 빈 화면 표시 */}
        </div>
      </div>
    );
  }

  // 지도 API 사용 불가 시 표시
  if (mapUnavailable) {
    return (
      <div className={styles.card}>
        <div className={styles.mapPlaceholder}>
          <div className={styles.placeholderText}>
            <div style={{ marginBottom: "10px" }}>
              지도를 불러올 수 없습니다.
            </div>
            <div>
              <strong>위치 정보</strong>
              <br />
              {building && building.location && (
                <span>
                  위도: {building.location.latitude}, 경도:{" "}
                  {building.location.longitude}
                </span>
              )}
            </div>
            {building &&
              building.waypoints &&
              building.waypoints.length > 0 && (
                <div style={{ marginTop: "10px" }}>
                  <strong>측정 지점: {building.waypoints.length}개</strong>
                </div>
              )}
          </div>
        </div>
      </div>
    );
  }

  // 오류 발생 시 표시
  if (error) {
    return (
      <div className={styles.card}>
        <div className={styles.mapPlaceholder}>
          <div className={styles.placeholderText}>{error}</div>
        </div>
      </div>
    );
  }

  // 건물 ID가 없을 때 안내 메시지
  if (!buildingId) {
    return (
      <div className={styles.card}>
        <div className={styles.mapPlaceholder}>
          <div className={styles.placeholderText}>
            건물을 선택하면 지도가 표시됩니다
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {/* 지도 컨테이너 */}
      <div className={styles.mapPlaceholder}>
        <div ref={mapRef} className={mapStyles.map}></div>
      </div>

      {/* VWorldMaps 모달 */}
      {vworldVisible && (
        <VWorldMaps
          visible={vworldVisible}
          onClose={() => setVworldVisible(false)}
          latitude={selectedLocation.lat}
          longitude={selectedLocation.lng}
          height={200} // 명시적으로 높이값 지정
          buildingId={buildingId}
          waypointId={selectedWaypointId}
        />
      )}
    </div>
  );
}
