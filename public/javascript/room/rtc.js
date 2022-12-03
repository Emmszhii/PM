// initializing the variables
const cameraBtn = document.getElementById('camera-btn');
const screenBtn = document.getElementById('screen-btn');
import { makeAttendanceHandler } from './attendance.js';
import {
  users,
  getMembers,
  handleChannelMessage,
  handleMemberJoin,
  handleMemberLeft,
  handleRtmTokenExpire,
} from './rtm.js';
import {
  meetingId,
  displayFrame,
  userIdInDisplayFrame,
  expandVideoFrame,
  resetTheFrames,
  createSelectElement,
  settingsHandler,
  roomLoaderHandler,
  checkIfUserDom,
  setUserToFirstChild,
} from './room.js';
import { getRequest, postRequest } from '../helpers/helpers.js';
import { errorMsg } from './msg.js';
import { student, teacher, deleteIdInArr } from './excel.js';
import { allVideoAndAudioDevices } from '../helpers/devices.js';

// User Local Data and Tokens
const userData = {};

// User Local Devices
const localDevice = [];
const video_devices = [];
const audio_devices = [];

// selected device
const device = {
  localAudio: null,
  localVideo: null,
};

// rtc API
const rtc = {
  // rtc.client
  client: null,
  // rtc local audio
  localAudioTrack: null,
  // rtc local video
  localVideoTrack: null,
  // rtc local tracks
  localTracks: null,
  // rtc local screen track
  localScreenTracks: null,
  // rtc boolean screen share
  sharingScreen: false,
};

// rtm API
const rtm = {
  // rtm.client
  client: null,
  channel: null,
};

// remote users
const remoteUsers = {};

// player DOM element
const player = (uid, name) => {
  return `
    <div class="video__container" id="user-container-${uid}">
      <div class="video-player" id="user-${uid}">
      </div>
      <div class='name'>
        <p>${name}</p>
      </div>
    </div>
    `;
};

const getRtcToken = async () => {
  const url = `/rtc/${meetingId}/publisher/uid/${userData.rtcId}`;
  const data = await getRequest(url);
  return data;
};

const data_init = async () => {
  try {
    const infoUrl = `/getInfo`;
    const { _id, first_name, middle_name, last_name, type, AGORA_APP_ID } =
      await getRequest(infoUrl);
    userData.type = type;
    userData.APP_ID = AGORA_APP_ID;
    userData.firstName = first_name;
    userData.middleName = middle_name;
    userData.lastName = last_name;
    userData.fullName = `${first_name} ${last_name}`;
    userData.id = _id;
    userData.rtcId = _id;
    userData.rtmId = _id;
    const rtcUrl = `/rtc/${meetingId}/publisher/uid`;
    const { rtcToken } = await getRequest(rtcUrl);
    userData.rtcToken = rtcToken;
    const rtmUrl = `/rtm`;
    const { rtmToken } = await getRequest(rtmUrl);
    userData.rtmToken = rtmToken;
  } catch (err) {
    console.log(err);
  } finally {
    joinRoomInit();
  }
};

