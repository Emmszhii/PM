import { userData, rtm, localDevice } from './rtc.js';
import { getRequest } from '../helpers/helpers.js';
import { errorMsg, successMsg, warningMsg } from './msg.js';

const useTinyModel = true;
let track;
const startingMinutes = 1;
const startingSeconds = 60;
let time = startingMinutes * startingSeconds;
const end_time = 0;
let interval;
const backend = await faceapi.tf.getBackend();
const interval_second = 1000;

const faceRecognitionHandler = async () => {
  try {
    const { descriptor } = await get_descriptor();

    if (descriptor) {
      userData.descriptor = descriptor;
    } else {
      return warningMsg('No face registered by user');
    }

    document.querySelector('.videoCall').insertAdjacentHTML('beforeend', dom());

    document.getElementById('backend').textContent = backend;

    interval = setInterval(updateCountdown, 1000);

    document
      .querySelector('.close')
      .addEventListener('click', closeFaceRecognition);

    document
      .getElementById('camera_btn')
      .addEventListener('click', startCamera);

    document
      .getElementById('face_recognize_btn')
      .addEventListener('click', faceRecognized);
  } catch (e) {
    console.log(e);
  } finally {
    document.getElementById('loader_face').style.display = 'none';
  }
};

const dom = () => {
  return `
    <div class='modal_face'>
    <div class='modal_face_content'>
      <div class='svg_spinner' id="loader_face"></div>
      <span class='close'>&times;</span>
        <div class='title'>
          <p id='backend'></p>
          <span><i class='fa-solid fa-question' title="If cpu is your backend it may take a while else it should be faster"></i></span>
          </div>
        <div id="msg">
          <p id="video_title"></p>
          <p id="error"></p>
          <p id="success"></p>
        </div>
        <div id='countdown'>1:00</div>
        <div class='face_container'></div>
        <div class='buttons face_recognition_btn'>
          <button class='button' id='camera_btn'>
            <i class='fa-solid fa-camera'></i>
          </button>
          <button class='button' id='face_recognize_btn'>
            <i class='fa-solid fa-users-viewfinder'></i>
          </button>
        </div>
      </div>
    </div>
  `;
};

const sendAttendance = async (descriptor) => {
  rtm.channel.sendMessage({
    text: JSON.stringify({
      type: 'attendance',
      _id: userData._id,
      descriptor,
    }),
  });
};

const updateCountdown = () => {
  const minutes = Math.floor(time / 60);
  let seconds = time % 60;

  const countdown = document.getElementById('countdown');
  if (countdown) {
    countdown.innerHTML = `${minutes}:${seconds}`;
  }
  time--;

  if (time < end_time) {
    stopTimer();
  }
};

const stopTimer = () => {
  clearInterval(interval);
  const dom = document.querySelector('.modal_face');
  if (dom) {
    dom.remove();
  }
  const btn = document.getElementById('attendance-btn');
  if (btn) {
    btn.classList.remove('active');
  }
  time = startingMinutes * startingSeconds;
};

const startCamera = () => {
  document.getElementById('loader_face').style.display = 'block';
  stopCamera();
  removeFaceCanvas();

  const video = document.createElement('video');
  video.id = 'video';
  video.autoplay = true;
  video.muted = true;

  document.querySelector('.face_container').append(video);

  navigator.mediaDevices
    .getUserMedia({
      video: true,
    })
    .then((stream) => {
      video.srcObject = stream;
      if (backend === 'webgl') face_detection();
      track = stream.getTracks();
    })
    .catch((e) => {
      console.log(e);
      document
        .getElementById('msg')
        .insertAdjacentHTML('beforeend', deniedPermissionCamera());
    })
    .finally(() => {
      document.getElementById('loader_face').style.display = 'none';
    });
};

const deniedPermissionCamera = () => {
  return `
    <p>Something went wrong</p>
    <p>You need to allow camera to use face recognition</p>
  `;
};

const face_detection = () => {
  console.log(`run`);
};

const stopCamera = () => {
  const video = document.getElementById('video');
  if (video) {
    track[0] = stop();
    video.remove();
  }
};

const removeFaceCanvas = () => {
  const canvas = document.getElementById('user_face');
  if (canvas) canvas.remove();
};

const closeFaceRecognition = (e) => {
  const dom = document.querySelector('.modal_face');
  if (dom) dom.remove();
};

const faceRecognized = async () => {
  const loader = document.getElementById('loader_face');
  loader.style.display = 'block';
  try {
    const video = document.getElementById('video');

    // Guard clause
    if (!userData.descriptor)
      return warningMsg('User face recognition is not registered');
    if (!video) return warningMsg(`Please start the camera first`);

    stopCamera();
    const canvas = await faceapi.createCanvasFromMedia(video);
    canvas.id = 'user_face';
    document.querySelector('.face_container').append(canvas);

    const query = await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(useTinyModel)
      .withFaceDescriptors();

    if (query.length === 0 || query.length > 1) {
      return errorMsg('Invalid face. Please try again');
    }
    if (!query[0].descriptor) return errorMsg('Invalid Please Try again');

    // convert string to float32array
    const float = userData.descriptor.split(',');
    const data = new Float32Array(float);

    // if (query[0].descriptor) {
    const dist = await faceapi.euclideanDistance(data, query[0].descriptor);
    console.log(dist);
    const threshold = 0.4;
    if (dist <= threshold) {
      successMsg(`User match`);
      sendAttendance();
      stopTimer();
    } else {
      errorMsg('Not match. Please try again.');
    }
    // }
  } catch (e) {
    console.log(e);
  } finally {
    if (loader) loader.style.display = 'none';
  }
};

const get_descriptor = async () => {
  const url = '/getDescriptor';
  const data = await getRequest(url);
  return data;
};

export { faceRecognitionHandler };
