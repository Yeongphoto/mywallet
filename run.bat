@echo off
title MyWallet Dev Server Selector
echo ===================================================
echo   [MyWallet] 가계부 앱 로컬 개발 서버 실행기
echo ===================================================
echo.
echo   [1] 로컬 D1 데이터베이스 연동 개발 (백엔드 에뮬레이션 포함)
echo       * 주소: http://localhost:8788
echo       * 로컬 D1 SQLITE DB를 백엔드로 사용합니다.
echo.
echo   [2] 순수 프론트엔드 단독 개발 (Vite Dev 모드)
echo       * 주소: http://localhost:5173
echo       * 로컬스토리지를 fallback으로 사용합니다.
echo.
echo ===================================================
set /p choice="실행할 모드 번호를 입력하세요 (1 또는 2): "

if "%choice%"=="1" (
    echo.
    echo D1 연동 개발 서버를 실행합니다...
    echo dist 디렉토리 빌드를 먼저 진행합니다.
    call npm run build
    call npm run dev:d1
) else (
    echo.
    echo Vite 순수 프론트엔드 개발 서버를 실행합니다...
    call npm run dev
)
pause
