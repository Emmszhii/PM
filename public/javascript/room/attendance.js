import {
  postRequest,
  getRequest,
  searchDataInArr,
} from '../helpers/helpers.js';
import { roomLoaderHandler, meetingId } from './room.js';
import { rtc, rtm, userData } from './rtc.js';
import { users } from './rtm.js';
import {
  startingInterval,
  startingMinutes,
  startingSeconds,
  end_time,
} from './face_recognition.js';
import {
  getStudentPresentHandler,
  presentStudent,
  updateStudentIcon,
} from './icon_attendance.js';
import { errorMsg, successMsg, warningMsg } from './msg.js';
import {
  student,
  teacher,
  excelFileHandler,
  createExcelAttendance,
  allStudentsDomHandler,
  clearInfoAndStudentsDom,
  restrictOnExportFile,
  exportAttendanceFromDb,
} from './excel.js';

const classroom = [];
const students = [];

let time = startingMinutes * startingSeconds;
let interval;

const updateCountdown = () => {
  const minutes = Math.floor(time / 60);
  time--;
  let seconds = time % 60;

  const countdown = document.getElementById('take_attendance');
  if (countdown) countdown.innerHTML = `Attendance taking... ${seconds}`;

  if (time <= end_time) stopTimer();
};

const stopTimer = () => {
  clearInterval(interval);

  const btn = document.getElementById('take_attendance');
  if (!btn) return;
  if (btn.classList.contains('on')) {
    btn.classList.remove('on');
  }
  btn.innerHTML = `Attendance <span><i class='fa-solid fa-check'></i></span>`;
  btn.value = 'off';
  time = startingMinutes * startingSeconds;
};

// Teacher host
const attendanceBtn = () => {
  return `
    <button class='button clipboard-user' id='attendance-btn'></button>
  `;
};

const attendanceDom = () => {
  return `
    <section id="attendance__container">
      <div class="svg_spinner" id="attendance_loader"></div>
      <div id='settings_attendance'></div>
      <div id="classroom"></div>
      <div id="classroom_info"></div>
      <div id='legend'>
        <span class='red__icon'></span>
        <p> absent</p>
        <span class='orange__icon'></span>
        <p> late</p>
        <span class='green__icon'></span>
        <p> present</p>
      </div>
      <div id="students"></div>
    </section>
  `;
};

const checkStudentDescriptor = async (data) => {
  const {
    MemberId,
    displayName,
    descriptor: studentDescriptor,
    restrict,
  } = data;

  const studentData = await getStudentDescriptor(MemberId);
  const { descriptor, first_name, last_name, threshold } = studentData;

  const dbFloatArr = descriptor.split(',');
  const dbStudentDescriptor = new Float32Array(dbFloatArr);
  const queryFloatArr = studentDescriptor.split(',');
  const query = new Float32Array(queryFloatArr);
  const attendance = {
    classroom_id: userData.classroom_id,
    attendance_id: userData.attendance_id,
    student_id: MemberId,
  };
  const restrictOffData = {
    _id: MemberId,
    first_name,
    last_name,
    meetingId,
  };
  try {
    const dist = await faceapi.euclideanDistance(dbStudentDescriptor, query);
    if (dist <= threshold) {
      if (restrict === 'on') {
        const { data, err, msg } = await addStudentAttendance(attendance);
        if (err) return errorMsg(err);
        if (data) {
          presentStudent(MemberId);
          successMsg(msg);
        }
      } else {
        createExcelAttendance(restrictOffData);
        successMsg(`Student ${last_name}, ${first_name} is present`);
      }
    } else {
      warningMsg(`User ${displayName} request is invalid`);
    }
  } catch (e) {
    console.log(e);
  }
};

const addStudentAttendance = async (info) => {
  try {
    const url = `/add-student-attendance`;
    const { data, err, msg } = await postRequest(url, info);
    return { data, err, msg };
  } catch (err) {
    console.log(err);
  }
};

const getStudentDescriptor = async (id) => {
  try {
    const url = `/student-descriptor/${id}`;
    const { data, err } = await getRequest(url);
    if (err) return err;
    if (data) return data;
    return;
  } catch (e) {
    console.log(e);
  }
};

// attendance teacher handler
const makeAttendanceHandler = () => {
  document
    .querySelector('.rightBtn')
    .insertAdjacentHTML('afterbegin', attendanceBtn());

  document
    .getElementById('attendance-btn')
    .addEventListener('click', attendanceModal);
};

