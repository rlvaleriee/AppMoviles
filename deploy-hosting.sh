#!/bin/bash

# Script para desplegar Firebase Hosting
# Uso: ./deploy-hosting.sh

echo "🚀 Desplegando Firebase Hosting para Deep Linking..."
echo ""

# Verificar si Firebase CLI está instalado
if ! command -v firebase &> /dev/null
then
    echo "❌ Firebase CLI no está instalado."
    echo "📦 Instalando Firebase CLI..."
    npm install -g firebase-tools
fi

# Login en Firebase (si no está logueado)
echo "🔐 Verificando autenticación de Firebase..."
firebase login --reauth

# Desplegar solo hosting
echo "📤 Desplegando a Firebase Hosting..."
firebase deploy --only hosting

echo ""
echo "✅ ¡Despliegue completado!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Configura la URL de acción en Firebase Console:"
echo "   https://app-citas-2c83a.firebaseapp.com/__/auth/action"
echo ""
echo "2. Reconstruye tu app nativa:"
echo "   npx expo prebuild --clean"
echo "   npx expo run:android"
echo ""
echo "3. Prueba el enlace de restablecimiento desde tu dispositivo móvil"
