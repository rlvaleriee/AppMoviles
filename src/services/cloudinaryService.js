import axios from 'axios';

// Configuración de Cloudinary desde variables de entorno
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

/**
 * Sube una imagen a Cloudinary desde React Native
 * @param {string} uri - URI local de la imagen (desde ImagePicker)
 * @param {string} userId - ID del usuario (para nombrar la imagen)
 * @returns {Promise<Object>} - Objeto con la URL de la imagen subida
 */
export const uploadImageToCloudinary = async (uri, userId) => {
  try {
    // Crear el FormData para enviar la imagen
    const formData = new FormData();

    // En React Native, debemos proporcionar la imagen como un objeto
    const fileExtension = uri.split('.').pop().toLowerCase();
    const mimeType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';

    formData.append('file', {
      uri,
      type: mimeType,
      name: `profile_${userId}.${fileExtension}`,
    });

    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    // Opcional: tags para organizar (incluye el userId para búsquedas)
    formData.append('tags', `profile,user,uid_${userId}`);

    // URL de la API de Cloudinary (unsigned upload)
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    // Subir la imagen
    const response = await axios.post(cloudinaryUrl, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      // Timeout de 30 segundos
      timeout: 30000,
    });

    // Cloudinary devuelve varios URLs, usamos el secure_url (HTTPS)
    const result = {
      success: true,
      url: response.data.secure_url,
      publicId: response.data.public_id,
      format: response.data.format,
      width: response.data.width,
      height: response.data.height,
      bytes: response.data.bytes,
    };

    console.log('Imagen subida a Cloudinary:', result.url);
    return result;

  } catch (error) {
    console.error('Error subiendo a Cloudinary:', error);

    // Manejo de errores
    if (error.response) {
      // El servidor respondió con un código de error
      throw new Error(
        error.response.data?.error?.message ||
        'Error al subir la imagen a Cloudinary'
      );
    } else if (error.request) {
      // La petición se hizo pero no hubo respuesta
      throw new Error('No se pudo conectar con Cloudinary. Verifica tu conexión a internet.');
    } else {
      // Algo pasó al configurar la petición
      throw new Error(error.message || 'Error desconocido al subir la imagen');
    }
  }
};

/**
 * Elimina una imagen de Cloudinary
 * NOTA: Esta función requiere un backend con autenticación firmada
 * Para eliminar imágenes necesitas un endpoint en tu servidor que use
 * la API Key y API Secret de Cloudinary
 *
 * @param {string} publicId - Public ID de la imagen en Cloudinary
 * @returns {Promise<Object>}
 */
export const deleteImageFromCloudinary = async (publicId) => {
  console.warn(
    'deleteImageFromCloudinary: La eliminación de imágenes requiere ' +
    'autenticación en el servidor. Por ahora, solo sobrescribimos la imagen.'
  );

  // Para eliminar imágenes necesitarías un endpoint en tu backend
  // que use cloudinary.v2.uploader.destroy(publicId) con tus credenciales
  // Por seguridad, NO debes exponer tu API Secret en el cliente

  return {
    success: false,
    message: 'La eliminación requiere un endpoint en el servidor'
  };
};

/**
 * Genera URLs transformadas de Cloudinary con diferentes tamaños
 * @param {string} url - URL original de Cloudinary
 * @param {Object} options - Opciones de transformación
 * @returns {string} - URL transformada
 */
export const getTransformedImageUrl = (url, options = {}) => {
  if (!url || !url.includes('cloudinary.com')) return url;

  const {
    width = null,
    height = null,
    crop = 'fill',
    gravity = 'face',
    quality = 'auto',
    format = 'auto',
  } = options;

  // Construir las transformaciones
  const transformations = [];

  if (width || height) {
    const dimensions = [];
    if (width) dimensions.push(`w_${width}`);
    if (height) dimensions.push(`h_${height}`);
    dimensions.push(`c_${crop}`);
    if (gravity && crop === 'fill') dimensions.push(`g_${gravity}`);
    transformations.push(dimensions.join(','));
  }

  transformations.push(`q_${quality}`);
  transformations.push(`f_${format}`);

  // Insertar las transformaciones en la URL
  const parts = url.split('/upload/');
  if (parts.length === 2) {
    return `${parts[0]}/upload/${transformations.join(',')}/${parts[1]}`;
  }

  return url;
};

/**
 * Genera URLs de thumbnails en diferentes tamaños
 * @param {string} url - URL original de Cloudinary
 * @returns {Object} - Objeto con diferentes tamaños
 */
export const generateThumbnails = (url) => {
  if (!url || !url.includes('cloudinary.com')) {
    return {
      thumbnail: url,
      small: url,
      medium: url,
      large: url,
      original: url,
    };
  }

  return {
    thumbnail: getTransformedImageUrl(url, { width: 80, height: 80 }),
    small: getTransformedImageUrl(url, { width: 200, height: 200 }),
    medium: getTransformedImageUrl(url, { width: 400, height: 400 }),
    large: getTransformedImageUrl(url, { width: 800, height: 800 }),
    original: url,
  };
};
