import { View, Image, Text, StyleSheet } from 'react-native';

/**
 * Componente reutilizable para mostrar avatar de usuario con fotos de Cloudinary
 * @param {string} name - Nombre del usuario para mostrar inicial
 * @param {string} photoURL - URL de Cloudinary desde Firestore
 * @param {number} size - Tamaño del avatar (default: 46)
 * @param {object} style - Estilos adicionales para el contenedor
 */
export const UserAvatar = ({ name, photoURL, size = 46, style }) => {
  const initial = (name?.[0] || '?').toUpperCase();

  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, style]}
      />
    );
  }

  return (
    <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.43 }]}>{initial}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: {
    resizeMode: 'cover',
  },
  avatarPlaceholder: {
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontWeight: '700',
    color: '#2196F3',
  },
});
