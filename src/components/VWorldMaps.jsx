import { useEffect, useRef, useState, useMemo } from "react";
import ReactDOM from "react-dom";

import { API_BASE_URL } from "../config/api";

import ImagePopup from "./ImagePopup"; // 외부 ImagePopup 컴포넌트 import

export default function VWorldMaps({
  visible,
  onClose,
  latitude = 37.5665,
  longitude = 126.978,

  height = 200, // 기본 높이값을 200으로 설정

  buildingId = null, // 건물 ID prop 추가
  waypointId = null, // 웨이포인트 ID prop 추가
}) {
  // 초기화 시 prop 값 로깅
  console.log("VWorldMaps 초기화:", {
    visible,
    latitude,
    longitude,
    height,
    buildingId,
    waypointId,
    waypointIdType: typeof waypointId,
  });

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const cesiumViewerRef = useRef(null); // Cesium viewer 참조 추가
  const [mapReady, setMapReady] = useState(false);
  const [buildingMode, setBuildingMode] = useState("lod1");
  const [building, setBuilding] = useState(null); // 건물 데이터를 저장할 상태 추가
  const [markers, setMarkers] = useState([]); // 마커 ID 관리를 위한 상태 추가
  const [cracks, setCracks] = useState([]); // 균열 데이터 상태 추가
  const [cesiumReady, setCesiumReady] = useState(false); // Cesium 초기화 상태 추가

  const [showTooltip, setShowTooltip] = useState(false); // 툴크 표시 상태 추가

  // 초기 마운트 시 waypointId prop 적용을 위한 ref
  const initialMountRef = useRef(true);

  // waypointId를 문자열로 확실하게 변환하여 state 초기화
  const [selectedWaypointId, setSelectedWaypointId] = useState(
    waypointId ? String(waypointId) : null
  );

  // 웨이포인트 이름 상태 추가
  const [selectedWaypointName, setSelectedWaypointName] = useState("");

  // Google Elevation API 고도값에서 빼는 값 (한번에 변경 가능)
  const ELEVATION_OFFSET = 5; // 기본값 5m

  // 웨이포인트가 변경되면 state도 업데이트 (단, 내부 선택 후에는 적용하지 않음)
  useEffect(() => {
    if (waypointId !== undefined && waypointId !== null) {
      const idStr = String(waypointId);
      console.log(
        `waypointId prop 변경됨: ${waypointId} (${typeof waypointId}) -> ${idStr}`
      );

      // 초기 마운트 시에만 waypointId prop 적용 또는
      // 내부적으로 선택이 아직 없는 경우만 적용
      if (initialMountRef.current) {
        console.log("초기 마운트 시 waypointId 적용");
        setSelectedWaypointId(idStr);
        initialMountRef.current = false;

        // Cesium이 준비되었고 웨이포인트 데이터가 로드된 상태라면
        // 즉시 해당 웨이포인트로 카메라 이동 시도
        if (cesiumReady && cesiumViewerRef.current && cracks.length > 0) {
          const waypoint = cracks.find((w) => String(w.id) === idStr);

          if (waypoint && waypoint.location) {
            const waypointAltitude = waypoint.altitude || 10;

            const moveInitialCamera = async () => {
              try {
                console.log(`초기 마운트: 카메라 이동 시도: ${idStr}`);

                // Google Elevation API로 지형 고도 가져오기
                const googleElevation = await getElevationFromGoogle(
                  waypoint.location.latitude,
                  waypoint.location.longitude
                );

                const finalCameraHeight =
                  waypointAltitude + googleElevation - ELEVATION_OFFSET + 20;

                console.log(
                  `초기 마운트 카메라 고도 계산: ${waypointAltitude}m + ${googleElevation.toFixed(
                    2
                  )}m - ${ELEVATION_OFFSET}m + 20m = ${finalCameraHeight.toFixed(
                    2
                  )}m`
                );

                const cameraPosition = window.Cesium.Cartesian3.fromDegrees(
                  waypoint.location.longitude,
                  waypoint.location.latitude,
                  finalCameraHeight
                );

                cesiumViewerRef.current.camera.flyTo({
                  destination: cameraPosition,
                  orientation: {
                    heading: window.Cesium.Math.toRadians(0),
                    pitch: window.Cesium.Math.toRadians(-90), // 90도 아래로 기울여서 보기 (직각)
                    roll: 0,
                  },
                  duration: 1.0, // 부드러운 이동을 위한 1초 지속 시간
                });

                // 웨이포인트 이름도 업데이트
                setSelectedWaypointName(
                  waypoint.label || `웨이포인트 ${waypoint.id}`
                );

                console.log(`초기 마운트: 카메라 이동 완료: ${idStr}`);
              } catch (e) {
                console.error("초기 카메라 이동 중 오류:", e);
              }
            };

            moveInitialCamera();
          }
        }
      } else {
        console.log("내부 선택 후에는 외부 waypointId 변경 무시");
      }
    }
  }, [waypointId, cesiumReady, cracks]);

  // Cesium 스크립트 로드 함수
  const loadCesiumScript = () => {
    return new Promise((resolve, reject) => {
      if (window.Cesium) {
        resolve(window.Cesium);
        return;
      }

      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src =
        "https://cesium.com/downloads/cesiumjs/releases/1.82/Build/Cesium/Cesium.js";
      script.async = true;
      script.onload = () => resolve(window.Cesium);
      script.onerror = (error) =>
        reject(new Error("Cesium 스크립트 로드 실패"));
      document.head.appendChild(script);
    });
  };

  // Google Elevation API를 통해 고도값 가져오기
  const getElevationFromGoogle = async (latitude, longitude) => {
    try {
      console.log(`고도 API 호출: 위도 ${latitude}, 경도 ${longitude}`);

      const response = await fetch(
        `/.netlify/functions/get-elevation?lat=${latitude}&lng=${longitude}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Google Elevation API HTTP 오류 ${response.status}:`,
          errorText
        );
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();

      if (data.error) {
        console.error("Google Elevation API 오류:", data.error);
        return 10; // API 키 오류 등의 경우 기본값 10m 반환
      }

      const elevation = data.elevation || 0;
      console.log(`Google API 고도 응답: ${elevation}m`);
      return elevation;
    } catch (error) {
      console.error("Google Elevation API 호출 실패:", error);
      console.log("기본 고도값 10m 사용");
      return 10; // 실패 시 기본값 10m 반환 (완전히 0이면 지하에 마커가 생길 수 있음)
    }
  };

  // 마커 추가 함수 (Cesium entities.add() 사용) - waypointId 매개변수 추가
  const addMarker = async (
    longitude,
    latitude,
    label = "",
    color = "RED",
    height = 10,
    type = "point",
    waypointId = null
  ) => {
    if (!cesiumViewerRef.current || !window.Cesium) {
      console.warn("Cesium이 초기화되지 않아 마커를 추가할 수 없습니다.");
      return null;
    }

    try {
      console.log(
        `마커 추가 시도: ${label}, 위치: ${longitude}, ${latitude}, 기존 높이: ${height}, 타입: ${type}, 웨이포인트ID: ${waypointId}`
      );

      // Google Elevation API로 지형 고도 가져오기
      const googleElevation = await getElevationFromGoogle(latitude, longitude);

      // 기존 고도 + Google API 고도 - ELEVATION_OFFSET
      const finalHeight = height + googleElevation - ELEVATION_OFFSET;

      console.log(
        `고도 계산: 기존 ${height}m + Google API ${googleElevation.toFixed(
          2
        )}m - ${ELEVATION_OFFSET}m = 최종 ${finalHeight.toFixed(2)}m`
      );

      const markerId = `marker-${type}-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const entityOptions = {
        id: markerId,
        position: window.Cesium.Cartesian3.fromDegrees(
          longitude,
          latitude,
          finalHeight
        ),

        label: label
          ? {
              text: label,
              font: "bold 15px sans-serif",
              fillColor: window.Cesium.Color.WHITE,
              outlineColor: window.Cesium.Color.BLACK,
              outlineWidth: 3,
              style: window.Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: window.Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new window.Cesium.Cartesian2(0, 30),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,

              backgroundPadding: new window.Cesium.Cartesian2(7, 5),
            }
          : undefined,
        properties: {
          type: type,
          waypointId: waypointId, // 웨이포인트 ID 저장
          originalHeight: height, // 원래 높이 저장
          googleElevation: googleElevation, // Google API 고도 저장
          finalHeight: finalHeight, // 최종 높이 저장
        },
      };

      // 균열 마커는 경고 표시로 표시
      if (type === "crack") {
        entityOptions.billboard = {
          image: createWarningIcon(color),
          width: 24,
          height: 24,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          verticalOrigin: window.Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: window.Cesium.HorizontalOrigin.CENTER,
        };
      } else {
        // 건물 등 다른 마커는 기존 포인트 스타일 유지
        entityOptions.point = {
          pixelSize: 10,
          color: window.Cesium.Color[color],
          outlineColor: window.Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        };
      }

      const entity = cesiumViewerRef.current.entities.add(entityOptions);

      console.log(
        `마커 추가 성공: ${markerId}, 타입: ${type}, 최종 높이: ${finalHeight.toFixed(
          2
        )}m, 웨이포인트ID: ${waypointId}`
      );
      setMarkers((prev) => [...prev, markerId]);
      return markerId;
    } catch (error) {
      console.error("마커 추가 중 오류:", error);
      return null;
    }
  };

  // 경고 아이콘 생성 함수 (느낌표만 표시, 배경 없음)
  const createWarningIcon = (color) => {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d");

    // 배경 투명하게 설정
    context.clearRect(0, 0, canvas.width, canvas.height);

    // 색상 설정 (severity에 따른 색상)
    let iconColor;
    switch (color) {
      case "RED":
        iconColor = "#FF0000";
        break;
      case "Yellow":
        iconColor = "#FFA500";
        break;
      case "Green":
        iconColor = "#00FF00";
        break;
      case "LIME":
        iconColor = "#00FF00";
        break;
      default:
        iconColor = "#FF0000";
    }

    // 더 큰 느낌표 그리기
    // 느낌표 막대 그리기
    context.fillStyle = iconColor;
    context.beginPath();
    context.roundRect(9, 2, 6, 14, 3);
    context.fill();

    // 느낌표 점 그리기
    context.beginPath();
    context.arc(12, 20, 3, 0, Math.PI * 2);
    context.fill();

    // 테두리 효과를 위한 그림자 추가
    context.shadowColor = "rgba(0, 0, 0, 0.7)";
    context.shadowBlur = 2;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 1;

    return canvas.toDataURL();
  };

  // 마커 제거 함수
  const removeMarker = (markerId) => {
    if (!cesiumViewerRef.current) return;

    try {
      cesiumViewerRef.current.entities.removeById(markerId);
      setMarkers((prev) => prev.filter((id) => id !== markerId));
      console.log(`마커 제거 완료: ${markerId}`);
    } catch (error) {
      console.error("마커 제거 중 오류:", error);
    }
  };

  // 타입별 마커 제거 함수
  const clearMarkersByType = (type) => {
    if (!cesiumViewerRef.current) return;

    console.log(`${type} 타입 마커 제거 시작`);

    // 해당 타입의 마커 ID 목록 가져오기
    const markerIdsToRemove = [];

    markers.forEach((markerId) => {
      try {
        const entity = cesiumViewerRef.current.entities.getById(markerId);
        if (
          entity &&
          entity.properties &&
          entity.properties.type &&
          entity.properties.type.getValue() === type
        ) {
          markerIdsToRemove.push(markerId);
        }
      } catch (error) {
        console.error(`마커 ${markerId} 확인 중 오류:`, error);
      }
    });

    // 마커 제거
    markerIdsToRemove.forEach((id) => {
      try {
        cesiumViewerRef.current.entities.removeById(id);
        console.log(`${type} 타입 마커 제거: ${id}`);
      } catch (error) {
        console.error(`마커 ${id} 제거 중 오류:`, error);
      }
    });

    // 마커 상태 업데이트
    setMarkers((prev) => prev.filter((id) => !markerIdsToRemove.includes(id)));

    console.log(`${type} 타입 마커 제거 완료 (${markerIdsToRemove.length}개)`);
  };

  // 모든 마커 제거 함수
  const clearMarkers = () => {
    if (!cesiumViewerRef.current) return;

    console.log("모든 마커 제거 시작");

    markers.forEach((markerId) => {
      try {
        cesiumViewerRef.current.entities.removeById(markerId);
        console.log(`마커 제거: ${markerId}`);
      } catch (error) {
        console.error(`마커 ${markerId} 제거 중 오류:`, error);
      }
    });

    setMarkers([]);
    console.log("모든 마커 제거 완료");
  };

  // 건물 데이터 로드
  useEffect(() => {
    if (!buildingId || !visible) return;

    console.log(`건물 데이터 로드 시도: 건물 ID ${buildingId}`);

    fetch(`${API_BASE_URL}/buildings/${buildingId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("건물 정보를 불러오는 데 실패했습니다.");
        }
        return response.json();
      })
      .then((data) => {
        console.log("로드된 건물 데이터:", data);
        setBuilding(data);
      })
      .catch((error) => {
        console.error("건물 데이터 불러오기 오류:", error);
      });
  }, [buildingId, visible]);

  // VWorld 맵 초기화 및 Cesium 연동
  useEffect(() => {
    if (!visible || !window.vw) return;

    // 이미 맵이 초기화되어 있는 경우 처리
    if (mapReady && mapRef.current) {
      console.log("맵이 이미 초기화되어 있습니다. 초기화 과정 생략");
      // 카메라 재설정 없이 마커만 다시 표시
      return;
    }

    // 높이 값만 로그 출력

    console.log(`현재 카메라 높이: ${height || 200}m`);

    // 기본 높이 설정 - 높이가 없으면 200으로 기본값 설정, 있으면 그대로 사용
    const defaultHeight = height || 200;

    const opts = new window.vw.MapOptions(
      window.vw.BasemapType.GRAPHIC,
      "",
      window.vw.DensityType.ULTRA, // 객체 해상도
      window.vw.DensityType.ULTRA, // 텍스처 해상도
      true,
      // 하나의 카메라 위치만 지정 (핀을 정확히 위에서 내려다보는 시점)
      new window.vw.CameraPosition(
        new window.vw.CoordZ(longitude, latitude, defaultHeight),
        new window.vw.Direction(0, -90, 0)
      )
    );

    const map = new window.vw.Map("vmap", opts);
    mapRef.current = map;

    // Cesium 스크립트 로드 및 초기화
    loadCesiumScript()
      .then((Cesium) => {
        // VWorld에서 Cesium viewer 객체 접근
        setTimeout(() => {
          try {
            // ws3d.viewer 형태로 접근 (VWorld에서 제공하는 Cesium 객체)
            cesiumViewerRef.current = window.ws3d?.viewer;

            if (!cesiumViewerRef.current) {
              // 대체 방법: 직접 Cesium 뷰어 생성
              if (window.Cesium) {
                try {
                  cesiumViewerRef.current = new window.Cesium.Viewer("vmap", {
                    baseLayerPicker: false,
                    geocoder: false,
                    homeButton: false,
                    sceneModePicker: false,
                    navigationHelpButton: false,
                    animation: false,
                    timeline: false,
                    fullscreenButton: false,
                  });
                } catch (err) {
                  // 오류 발생 시 로그 없음
                }
              }
            }

            // Cesium 뷰어가 준비되면 카메라 위치 설정
            if (cesiumViewerRef.current && window.Cesium) {
              const cameraPosition = window.Cesium.Cartesian3.fromDegrees(
                longitude,
                latitude,
                defaultHeight
              );

              cesiumViewerRef.current.camera.setView({
                destination: cameraPosition,
                orientation: {
                  heading: window.Cesium.Math.toRadians(0),
                  pitch: window.Cesium.Math.toRadians(-90),
                  roll: 0,
                },
              });
            }

            setCesiumReady(true);
            setMapReady(true);
            map.getElementById("poi_base").hide();
            map.getElementById("facility_build").hide();
            map.getElementById("facility_build_lod1").show();

            console.log("Cesium 초기화 완료");
          } catch (error) {
            // 오류 발생 시 로그 없음
          }
        }, 1000);
      })
      .catch(() => {
        // Cesium 로드 실패 로그 없음
        // Cesium 없이도 기본 맵은 표시
        setTimeout(() => {
          setMapReady(true);
          map.getElementById("poi_base").hide();
          map.getElementById("facility_build").hide();
          map.getElementById("facility_build_lod1").show();
        }, 1000);
      });

    if (typeof map.setNavigationZoomVisible === "function") {
      map.setNavigationZoomVisible(false);
    }
    if (typeof map.setNavigationRotateVisible === "function") {
      map.setNavigationRotateVisible(false);
    }

    // 컴포넌트 언마운트 시 마커 정리
    return () => {
      console.log("VWorldMaps 컴포넌트 언마운트 - 모든 마커 정리");
      if (cesiumViewerRef.current) {
        try {
          markers.forEach((markerId) => {
            try {
              cesiumViewerRef.current.entities.removeById(markerId);
            } catch (e) {
              // 무시
            }
          });
        } catch (e) {
          console.error("컴포넌트 언마운트 시 마커 정리 중 오류:", e);
        }
      }
    };
  }, [visible]);

  // 건물 마커 추가
  useEffect(() => {
    if (!building || !cesiumReady || !cesiumViewerRef.current) return;

    console.log("건물 마커 추가 시도");

    // 건물 마커만 제거 (타입으로 필터링)
    clearMarkersByType("building");

    // 건물 위치에 마커 추가
    if (
      building.location &&
      building.location.longitude &&
      building.location.latitude
    ) {
      console.log("건물 마커 추가 시도:", building.name);

      const addBuildingMarker = async () => {
        try {
          const markerId = await addMarker(
            building.location.longitude,
            building.location.latitude,
            building.name,
            "BLUE",
            10,
            "building"
          );
          console.log("건물 마커 추가 완료:", markerId);
        } catch (error) {
          console.error("건물 마커 추가 실패:", error);
        }
      };

      addBuildingMarker();
    }
  }, [building, cesiumReady]);

  // 균열 데이터 로드 및 마커 추가 시 마커 높이 수정
  useEffect(() => {
    if (!building || !cesiumReady || !cesiumViewerRef.current) {
      return;
    }

    console.log("균열 데이터 로드 및 마커 추가 시작");

    // 균열 마커만 제거 (타입으로 필터링)
    clearMarkersByType("crack");

    // 웨이포인트 데이터를 균열 데이터로 사용
    if (building.waypoints && building.waypoints.length > 0) {
      // 웨이포인트 ID 타입 확인 및 변환 (문자열 또는 숫자 모두 처리 가능하도록)
      const processedWaypoints = building.waypoints.map((waypoint) => ({
        ...waypoint,
        id: String(waypoint.id), // ID를 문자열로 명시적 변환
      }));

      setCracks(processedWaypoints);

      // 선택된 웨이포인트 좌표 저장 (나중에 포커스를 위해)
      let selectedWaypointCoords = null;

      // 웨이포인트에 마커 추가 (비동기 처리)
      const addWaypointMarkers = async () => {
        for (const waypoint of processedWaypoints) {
          if (
            waypoint.location &&
            waypoint.location.latitude &&
            waypoint.location.longitude
          ) {
            // 최신 균열 측정값 가져오기
            let severity = "YELLOW";
            let width = 0;

            if (waypoint.cracks && waypoint.cracks.length > 0) {
              // 날짜 기준으로 정렬하여 최신 데이터 가져오기
              const sortedCracks = [...waypoint.cracks].sort(
                (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
              );
              const latestCrack = sortedCracks[0];

              width = latestCrack.widthMm || 0;

              // 균열 폭에 따른 심각도 결정
              if (width >= 1.0) {
                severity = "RED";
              } else if (width >= 0.3) {
                severity = "Yellow";
              } else {
                severity = "Green";
              }
            }
            // 웨이포인트 원래 높이 사용 (altitude는 waypoint 객체의 직속 속성)
            const waypointAltitude = waypoint.altitude || 10;

            // 마커 높이값만 로그 출력
            console.log(
              `마커 높이: ${waypointAltitude}m (웨이포인트 ID: ${waypoint.id})`
            );

            // 선택된 웨이포인트인지 확인 (문자열로 변환하여 비교)
            const isSelected =
              selectedWaypointId &&
              String(waypoint.id) === String(selectedWaypointId);

            // 선택된 웨이포인트이면 좌표 저장
            if (isSelected) {
              selectedWaypointCoords = {
                longitude: waypoint.location.longitude,
                latitude: waypoint.location.latitude,
                altitude: waypointAltitude,
              };
              console.log(
                `선택된 웨이포인트 좌표: ${waypoint.location.longitude}, ${waypoint.location.latitude}, ${waypointAltitude}`
              );
            }

            try {
              // 마커 추가 - 웨이포인트의 실제 높이 사용
              await addMarker(
                waypoint.location.longitude,
                waypoint.location.latitude,
                waypoint.label || `WP-${waypoint.id}`,
                isSelected ? "LIME" : severity, // 선택된 웨이포인트는 LIME 색으로 표시
                waypointAltitude,
                "crack",
                String(waypoint.id) // 웨이포인트 ID를 문자열로 명시적 변환
              );
            } catch (error) {
              console.error(`웨이포인트 ${waypoint.id} 마커 추가 실패:`, error);
            }
          }
        }
      };

      // 비동기로 마커 추가 실행
      addWaypointMarkers();

      // 선택된 웨이포인트가 있고 좌표가 있으면 카메라 이동
      if (selectedWaypointCoords && cesiumViewerRef.current && window.Cesium) {
        const moveCameraToWaypoint = async () => {
          try {
            console.log(
              `카메라 이동 시도: ${selectedWaypointCoords.longitude}, ${selectedWaypointCoords.latitude}, ${selectedWaypointCoords.altitude}`
            );

            // Google Elevation API로 지형 고도 가져오기
            const googleElevation = await getElevationFromGoogle(
              selectedWaypointCoords.latitude,
              selectedWaypointCoords.longitude
            );

            const finalCameraHeight =
              selectedWaypointCoords.altitude +
              googleElevation -
              ELEVATION_OFFSET +
              20;

            console.log(
              `카메라 고도 계산: 웨이포인트 ${
                selectedWaypointCoords.altitude
              }m + Google API ${googleElevation.toFixed(
                2
              )}m - ${ELEVATION_OFFSET}m + 20m = ${finalCameraHeight.toFixed(
                2
              )}m`
            );

            // 부드러운 이동을 위해 flyTo 사용
            const cameraPosition = window.Cesium.Cartesian3.fromDegrees(
              selectedWaypointCoords.longitude,
              selectedWaypointCoords.latitude,
              finalCameraHeight
            );

            cesiumViewerRef.current.camera.flyTo({
              destination: cameraPosition,
              orientation: {
                heading: window.Cesium.Math.toRadians(0),
                pitch: window.Cesium.Math.toRadians(-90), // 90도 아래로 기울여서 보기 (직각)
                roll: 0,
              },
              duration: 1.0, // 부드러운 이동을 위한 1초 지속 시간
            });

            console.log(
              `선택된 웨이포인트(${selectedWaypointId})로 카메라 이동 완료`
            );
          } catch (error) {
            console.error("카메라 이동 중 오류:", error);
          }
        };

        moveCameraToWaypoint();
      } else if (
        building.location &&
        cesiumViewerRef.current &&
        window.Cesium
      ) {
        // 선택된 웨이포인트가 없으면 건물 위치로 카메라 이동
        const moveCameraToBuilding = async () => {
          try {
            // Google Elevation API로 지형 고도 가져오기
            const googleElevation = await getElevationFromGoogle(
              building.location.latitude,
              building.location.longitude
            );

            const finalCameraHeight = 200 + googleElevation - ELEVATION_OFFSET;

            console.log(
              `건물 카메라 고도 계산: 기본 200m + Google API ${googleElevation.toFixed(
                2
              )}m - ${ELEVATION_OFFSET}m = ${finalCameraHeight.toFixed(2)}m`
            );

            const buildingPosition = window.Cesium.Cartesian3.fromDegrees(
              building.location.longitude,
              building.location.latitude,
              finalCameraHeight
            );

            cesiumViewerRef.current.camera.flyTo({
              destination: buildingPosition,
              orientation: {
                heading: window.Cesium.Math.toRadians(0),
                pitch: window.Cesium.Math.toRadians(-90), // 90도 아래로 기울여서 보기 (직각)
                roll: 0,
              },
              duration: 1.0,
            });

            console.log("건물 위치로 카메라 이동 완료");
          } catch (error) {
            console.error("건물 위치로 카메라 이동 중 오류:", error);
          }
        };

        moveCameraToBuilding();
      }
    }
  }, [building, cesiumReady, selectedWaypointId]);

  // 마커 클릭 이벤트 핸들러 설정
  useEffect(() => {
    if (!cesiumViewerRef.current || !cesiumReady || !window.Cesium) return;

    console.log("마커 클릭 이벤트 핸들러 설정");

    // 이미 설정된 이벤트 핸들러가 있다면 제거 (중복 방지)
    try {
      if (cesiumViewerRef.current.screenSpaceEventHandler) {
        cesiumViewerRef.current.screenSpaceEventHandler.removeInputAction(
          window.Cesium.ScreenSpaceEventType.LEFT_CLICK
        );
      }
    } catch (err) {
      console.log("이전 이벤트 핸들러 제거 중 오류:", err);
    }

    // 마커 클릭 이벤트 설정
    cesiumViewerRef.current.screenSpaceEventHandler.setInputAction(function (
      click
    ) {
      const pickedObject = cesiumViewerRef.current.scene.pick(click.position);
      if (window.Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        console.log("마커 클릭:", entity);

        if (entity.properties && entity.properties.type) {
          const type = entity.properties.type.getValue();
          console.log("마커 유형:", type);

          if (type === "building") {
            console.log("건물 마커 클릭:", entity.id);
            // 건물 정보 로깅만 하고 팝업은 표시하지 않음
            console.log(`건물 정보: ${building ? building.name : "정보 없음"}`);
          } else if (type === "crack") {
            console.log("균열/웨이포인트 마커 클릭:", entity.id);

            // 마커에 저장된 웨이포인트 ID 직접 사용
            const waypointId = entity.properties.waypointId
              ? entity.properties.waypointId.getValue()
              : null;
            console.log("마커에 저장된 웨이포인트 ID:", waypointId);

            if (!waypointId) {
              console.warn("마커에 웨이포인트 ID가 없습니다.");
              return;
            }

            // 웨이포인트 ID를 문자열로 변환하여 비교
            const waypointIdStr = String(waypointId);
            console.log("검색할 웨이포인트 ID(문자열):", waypointIdStr);

            // 이미 선택된 웨이포인트면 아무것도 하지 않음 (지도 초기화 방지)
            if (waypointIdStr === selectedWaypointId) {
              console.log("이미 선택된 웨이포인트입니다:", waypointIdStr);
              return;
            }

            // 웨이포인트 찾기 (ID 타입 불일치 문제 해결)
            const waypoint = cracks.find((w) => String(w.id) === waypointIdStr);

            if (waypoint) {
              console.log("찾은 웨이포인트:", waypoint);

              // 내부 클릭으로 웨이포인트 선택 시 초기화 상태 비활성화
              initialMountRef.current = false;

              // 선택된 웨이포인트 ID 업데이트 (갤러리 표시 트리거)
              setSelectedWaypointId(waypointIdStr);

              // 웨이포인트 이름 저장
              setSelectedWaypointName(
                waypoint.label || `웨이포인트 ${waypoint.id}`
              );

              // 웨이포인트 위치로 카메라 이동
              if (
                waypoint.location &&
                waypoint.location.longitude &&
                waypoint.location.latitude
              ) {
                const waypointAltitude = waypoint.altitude || 10;

                // 카메라 이동 시도 (비동기)
                const moveCameraToClickedWaypoint = async () => {
                  try {
                    // Google Elevation API로 지형 고도 가져오기
                    const googleElevation = await getElevationFromGoogle(
                      waypoint.location.latitude,
                      waypoint.location.longitude
                    );

                    const finalCameraHeight =
                      waypointAltitude +
                      googleElevation -
                      ELEVATION_OFFSET +
                      20;

                    console.log(
                      `클릭된 웨이포인트 카메라 고도 계산: ${waypointAltitude}m + ${googleElevation.toFixed(
                        2
                      )}m - ${ELEVATION_OFFSET}m + 20m = ${finalCameraHeight.toFixed(
                        2
                      )}m`
                    );

                    const cameraPosition = window.Cesium.Cartesian3.fromDegrees(
                      waypoint.location.longitude,
                      waypoint.location.latitude,
                      finalCameraHeight
                    );

                    cesiumViewerRef.current.camera.flyTo({
                      destination: cameraPosition,
                      orientation: {
                        heading: window.Cesium.Math.toRadians(0),
                        pitch: window.Cesium.Math.toRadians(-90), // 90도 아래로 기울여서 보기 (직각)
                        roll: 0,
                      },
                      duration: 1.0, // 부드러운 이동을 위한 1초 지속 시간
                    });

                    console.log(
                      `웨이포인트로 카메라 이동 완료: ${waypointIdStr}`
                    );
                  } catch (error) {
                    console.error("카메라 이동 중 오류:", error);
                  }
                };

                moveCameraToClickedWaypoint();
              }

              console.log(`웨이포인트 선택됨: ${waypointIdStr}`);
            } else {
              console.log(
                "웨이포인트 정보를 찾을 수 없습니다. 사용 가능한 웨이포인트:",
                cracks
              );
            }
          }
        }
      }
    },
    window.Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      // 컴포넌트 언마운트 시 이벤트 제거
      if (
        cesiumViewerRef.current &&
        cesiumViewerRef.current.screenSpaceEventHandler
      ) {
        try {
          cesiumViewerRef.current.screenSpaceEventHandler.removeInputAction(
            window.Cesium.ScreenSpaceEventType.LEFT_CLICK
          );
        } catch (error) {
          console.error("이벤트 핸들러 제거 중 오류:", error);
        }
      }
    };
  }, [cesiumReady, cracks, building]);

  // 건물 정보가 로드되면 위치 확인
  useEffect(() => {
    if (!building || !mapReady || !mapRef.current) return;

    // 건물 위치 확인만 하고 카메라 이동은 하지 않음
    if (
      building.location &&
      building.location.latitude &&
      building.location.longitude
    ) {
      console.log("건물 위치 확인:", building.location);
    }
  }, [building, mapReady]);

  const showLod1 = () => {
    const map = mapRef.current;
    if (!map) return;

    const base = map.getElementById("facility_build");
    const lod1 = map.getElementById("facility_build_lod1");

    if (base && lod1) {
      base.hide();
      lod1.show();
      setBuildingMode("lod1");
    }
  };

  const showBasic = () => {
    const map = mapRef.current;
    if (!map) return;

    const base = map.getElementById("facility_build");
    const lod1 = map.getElementById("facility_build_lod1");

    if (base && lod1) {
      base.show();
      lod1.hide();
      setBuildingMode("basic");
    }
  };

  if (!visible) return null;

  // ReactDOM.createPortal을 사용하여 모달이 document.body에 직접 렌더링되도록 수정
  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "95vw",
          height: "95vh",
          display: "flex",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 왼쪽 VWorld 맵 영역 */}
        <div
          style={{
            width: "60%",
            backgroundColor: "#fff",
            borderRadius: 8,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 헤더 영역 제거 (3D 지도 글자가 표시되던 부분) */}

          {/* 기존 LoD1/LoD4 버튼 영역 복원 */}
          {mapReady && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                zIndex: 10,
                padding: "6px",
                backgroundColor: "rgba(255,255,255,0.7)",
                borderRadius: "4px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              <button
                onClick={showLod1}
                style={{
                  marginRight: 8,
                  padding: "4px 8px",
                  backgroundColor:
                    buildingMode === "lod1" ? "#8800FF" : "transparent",
                  color: buildingMode === "lod1" ? "white" : "#333",
                  border: buildingMode === "lod1" ? "none" : "1px solid #ccc",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: buildingMode === "lod1" ? "bold" : "normal",
                  boxShadow:
                    buildingMode === "lod1"
                      ? "0 0 5px rgba(136, 0, 255, 0.5)"
                      : "none",
                  fontSize: "12px",
                }}
              >
                LoD1
              </button>
              <button
                onClick={showBasic}
                style={{
                  padding: "4px 8px",
                  backgroundColor:
                    buildingMode === "basic" ? "#8800FF" : "transparent",
                  color: buildingMode === "basic" ? "white" : "#333",
                  border: buildingMode === "basic" ? "none" : "1px solid #ccc",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: buildingMode === "basic" ? "bold" : "normal",
                  boxShadow:
                    buildingMode === "basic"
                      ? "0 0 5px rgba(136, 0, 255, 0.5)"
                      : "none",
                  fontSize: "12px",
                }}
              >
                LoD4
              </button>
            </div>
          )}

          <div
            id="vmap"
            ref={mapEl}
            style={{ flex: 1, width: "100%", height: "100%" }}
          />

          {/* 하단 정보 영역 제거 (웨이포인트 수 등이 표시되던 부분) */}
        </div>

        {/* 오른쪽 사진 갤러리 영역 */}
        <div
          style={{
            width: "38%",
            backgroundColor: "#fff",
            borderRadius: 8,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative" /* 추가: 상대 위치 설정 */,
          }}
        >
          {/* 도움말 아이콘과 닫기 버튼 - 갤러리 영역 상단에 배치 */}
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              display: "flex",
              alignItems: "center",
              zIndex: 20,
            }}
          >
            <div
              style={{
                position: "relative",
                marginRight: "10px",
              }}
            >
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                style={{
                  color: "black",
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid #eaeaea",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  fontSize: "16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ?
              </button>

              {showTooltip && (
                <div
                  style={{
                    position: "absolute",
                    top: "40px",
                    right: "0",
                    width: "300px",
                    background: "white",
                    padding: "10px",
                    borderRadius: "4px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    zIndex: 30,
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 10px 0",
                      fontSize: "12px",
                      color: "black",
                      textAlign: "justify",
                    }}
                  >
                    LOD1과 LOD4는 지역에 따라 다르게 적용될 수 있습니다. 건물이
                    보이지 않는다면, LOD 수준을 변경해주세요.
                  </p>

                  <p
                    style={{
                      margin: "0 0 6px 0",
                      fontSize: "12px",
                      color: "black",
                    }}
                  >
                    <b>LoD1 :</b> 단순화된 건물 형태로, 기본 블록 모양의 3D
                    건물을 표시합니다.
                  </p>
                  <p
                    style={{
                      margin: "0 0 10px 0",
                      fontSize: "12px",
                      color: "black",
                    }}
                  >
                    <b>LoD4 :</b> 상세한 건물 형태로, 상세 텍스처가 포함된
                    고품질 3D 건물을 표시합니다.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              style={{
                color: "black",
                background: "rgba(255,255,255,0.7)",

                borderRadius: "4px",
                fontSize: "20px",
                cursor: "pointer",
                padding: "0 8px",
                height: "30px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #eaeaea",
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #eaeaea",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "16px", color: "black " }}>
              날짜별 균열 사진
            </h3>
          </div>

          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "16px",
            }}
          >
            {selectedWaypointId ? (
              <WaypointCrackGallery
                waypoints={cracks}
                selectedWaypointId={selectedWaypointId}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#666",
                  fontSize: "14px",
                }}
              >
                균열을 클릭하면 과거 관측 사진이 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 웨이포인트 균열 갤러리 컴포넌트
const WaypointCrackGallery = ({ waypoints, selectedWaypointId }) => {
  // 초기화 시 prop 값 로깅
  console.log("WaypointCrackGallery 초기화:", {
    waypointsCount: waypoints?.length,
    selectedWaypointId,
    selectedWaypointIdType: typeof selectedWaypointId,
  });

  // 선택된 웨이포인트 ID를 문자열로 확실하게 변환
  const safeWaypointId = selectedWaypointId ? String(selectedWaypointId) : null;

  // 선택된 웨이포인트 찾기 (안전하게 ID 비교)
  const selectedWaypoint = waypoints.find((wp) => {
    if (!wp || !wp.id || !safeWaypointId) return false;
    return String(wp.id) === safeWaypointId;
  });

  // 정렬된 균열 데이터 계산
  const sortedCracks = useMemo(() => {
    if (!selectedWaypoint?.cracks?.length) return [];
    return [...selectedWaypoint.cracks].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
  }, [selectedWaypoint]);

  // 선택된 균열 상태 (첫 번째 균열로 초기화)
  const [selectedCrack, setSelectedCrack] = useState(null);

  // 이미지 팝업 상태 추가
  const [showImagePopup, setShowImagePopup] = useState(false);
  const [popupImageData, setPopupImageData] = useState(null);

  // 웨이포인트가 변경되면 선택된 균열 초기화
  useEffect(() => {
    console.log("웨이포인트 변경 감지:", safeWaypointId);
    console.log("정렬된 균열 데이터:", sortedCracks);

    if (sortedCracks.length > 0) {
      setSelectedCrack(sortedCracks[0]);
    } else {
      setSelectedCrack(null);
    }
  }, [safeWaypointId, sortedCracks]);

  // 날짜 포맷
  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {
      console.error("날짜 포맷 오류:", e);
      return dateString;
    }
  };

  // 이미지 URL 정규화
  const normalizeImageUrl = (imageUrl) => {
    if (!imageUrl) return "/311181644407751644.png";
    return imageUrl;
  };

  // 이미지 팝업을 열기 위한 함수
  const openImagePopup = (crack) => {
    // 첫 번째 균열 측정값 찾기 (날짜순 정렬 후 마지막 항목)
    let firstCrack = null;
    if (sortedCracks.length > 1) {
      firstCrack = sortedCracks[sortedCracks.length - 1];
    }

    setPopupImageData({
      imageUrl: normalizeImageUrl(crack.imageUrl),
      description: `${
        selectedWaypoint.label || `웨이포인트 ${selectedWaypoint.id}`
      } - 균열 사진`,
      metadata: {
        date: formatDate(crack.timestamp),
        width: `${crack.widthMm}mm`,
        // 첫 관측 이미지가 있으면 추가 (비교 모드용)
        firstImageUrl: firstCrack
          ? normalizeImageUrl(firstCrack.imageUrl)
          : null,
        firstWidth: firstCrack ? `${firstCrack.widthMm}mm` : null,
      },
    });
    setShowImagePopup(true);
  };

  // 웨이포인트가 없거나 균열 데이터가 없는 경우 처리
  if (!selectedWaypoint) {
    return (
      <div
        style={{ padding: "20px", textAlign: "center", color: "#666" }}
      ></div>
    );
  }

  if (!selectedWaypoint.cracks || selectedWaypoint.cracks.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
        이 웨이포인트에 균열 데이터가 없습니다. (ID: {safeWaypointId})
      </div>
    );
  }

  return (
    <div>
      {/* 선택된 큰 이미지 */}
      {selectedCrack && (
        <div style={{ marginBottom: "16px" }}>
          <img
            src={normalizeImageUrl(selectedCrack.imageUrl)}
            alt={`균열 (${selectedCrack.timestamp})`}
            style={{
              width: "100%",
              height: "45vh",
              objectFit: "contain",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onClick={() => openImagePopup(selectedCrack)}
          />
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "16px", fontWeight: "bold" }}>
              {formatDate(selectedCrack.timestamp)}
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>
              균열폭: {selectedCrack.widthMm}mm
            </div>
          </div>
        </div>
      )}

      {/* 썸네일 이미지 목록 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "8px",
        }}
      >
        {sortedCracks.map((crack, index) => (
          <div
            key={index}
            style={{
              cursor: "pointer",
              border:
                selectedCrack === crack
                  ? "3px solid #8800FF"
                  : "1px solid #eaeaea",
              borderRadius: "4px",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <img
              src={normalizeImageUrl(crack.imageUrl)}
              alt={`균열 (${crack.timestamp})`}
              style={{
                width: "100%",
                height: "80px",
                objectFit: "cover",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCrack(crack);

                if (e.detail === 2) {
                  openImagePopup(crack);
                }
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "rgba(0,0,0,0.6)",
                color: "white",
                padding: "4px",
                fontSize: "10px",
                textAlign: "center",
              }}
            >
              {formatDate(crack.timestamp).substring(0, 10)} ({crack.widthMm}mm)
            </div>
          </div>
        ))}
      </div>

      {/* 이미지 팝업 - 외부 ImagePopup 컴포넌트 사용 */}
      {showImagePopup && popupImageData && (
        <ImagePopup
          imageUrl={popupImageData.imageUrl}
          description={popupImageData.description}
          metadata={popupImageData.metadata}
          onClose={() => setShowImagePopup(false)}
        />
      )}
    </div>
  );
};
