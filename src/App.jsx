import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import BuildingList from "./pages/BuildingList";
import CrackDetail from "./pages/CrackDetail";
import Sidebar from "./components/Sidebar";
import "./App.css";

function App() {
  const VWORLD_API_KEY =
    import.meta.env.VITE_VWORLD_API_KEY || "개발단계키입니다";

  return (
    <Router>
      <script
        type="text/javascript"
        src={`https://map.vworld.kr/js/webglMapInit.js.do?version=2.0&apiKey=${VWORLD_API_KEY}`}
      ></script>
      <div className="app-container">
        <Sidebar />
        <div className="content-container">
          <Routes>
            <Route path="/" element={<BuildingList />} />
            <Route
              path="/buildings/add"
              element={<div>건물 추가 페이지</div>}
            />

            <Route path="/building/:id" element={<CrackDetail />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
