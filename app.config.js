export default {
  expo: {
    name: 'MediConnect',
    slug: 'app-citas',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icono.png',
    scheme: 'appcitas',
    userInterfaceStyle: 'automatic',
    associatedDomains: [
      'applinks:app-citas-2c83a.firebaseapp.com'
    ],
    newArchEnabled: true,
    ios: {
      supportsTablet: true
    },
    android: {
      package: 'com.rlvaleriee.Appcitas',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/icono.png'
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      enableProguardInReleaseBuilds: true,
      enableShrinkResourcesInReleaseBuilds: true,
      softwareKeyboardLayoutMode: 'resize',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'app-citas-2c83a.firebaseapp.com',
              pathPrefix: '/__/auth/action'
            }
          ],
          category: ['BROWSABLE', 'DEFAULT']
        }
      ],
      permissions: [
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION'
      ],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        }
      }
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png'
    },
    plugins: [
      'expo-router',
      'expo-image-picker',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Allow $(PRODUCT_NAME) to use your location.'
        }
      ],
      [
        'expo-notifications',
        {
          icon: './assets/images/icono.png',
          color: '#2196F3',
          sounds: [],
          mode: 'production'
        }
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/logo.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#FFFFFF',
          dark: {
            image: './assets/images/logo.png',
            backgroundColor: '#FFFFFF'
          }
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: '01620cdc-41cf-42fc-b856-1c35a21f0130'
      }
    },
    owner: 'rlvaleriee-2'
  }
};