// initializing the agora sdk for joining the room and validating the user token for security joining
const joinRoomInit = async () => {
  if (userData.type === 'teacher') makeAttendanceHandler();

  // letting rtc.client become the instance with APP_ID
  rtm.client = await AgoraRTM.createInstance(userData.APP_ID, {
    logFilter: AgoraRTM.LOG_FILTER_WARNING,
  });

  // option to login into RTM
  const rtmOption = {
    uid: userData.rtmId,
    token: userData.rtmToken,
  };

  // login to the rtm with user id and rtmToken
  await rtm.client.login(rtmOption);

  // give the name of the local user to remote users
  await rtm.client.addOrUpdateLocalUserAttributes({
    name: userData.fullName,
    rtcId: userData.rtcId,
  });

  // create channel with meetingId
  rtm.channel = await rtm.client.createChannel(meetingId);

  // join RTM
  await rtm.channel.join();

  // setting the rtm channel on with handlers
  await rtm.channel.on('MemberJoined', handleMemberJoin);
  await rtm.channel.on('MemberLeft', handleMemberLeft);
  await rtm.channel.on('ChannelMessage', handleChannelMessage);
  await rtm.channel.on('token-privilege-will-expire', handleRtmTokenExpire);

  // get all members in render it to the dom
  getMembers();

  // initialize setting the rtc
  rtc.client = await AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  // join rtc with the params info
  await rtc.client.join(
    userData.APP_ID,
    meetingId,
    userData.rtcToken,
    userData.rtcId
  );

  // on user publish and left method
  await rtc.client.on('user-published', handleUserPublished);
  await rtc.client.on('user-left', handleUserLeft);
  await rtc.client.enableAudioVolumeIndicator();
  await rtc.client.on('volume-indicator', volumeIndicator);
  await rtc.client.on('token-privilege-will-expire', handleRtcTokenExpire);

  // set the users camera and mic
  settingsHandler();

  // if All are loaded loader will be gone
  roomLoaderHandler();
};

const volumeIndicator = async (user) => {
  const streams = document.getElementById('streams__container');
  user.forEach((volume) => {
    const uid = volume.uid;
    const level = volume.level;
    const userContainer = document.getElementById(`user-container-${uid}`);
    if (!userContainer) return;
    if (level >= 1) {
      userContainer.style.border = `2px solid rgba(76,175,80,${level})`;
      if (userIdInDisplayFrame.val !== `user-container-${uid}`)
        streams.insertBefore(userContainer, streams.firstChild);
    }
    if (level < 1) userContainer.style.border = `1px solid #494949`;
  });
};

const handleRtcTokenExpire = async () => {
  try {
    const { rtcToken } = await getRtcToken();
    await rtc.client.renewToken(rtcToken);
  } catch (e) {
    console.log(e);
  }
};

// user joined the meeting handler
const handleUserPublished = async (user, mediaType) => {
  // set remote users as user
  remoteUsers[user.uid] = user;

  // subscribe to the meeting
  await rtc.client.subscribe(user, mediaType);

  //
  const playerDom = document.getElementById(`user-container-${user.uid}`);
  // if player is null then run it
  if (playerDom === null) {
    let name;
    for (let i = 0; users.length > i; i++) {
      if (users[i].rtcId === user.uid) {
        name = users[i].name;
      }
    }
    // add player to the dom
    document
      .getElementById('streams__container')
      .insertAdjacentHTML('beforeend', player(user.uid, name));
    //onClick user will be able to expand it
    document
      .getElementById(`user-container-${user.uid}`)
      .addEventListener('click', expandVideoFrame);
  }

  // if big screen is true let the other users resize their screen
  if (displayFrame.style.display) {
    const videoFrame = document.getElementById(`user-container-${user.uid}`);
    videoFrame.style.width = `300px`;
    videoFrame.style.height = `200px`;
  }

  try {
    // if media is VIDEO play their video in stream container
    if (mediaType === 'video') {
      user.videoTrack.play(`user-${user.uid}`);
    }
    // if media is AUDIO play their audio
    if (mediaType === 'audio') {
      user.audioTrack.play();
    }
  } catch (err) {
    const arrErr = [
      {
        err: `rtc.js:250 Cannot read properties of undefined (reading 'play')`,
        msg: ``,
      },
      { err: `Cannot read properties of undefined (reading 'play')`, msg: `` },
      { err: `user.videoTrack is undefined`, msg: `` },
    ];
    arrErr.map((item) => {
      if (item.err.includes(err.message)) errorMsg(item.msg);
    });
  }
};

