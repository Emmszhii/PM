import {
  preloader,
  recognizeHandler,
  startVideoHandler,
  photoHandler,
  fetchPrevDescriptor,
  informationHandler,
} from './face_recognition.js';

document
  .getElementById('recognize-btn')
  .addEventListener('click', recognizeHandler);
document
  .getElementById('camera-btn')
  .addEventListener('click', startVideoHandler);
document.getElementById('photo-btn').addEventListener('click', photoHandler);

window.addEventListener('load', () => {
  Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  ])
    .then(() => {
      // faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      // faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
      // faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      fetchPrevDescriptor();
      informationHandler();
    })
    .catch((err) => {
      console.log(err);
    })
    .finally(() => {
      preloader.style.display = 'none';
    });
});