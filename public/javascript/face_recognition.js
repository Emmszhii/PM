const preloader = document.getElementById('preloader');
const camera = document.querySelector('.attendance-camera');
let track;
const useTinyModel = true;
const refUser = [];

const tinyFaceOption = new faceapi.TinyFaceDetectorOptions({
  inputSize: 416,
});

const fetchPrevDescriptor = async () => {
  const res = await fetch('/getDescriptor', { method: 'get' });
  const data = await res.json();
  if (res.status === 200) {
    if (data.descriptor) {
      const split = data.descriptor.split(',');
      const float32 = new Float32Array(split);
      refUser.push([{ descriptor: float32 }]);
      msgHandler('Previous face description is now added.');
      console.log(refUser);
    }
  }
  if (res.status === 400) {
    errorHandler(data.err);
  }
};

// VIDEO HANDLER
const startVideoHandler = async () => {
  const backend = faceapi.tf.getBackend();
  preloader.style.display = 'block';
  const vid = document.createElement('video');
  vid.id = 'video';
  vid.width = '1920';
  vid.height = '1080';
  vid.autoplay = true;
  vid.muted = true;

  const submit = document.getElementById('submit-btn');
  if (submit) submit.remove();

  const overlay = document.getElementById('overlay');
  if (overlay) overlay.remove();

  const canvas = document.getElementById('canvas');
  if (canvas) canvas.remove();

  const video = document.getElementById('video');
  if (!video) camera.insertBefore(vid, camera.firstChild);

  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((stream) => {
      vid.srcObject = stream;
      if (backend === 'webgl') return faceDetection(100);
      if (backend === 'cpu') return faceDetection(1000);
      track = stream.getTracks();
      resetMessages();
    })
    .catch((e) => {
      console.log(e);
    })
    .finally(() => {
      preloader.style.display = 'none';
    });
};

const faceDetection = (ms) => {
  const video = document.getElementById(`video`);
  console.log(video);

  const displaySize = { width: video.width, height: video.height };

  video.addEventListener('click', () => {
    console.log(`run`);
  });

  video.addEventListener('play', () => {
    console.log(`run`);
    const canvas = faceapi.createCanvasFromMedia(video);
    camera.append(canvas);

    faceapi.matchDimensions(canvas, displaySize);

    // interval
    setInterval(async () => {
      console.log(`this run`);

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

      faceapi.draw.drawDetections(canvas, resizedDetections);

      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
    }, ms);
  });
};

// PHOTO HANDLER
const photoHandler = async () => {
  preloader.style.display = 'block';
  const video = document.getElementById('video');
  const canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  canvas.width = '1920';
  canvas.height = '1080';
  const context = canvas.getContext('2d');
  const canvasDom = document.getElementById('canvas');
  if (!canvasDom) camera.append(canvas);

  try {
    if (video) {
      context.imageSmoothingEnabled = false;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const id = document.getElementById('canvas');

      // face api detection
      const detection = await faceapi.detectAllFaces(id, tinyFaceOption);
      // .withFaceLandmarks(useTinyModel)
      // .withFaceDescriptors();
      console.log(detection);

      // if no detection
      if (detection.length < 1 || detection.length > 1) {
        stopVideo();
        errorHandler('Image are invalid. Please Try again!');
        return startVideoHandler();
      }
      // stop video play
      stopVideo();

      // if face is detected
      await drawCanvas(canvas);
    } else {
      errorHandler('Start the camera first!');
    }
  } catch (err) {
    console.log(err);
  } finally {
    preloader.style.display = 'none';
  }
};

const drawCanvasGpu = async (input) => {};

const drawCanvas = async (input) => {
  // preloader.style.display = 'block';
  const container = document.createElement('canvas');
  container.id = 'overlay';
  document.querySelector('.attendance-camera').appendChild(container);

  // camera default size
  const displaySize = { width: input.width, height: input.height };
  const canvas_overlay = document.getElementById('overlay');
  faceapi.matchDimensions(canvas_overlay, displaySize);

  // display face landmarks
  const detectionWithLandmarks = await faceapi
    .detectSingleFace(input, tinyFaceOption)
    .withFaceLandmarks()
    .withFaceDescriptor();

  // reset array
  refUser.length = [];
  // input user array
  refUser.push([detectionWithLandmarks]);

  // resized the detected boxes and landmarks
  const resizedResults = faceapi.resizeResults(
    detectionWithLandmarks,
    displaySize
  );

  // draw the landmarks into the canvas
  faceapi.draw.drawFaceLandmarks(canvas_overlay, resizedResults);

  // draw detections points into canvas
  faceapi.draw.drawDetections(canvas_overlay, resizedResults);
  msgHandler(
    'If you are satisfied with this photo try to recognize else retry'
  );
  // preloader.style.display = 'none';
};