// user left the meeting
const handleUserLeft = async (user) => {
  // delete a remote user with their uid
  delete remoteUsers[user.uid];

  // delete the dom of the user uid who left
  const item = document.getElementById(`user-container-${user.uid}`);
  if (item) item.remove();

  if (userIdInDisplayFrame.val === `user-container-${user.uid}`) {
    // if user is on big display and left delete it
    displayFrame.style.display = null;
    // reset user frames
    resetTheFrames();
  }

  deleteIdInArr(user.uid);
};

// Camera function
const toggleCamera = async (e) => {
  if (!device.localVideo) return errorMsg('No camera device detected');
  const button = e.currentTarget;
  try {
    // rtc video muting
    if (rtc.localTracks[1].muted) {
      await rtc.localTracks[1].setMuted(false);
      await rtm.channel.sendMessage({
        text: JSON.stringify({ type: 'active_camera', _id: userData.id }),
      });
      setUserToFirstChild(userData.id);
      button.classList.add('active');
    } else {
      await rtc.localTracks[1].setMuted(true);
      button.classList.remove('active');
    }
  } catch (err) {
    console.log(err);
  }
};
// Audio function
const toggleMic = async (e) => {
  if (!device.localAudio) return errorMsg('No microphone device detected');
  const button = e.currentTarget;

  try {
    // rtc audio muting
    if (rtc.localTracks[0].muted) {
      await rtc.localTracks[0].setMuted(false);
      button.classList.add('active');
    } else {
      await rtc.localTracks[0].setMuted(true);
      button.classList.remove('active');
    }
  } catch (err) {
    console.log(err);
  }
};

// After disabling the share screen function then switch to Camera
const switchToCamera = async () => {
  // reset the Display Frame
  displayFrame.style.display = null;

  // add the local user in the dom
  document
    .getElementById('streams__container')
    .insertAdjacentHTML('beforeend', player(userData.rtcId, userData.fullName));
  document
    .getElementById(`user-container-${userData.rtcId}`)
    .addEventListener('click', expandVideoFrame);

  // mute the local tracks of the user
  if (rtc.localTracks[0]) await rtc.localTracks[0].setMuted(true);
  if (rtc.localTracks[1]) await rtc.localTracks[1].setMuted(true);

  // removing the active class
  document.getElementById(`mic-btn`).classList.remove('active');
  document.getElementById(`screen-btn`).classList.remove('active');

  // play the user video
  rtc.localTracks[1].play(`user-${userData.rtcId}`);

  // publish the video
  await rtc.client.publish([rtc.localTracks[1]]);
};

// stop share screen handler
const handleStopShareScreen = async () => {
  rtc.sharingScreen = false;
  cameraBtn.style.display = 'block';
  if (screenBtn.classList.contains('active'))
    screenBtn.classList.remove('active');

  // remove the local screen tracks to the dom
  document.getElementById(`user-container-${userData.rtcId}`).remove();

  //unpublish the local screen tracks
  await rtc.client.unpublish([rtc.localScreenTracks]);
  await rtc.localScreenTracks.close();

  // reset users frame
  resetTheFrames();
  // then switch to camera
  switchToCamera();

  rtm.channel.sendMessage({
    text: JSON.stringify({
      type: 'user_screen_share_close',
      uid: userData.rtcId,
    }),
  });
};

