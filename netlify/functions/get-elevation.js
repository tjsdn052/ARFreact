exports.handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  // GET 요청만 허용
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // 쿼리 파라미터에서 위도, 경도 추출
    const { lat, lng } = event.queryStringParameters || {};

    if (!lat || !lng) {
      console.error("파라미터 오류:", {
        lat,
        lng,
        queryStringParameters: event.queryStringParameters,
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "lat과 lng 파라미터가 필요합니다.",
          received: { lat, lng },
        }),
      };
    }

    // 위도, 경도 값 검증
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "lat과 lng는 유효한 숫자여야 합니다.",
          received: { lat, lng },
        }),
      };
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "lat은 -90~90, lng는 -180~180 범위여야 합니다.",
          received: { lat: latitude, lng: longitude },
        }),
      };
    }

    console.log(`고도 요청: 위도 ${latitude}, 경도 ${longitude}`);

    // Google Elevation API 키 (환경변수에서 가져오기)
    const GOOGLE_API_KEY = "AIzaSyDHi9RsHox8qlfq2Gh-SAUon7HTMx65eR4";

    if (!GOOGLE_API_KEY) {
      console.error("Google API 키가 설정되지 않음");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error:
            "Google Elevation API 키가 설정되지 않았습니다. 환경변수 GOOGLE_ELEVATION_API_KEY를 확인해주세요.",
        }),
      };
    }

    // Google Elevation API 호출
    const apiUrl = `https://maps.googleapis.com/maps/api/elevation/json?locations=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
    console.log("API 요청 URL:", apiUrl);

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google API HTTP 오류 ${response.status}:`, errorText);
      throw new Error(
        `Google API 호출 실패: ${response.status} - ${errorText}`
      );
    }

    // 응답 텍스트를 먼저 가져와서 로깅
    const responseText = await response.text();
    console.log("Google API 응답:", responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSON 파싱 오류:", parseError);
      console.error("응답 텍스트:", responseText);
      throw new Error(
        `Google API 응답을 파싱할 수 없습니다: ${parseError.message}`
      );
    }

    if (data.status !== "OK") {
      console.error("Google API 상태 오류:", data);
      throw new Error(
        `Google API 오류: ${data.status} - ${
          data.error_message || "Unknown error"
        }`
      );
    }

    if (!data.results || data.results.length === 0) {
      console.error("Google API 결과 없음:", data);
      throw new Error("Google API에서 고도 데이터를 찾을 수 없습니다.");
    }

    // 고도값 반환
    const elevation = data.results[0]?.elevation || 0;
    console.log(`고도 정보: ${elevation}m (위치: ${latitude}, ${longitude})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        elevation: elevation,
        location: {
          lat: latitude,
          lng: longitude,
        },
      }),
    };
  } catch (error) {
    console.error("Elevation API 오류:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "고도 정보를 가져오는데 실패했습니다.",
        details: error.message,
      }),
    };
  }
};