const restrictToggleHandler = () => {
  document
    .getElementById('settings_attendance')
    .insertAdjacentHTML('beforeend', restrictDom());

  document.getElementById('restrict').addEventListener('click', restrictMode);

  document
    .getElementById('take_attendance')
    .addEventListener('click', takeAttendanceHandler);
};

const restrictMode = async (e) => {
  loaderHandler();
  const btn = e.currentTarget;
  try {
    if (btn.value === 'off') {
      btn.value = 'on';
      btn.classList.toggle('on');
      btn.textContent = 'Restriction On';
      attendanceCheckHandler();
      clearInfoAndStudentsDom();
      restrictOnExportFile();
    } else {
      btn.value = 'off';
      btn.classList.toggle('on');
      btn.textContent = 'Restriction Off';
      restrictOnExportFile();
      attendanceCheckHandler();
      await allStudentsDomHandler();
      excelFileHandler();
    }
  } catch (e) {
    console.log(e);
  } finally {
    loaderHandler();
  }
};

const takeAttendanceHandler = async (e) => {
  const btn = e.currentTarget;

  if (btn.value === 'off') {
    const { err, msg, data } = await createAttendanceHandler();
    if (err) return errorMsg(err);
    if (data) userData.attendance_id = data.attendance_id;
    studentFaceRecognition();
    interval = setInterval(updateCountdown, startingInterval);
    btn.value = 'on';
    btn.classList.toggle('on');
  } else {
    btn.value = 'off';
    btn.classList.toggle('on');
    stopTimer();
  }
};

const studentFaceRecognition = () => {
  const restrictVal = document.getElementById('restrict').value;

  rtm.channel.sendMessage({
    text: JSON.stringify({
      type: 'attendance_on',
      id: userData._id,
      students: students[0],
      restrictVal,
    }),
  });
};

const createAttendanceHandler = async () => {
  const restrict = document.getElementById('restrict').value;
  const id = document.getElementById('classroom_list').value;
  const url = `/create-attendance/${restrict}`;
  try {
    if (restrict === 'on') {
      userData.classroom_id = id;
      const postData = { meetingId, id };
      const { data, msg, err } = await postRequest(url, postData);
      console.log(data, msg, err);
      return { err, msg, data };
    } else {
      const postData = { meetingId };
      const { data, msg, err } = await postRequest(url, postData);
      return { err, msg, data };
    }
  } catch (e) {
    console.log(e);
  }
};

const restrictionChecker = () => {
  const id = document.getElementById('classroom_list').value;
  const restrictVal = document.getElementById('restrict').value;

  const arrId = classroom[0].map((item) => item._id);

  if (!arrId.includes(id) && restrictVal === 'on') return true;
  return false;
};

const attendanceCheckHandler = () => {
  const val = restrictionChecker();
  if (val) {
    document.getElementById('take_attendance').disabled = true;
  } else {
    document.getElementById('take_attendance').disabled = false;
  }
};

const restrictDom = () => {
  return `
    <div class='form-group'>
      <button class='button-box off' id='restrict' value='off'>Restriction Off</button>
    </div>
    <div class='form-group'>
      <button class='button-box off' id='take_attendance' value='off'>Create new attendance</button>
    </div>
  `;
};

const toggleOtherThanAttendance = () => {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsContainer = document.getElementById('settings-modal');
  const membersContainer = document.getElementById('members__container');
  const membersBtn = document.getElementById(`users-btn`);
  const messagesContainer = document.getElementById('messages__container');
  const messagesBtn = document.getElementById('chat-btn');

  if (membersContainer.style.display === 'block') {
    membersContainer.style.display = 'none';
    membersBtn.classList.remove('active');
  }
  if (messagesContainer.style.display === 'block') {
    messagesContainer.style.display = 'none';
    messagesBtn.classList.remove('active');
  }
  if (settingsContainer) {
    settingsContainer.remove();
    settingsBtn.classList.remove('active');
  }
};

const removeClassModal = () => {
  const attendanceBtn = document.getElementById('attendance-btn');
  const attendanceContainer = document.getElementById('attendance__container');
  attendanceBtn.classList.remove('active');
  if (attendanceContainer) attendanceContainer.remove();
  classroom.length = 0;
  students.length = 0;
};