// Screen function
const toggleScreen = async (e) => {
  // if rtc sharing screen is false
  if (!rtc.sharingScreen) {
    // let variable for error handling
    let error = false;
    // run rtc localScreenTracks

    rtc.localScreenTracks = await AgoraRTC.createScreenVideoTrack({
      withAudio: 'auto',
    }).catch(async (err) => {
      const arrErr = [
        'AgoraRTCError PERMISSION_DENIED: NotAllowedError: Permission denied',
      ];

      rtc.sharingScreen = false;
      screenBtn.classList.remove('active');
      error = !error;
      if (arrErr.includes(err.message)) return;
      console.log(err.message);
    });

    // if error is true this function will end
    if (error === true) return;

    // if error is false this will run
    rtc.sharingScreen = true;
    screenBtn.classList.add('active');
    cameraBtn.classList.remove('active');
    cameraBtn.style.display = 'none';

    // remove the local video screen
    const userDom = document.getElementById(`user-container-${userData.rtcId}`);

    if (userDom) userDom.remove();

    displayFrame.style.display = ' block';

    // display in big frame the player dom
    displayFrame.insertAdjacentHTML(
      'beforeend',
      player(userData.rtcId, userData.fullName)
    );
    document
      .getElementById(`user-container-${userData.rtcId}`)
      .addEventListener('click', expandVideoFrame);

    //
    userIdInDisplayFrame.val = `user-container-${userData.rtcId}`;
    rtc.localScreenTracks.play(`user-${userData.rtcId}`);

    // unpublish the video track
    if (rtc.localTracks[1]) await rtc.client.unpublish([rtc.localTracks[1]]);
    // publish the screen track
    await rtc.client.publish([rtc.localScreenTracks]);

    // reset each user Frames
    resetTheFrames();

    // sending my uid to make viewer view my local screen track
    rtm.channel.sendMessage({
      text: JSON.stringify({ type: 'user_screen_share', uid: userData.rtcId }),
    });

    await rtc.localScreenTracks.on('track-ended', handleStopShareScreen);
  } else {
    handleStopShareScreen();
  }
};

AgoraRTC.onMicrophoneChanged = async (changedDevice) => {
  try {
    if (!rtc.localTracks[0].muted) {
      if (changedDevice.state === 'ACTIVE') {
        rtc.localTracks[0].setDevice(changedDevice.device.deviceId);
        // Switch to an existing device when the current device is unplugged.
      } else if (
        changedDevice.device.label === rtc.localTracks[0].getTrackLabel()
      ) {
        const oldMicrophones = await AgoraRTC.getMicrophones();
        oldMicrophones[0] &&
          rtc.localTracks[0].setDevice(oldMicrophones[0].deviceId);
      }
    }
  } catch (e) {
    console.log(e);
  }
};

AgoraRTC.onCameraChanged = async (changedDevice) => {
  try {
    if (!rtc.localTracks[1].muted) {
      // When plugging in a device, switch to a device that is newly plugged in.
      if (changedDevice.state === 'ACTIVE') {
        rtc.localTracks[1].setDevice(changedDevice.device.deviceId);
        // Switch to an existing device when the current device is unplugged.
      } else if (
        changedDevice.device.label === rtc.localTracks[1].getTrackLabel()
      ) {
        const oldCameras = await AgoraRTC.getCameras();
        oldCameras[0] && rtc.localTracks[1].setDevice(oldCameras[0].deviceId);
      }
    }
  } catch (e) {
    console.log(e);
  }
};

const leaveLocalAttributeKey = async () => {
  try {
    await rtm.client.deleteLocalUserAttributesByKeys([
      'joinedName',
      'joinedId',
    ]);
  } catch (e) {
    console.log(e);
  }
};

const addJoinedUserLocalAttribute = async () => {
  await rtm.client.addOrUpdateLocalUserAttributes({
    joinedName: userData.fullName,
    joinedId: userData.rtcId,
  });
};