// RECOGNIZE HANDLER
const recognizeHandler = async () => {
  preloader.style.display = 'block';
  const video = document.getElementById('video');
  if (refUser.length === 0) {
    return errorHandler('No Reference Image !');
  }
  let img1 = refUser[0];
  console.log(refUser);
  let img2;

  // create Canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  canvas.width = '1920';
  canvas.height = '1080';
  const context = canvas.getContext('2d');
  const canvasDom = document.getElementById('canvas');
  if (!canvasDom) camera.append(canvas);

  try {
    if (video) {
      context.imageSmoothingEnabled = false;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const id = document.getElementById('canvas');

      // face api detection
      const detection = await faceapi
        .detectAllFaces(id, tinyFaceOption)
        .withFaceLandmarks()
        .withFaceDescriptors();

      // if no detection
      if (detection.length < 1 || detection.length > 1) {
        stopVideo();
        errorHandler('Face invalid, try again');
        return startVideoHandler();
      }

      img2 = detection[0];

      stopVideo();
      // guard clause
      if (!img1) return errorHandler(`Record your face first!`);
      if (!img2) return errorHandler(`Face not recognize`);

      img1 = img1[0].descriptor;
      img2 = img2.descriptor;
      // comparing the 2 image
      comparePerson(img1, img2);
    } else {
      errorHandler('Start the camera first!');
    }
  } catch (e) {
    console.log(e);
  } finally {
    preloader.style.display = 'none';
  }
};

// compare the person
const comparePerson = async (referenceImg, queryImg) => {
  // guard clause if input is null
  if (!referenceImg) return errorHandler('Please register an image first');
  if (!queryImg) return errorHandler('Query img is invalid');
  // if both are defined run the face recognition
  if (queryImg) {
    // matching B query
    const dist = faceapi.euclideanDistance(referenceImg, queryImg);
    if (dist <= 0.4) {
      msgHandler(`Face are match!`);
      createPostButton();
    } else {
      errorHandler('Face does not Match!');
    }
  } else {
    errorHandler('No face detected!');
  }
};

// stop video when capturing
const stopVideo = () => {
  const video = document.getElementById('video');
  if (video) {
    track[0].stop();
    video.remove();
  } else {
    startVideo();
  }
};

const resetMessages = () => {
  const err = document.getElementById('err');
  const msg = document.getElementById('msg');
  if (err) err.remove();
  if (msg) msg.remove();
};

const errorHandler = (err) => {
  const msg = document.getElementById('msg');
  if (msg) {
    msg.remove();
  }
  const p = document.createElement('p');
  p.textContent = err;
  p.id = 'err';

  const errP = document.getElementById('err');
  if (errP) {
    errP.innerText = err;
  } else {
    document.getElementById('messages').appendChild(p);
  }
};

const msgHandler = (msg) => {
  const err = document.getElementById('err');
  if (err) {
    err.remove();
  }
  const p = document.createElement('p');
  p.textContent = msg;
  p.id = 'msg';

  const msgP = document.getElementById('msg');
  if (msgP) {
    msgP.innerText = msg;
  } else {
    document.getElementById('messages').appendChild(p);
  }
};

const createPostButton = async () => {
  const buttons = document.querySelector('.buttons');
  const button = document.createElement('button');
  button.classList.add('button');
  button.innerHTML = 'Submit';
  button.id = 'submit-btn';

  buttons.append(button);
  button.addEventListener('click', showConfirm);
};

const showConfirm = () => {
  const modal = document.getElementById('modal-confirm');
  const confirmBtn = document.getElementById('confirm');
  const cancelBtn = document.getElementById('cancel');

  modal.style.display = 'block';

  cancelBtn.addEventListener('click', hideConfirm);
  confirmBtn.addEventListener('click', postToServer);
};

const hideConfirm = () => {
  document.getElementById('modal-confirm').style.display = 'none';
  document.getElementById('password').value = '';
};

const postToServer = async (e) => {
  e.preventDefault();
  const password = document.getElementById('password');
  try {
    const id = refUser[0];
    const descriptor = id[0].descriptor.toString();

    const response = await fetch(`/descriptor`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        descriptor,
        password: password.value,
      }),
    });
    const data = await response.json();
    if (response.status === 200) {
      if (data.msg) {
        return msgHandler(data.msg);
      } else {
        return errorHandler(data.err);
      }
    } else {
      return errorHandler(data.err);
    }
  } catch (err) {
    return errorHandler(err);
  } finally {
    hideConfirm();
  }
};

// const getUserCameraDevices = () => {
//   return navigator.mediaDevices.enumerateDevices().then((devices) => {
//     console.log(devices);
//     return devices.filter((item) => item.kind === 'videoinput');
//   });
// };

// getUserCameraDevices().then((i) => createSelectElement('Video', i));

// const createSelectElement = (name, val) => {
//   // dynamic select
//   const select = document.createElement('select');
//   select.name = name;
//   select.id = name;
//   for (let i = 0; val.length > i; i++) {
//     const option = document.createElement('option');
//     option.value = val[i].label;
//     option.text = val[i].label;
//     select.appendChild(option);
//   }

//   const label = document.createElement('label');
//   label.id = name;
//   label.innerHTML = name;
//   label.htmlFor = name;

//   document.getElementById('devices').appendChild(label).appendChild(select);
// };

export {
  preloader,
  camera,
  track,
  refUser,
  fetchPrevDescriptor,
  startVideoHandler,
  photoHandler,
  stopVideo,
  resetMessages,
  recognizeHandler,
  errorHandler,
  msgHandler,
  comparePerson,
  createPostButton,
  postToServer,
  drawCanvas,
};
