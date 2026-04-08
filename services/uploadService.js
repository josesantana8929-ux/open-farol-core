const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Subir una imagen a Cloudinary
const uploadImage = (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'classifieds',
        transformation: [
          { width: 800, height: 800, crop: 'limit', quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    
    const readableStream = new Readable();
    readableStream.push(file.buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
};

// Subir múltiples imágenes
const uploadImages = async (files) => {
  try {
    const uploadPromises = files.map(file => uploadImage(file));
    const imageUrls = await Promise.all(uploadPromises);
    return imageUrls;
  } catch (error) {
    console.error('Error subiendo imágenes:', error);
    throw new Error('Error al subir las imágenes');
  }
};

// Eliminar imagen de Cloudinary
const deleteImage = async (imageUrl) => {
  try {
    // Extraer public_id de la URL
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1].split('.')[0];
    const publicId = `classifieds/${filename}`;
    
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error eliminando imagen:', error);
    // No lanzamos error para no interrumpir el flujo
  }
};

module.exports = {
  uploadImage,
  uploadImages,
  deleteImage
};