// joining the stream
const joinStream = async () => {
  // display loader
  roomLoaderHandler();

  // reset buttons
  document.getElementsByClassName('mainBtn')[0].style.display = 'none';
  document.getElementsByClassName('middleBtn')[0].style.display = 'flex';
  document.getElementById('settings-btn').style.display = 'none';
  try {
    // initialize local tracks

    if (device.localVideo && device.localAudio) {
      rtc.localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
        { cameraId: device.localVideo },
        { microphoneId: device.localAudio, config: { ANS: true } }
      );

      await rtc.localTracks[0].setMuted(true);
      await rtc.localTracks[1].setMuted(true);

      // handle error on video track
      await rtc.localTracks[0].on('track-ended', audioTrackEnded);
      await rtc.localTracks[1].on('track-ended', videoTrackEnded);

      // add the player into the DOM
      checkIfUserDom(userData.id, userData.fullName);

      rtc.localTracks[1].play(`user-${userData.rtcId}`);
      // localTracks[0] for audio and localTracks[1] for the video
      await rtc.client.publish([rtc.localTracks[0], rtc.localTracks[1]]);
    }

    rtm.channel.sendMessage({
      text: JSON.stringify({
        type: `user_join`,
        rtcId: userData.id,
        name: userData.fullName,
      }),
    });

    addJoinedUserLocalAttribute();
  } catch (err) {
    const arrError = [
      {
        err: 'AgoraRTCError PERMISSION_DENIED: NotAllowedError: Permission denied',
        msg: 'Permission to use cam and mic are denied by user. User may not able to stream their audio, video, and stream',
      },
    ];
    arrError.map((arr) => {
      if (arr.err.includes(err.message)) return errorMsg(arr.msg);
    });
  } finally {
    roomLoaderHandler();
  }
};

const audioTrackEnded = async () => {
  console.log(`audio track ended`);
  await rtc.localTracks[0].setMuted(true);
};

const videoTrackEnded = async () => {
  console.log(`video track ended`);
  await rtc.localTracks[1].setMuted(true);
};

// leave stream
const leaveStream = async (e) => {
  e.preventDefault();
  const user = document.getElementById(`user-container-${userData.rtcId}`);

  document.getElementById('camera-btn').classList.remove('active');
  document.getElementById('mic-btn').classList.remove('active');
  document.getElementsByClassName('mainBtn')[0].style.display = 'flex';
  document.getElementsByClassName('middleBtn')[0].style.display = 'none';
  document.getElementById('settings-btn').style.display = 'block';

  await rtc.client
    .unpublish([rtc.localTracks[0], rtc.localTracks[1]])
    .catch((e) => {
      console.log(e.message);
    });

  leaveLocalAttributeKey();
  clearLocalTracks();

  if (rtc.localScreenTracks) {
    await rtc.client.unpublish([rtc.localScreenTracks]);
    await rtc.localScreenTracks.close();
    rtc.sharingScreen = false;
    cameraBtn.style.display = 'block';
    screenBtn.classList.remove('active');
  }

  if (user) user.remove();

  if (userIdInDisplayFrame.val === `user-container-${userData.rtcId}`) {
    displayFrame.style.display = null;
    resetTheFrames();
  }

  rtm.channel.sendMessage({
    text: JSON.stringify({ type: 'user_left', uid: userData.rtcId }),
  });
};

const clearLocalTracks = () => {
  if (rtc.localTracks !== null)
    rtc.localTracks.forEach((track) => {
      track.stop();
      track.close();
    });
};

const devices = async () => {
  try {
    const allDevices = await AgoraRTC.getDevices();
    if (!allDevices)
      return errorMsg(
        `Devices might be use by other app or access denied by the user`
      );

    allDevices.map((item) => {
      if (item.deviceId !== 'default' && item.deviceId !== 'communications')
        localDevice.push(item);
    });

    localDevice.map((item) => {
      if (item.kind === 'videoinput') video_devices.push(item);
      if (item.kind === 'audioinput') audio_devices.push(item);
    });
  } catch (e) {
    console.log(e);
    errorMsg(e.message);
  }
};

export {
  remoteUsers,
  userData,
  rtc,
  rtm,
  device,
  localDevice,
  audio_devices,
  video_devices,
  clearLocalTracks,
  joinRoomInit,
  data_init,
  handleUserLeft,
  handleUserPublished,
  handleStopShareScreen,
  handleChannelMessage,
  toggleCamera,
  toggleMic,
  toggleScreen,
  joinStream,
  leaveStream,
  player,
  devices,
  addJoinedUserLocalAttribute,
  leaveLocalAttributeKey,
};