const attendanceModal = async () => {
  roomLoaderHandler();
  const btn = document.getElementById('attendance-btn');

  if (btn.classList.contains('active')) {
    removeClassModal();
    roomLoaderHandler();
  } else {
    toggleOtherThanAttendance();
    btn.classList.add('active');
    document.body.insertAdjacentHTML('beforeend', attendanceDom());
    loaderHandler();
    restrictToggleHandler();

    try {
      await allStudentsDomHandler();
      excelFileHandler();
      const { data, msg, err } = await get_classroom();
      if (data) {
        classroom.push(data);
        dropDownList(data);
      }
      if (msg) dropDownList({ msg: msg });
      if (err) console.log(err);
    } catch (e) {
      if (e.name === 'TypeError') return;
      console.log(e);
      console.log(e.name);
    } finally {
      roomLoaderHandler();
    }
  }
};

const dropDownList = (data) => {
  const classroomDom = document.getElementById('classroom');
  const classroomList = document.getElementById('classroom_list');

  const select = document.createElement('select');
  select.name = 'classroom';
  select.id = 'classroom_list';

  const title = document.createElement('option');
  const label = document.createElement('label');
  if (!data.msg) {
    title.text = 'Select a classroom list';
    title.selected = true;
    title.disabled = true;
    title.hidden = true;
    title.value = 'none';
    select.appendChild(title);

    for (const [index, values] of data.entries()) {
      const option = document.createElement('option');
      option.value = values._id;
      option.text = values._id;

      select.appendChild(option);
    }
    label.innerHTML = 'List of classroom available';
    label.htmlFor = 'classroom';
  } else {
    title.text = data.msg;
    title.selected = true;
    title.disabled = true;
    title.hidden = true;
    title.value = 'none';
    select.appendChild(title);
    label.innerHTML = 'List of classroom is unavailable';
    label.htmlFor = 'classroom';
  }

  if (!classroomList) {
    classroomDom.appendChild(label);
    classroomDom.appendChild(select);
  }
  select.addEventListener('change', listDropdown);
};

const loaderHandler = () => {
  const loaderDom = document.getElementById('attendance_loader');
  if (loaderDom) loaderDom.classList.toggle('svg_spinner');
};

const listDropdown = async (e) => {
  loaderHandler();
  attendanceCheckHandler();
  restrictOnExportFile();
  exportAttendanceFromDb();
  try {
    const restrictBtn = document.getElementById('restrict');
    if (!restrictBtn.classList.contains('on')) {
      restrictBtn.classList.toggle('on');
      restrictBtn.value = 'on';
      restrictBtn.textContent = 'Restriction On';
    }

    const id = e.currentTarget.value;
    const val = searchDataInArr(classroom[0], id);
    const dom = document.getElementById('classroom_info');

    dom.innerHTML = ``;

    if (dom)
      document
        .getElementById('classroom_info')
        .insertAdjacentHTML('beforeend', infoDom(val));

    await getStudents(id);
  } catch (e) {
    console.log(e);
  } finally {
    loaderHandler();
  }
};

const infoDom = (val) => {
  return `
    <h3 id='subject'>Subject : ${val.subject} </h3>
    <h3 id='year_level'>Year Level : ${val.year_level}</h3>
    <h3 id='section'>Section : ${val.section}</h3>
    <h3 id='students_total'>Student(s) Total : ${val.students.length}</h3>
  `;
};

const getStudents = async (id) => {
  const studentsDom = document.getElementById('students');
  studentsDom.innerHTML = ``;
  const url = `/get_students/${id}`;
  try {
    const { data, msg, err } = await getRequest(url);
    if (data) {
      students.push(data);
      if (students.length > 1) students.shift();
      studentsToDom(data);

      await getStudentPresentHandler();
    }
    if (msg) {
      studentsDom.insertAdjacentHTML('beforeend', noStudentsDom());
    }
    if (err) console.log(err);
  } catch (e) {
    console.log(e);
  }
};

const studentsToDom = (info) => {
  const dom = document.getElementById('students');
  const data = info;
  for (const [index, value] of data.entries()) {
    dom.insertAdjacentHTML('beforeend', studentsDom(value));
    document
      .getElementById(`icon_user_${value._id}`)
      .addEventListener('click', updateStudentIcon);
  }
};

const noStudentsDom = () => {
  return `
    <h3 id="no_students">No student registered</h3>
  `;
};

const studentsDom = (val) => {
  return `
    <div class='member__wrapper' id='${val._id}'>
      <span class='clickable red__icon' data-id="${val._id}" id="icon_user_${val._id}">
      </span>
      <p>${val.last_name}, ${val.first_name}</p>
    </div>
  `;
};

const get_classroom = async () => {
  try {
    const url = `/get_classroom`;
    const data = await getRequest(url);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.log(e);
  }
};

export {
  makeAttendanceHandler,
  checkStudentDescriptor,
  loaderHandler,
  studentsDom,
  removeClassModal,
};
