@echo off
REM Script para desplegar Firebase Hosting en Windows
REM Uso: deploy-hosting.bat

echo.
echo 🚀 Desplegando Firebase Hosting para Deep Linking...
echo.

REM Verificar si Firebase CLI está instalado
where firebase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Firebase CLI no está instalado.
    echo 📦 Instalando Firebase CLI...
    call npm install -g firebase-tools
)

REM Login en Firebase
echo 🔐 Verificando autenticación de Firebase...
call firebase login --reauth

REM Desplegar solo hosting
echo 📤 Desplegando a Firebase Hosting...
call firebase deploy --only hosting

echo.
echo ✅ ¡Despliegue completado!
echo.
echo 📋 Próximos pasos:
echo 1. Configura la URL de acción en Firebase Console:
echo    https://app-citas-2c83a.firebaseapp.com/__/auth/action
echo.
echo 2. Reconstruye tu app nativa:
echo    npx expo prebuild --clean
echo    npx expo run:android
echo.
echo 3. Prueba el enlace de restablecimiento desde tu dispositivo móvil
echo.

pause
