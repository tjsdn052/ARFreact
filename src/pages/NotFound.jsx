import React from "react";
import { Link } from "react-router-dom";
import styles from "../styles/NotFound.module.css";

function NotFound() {
  return (
    <div className={styles.notFoundContainer}>
      <div className={styles.notFoundContent}>
        <h1 className={styles.errorCode}>404</h1>
        <h2 className={styles.title}>페이지를 찾을 수 없습니다</h2>
        <p className={styles.description}>
          요청하신 페이지가 존재하지 않습니다.
        </p>
        <Link to="/" className={styles.homeButton}>
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
