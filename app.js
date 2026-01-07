// ==================== Configuration ====================
const CONFIG = {
  PIN: '1234',  // ⚠️ Change this to your desired PIN
  SESSION_KEY: 'robot_control_authenticated'
};

// ==================== Code Templates ====================
const CODE_TEMPLATES = {
  move: `# Move Joint Example
# Target joint positions (degrees)
positions = [0.0, 0.0, 90.0, 0.0, 90.0, 0.0]
velocity = 60.0
acceleration = 60.0

print(f"Moving to: {positions}")
# move_joint(positions, velocity, acceleration)
`,
  gripper: `# Gripper Control Example
# stroke: 0 (open) to 700 (closed)

def control_gripper(stroke):
    print(f"Setting gripper stroke: {stroke}")
    # publish_gripper(stroke)

# Open gripper
control_gripper(0)

# Close gripper  
# control_gripper(700)
`,
  sequence: `# Movement Sequence Example
import time

positions = [
    [0.0, 0.0, 90.0, 0.0, 90.0, 0.0],    # Home
    [30.0, -20.0, 100.0, 0.0, 80.0, 0.0], # Position 1
    [0.0, 0.0, 90.0, 0.0, 90.0, 0.0],    # Back to home
]

for i, pos in enumerate(positions):
    print(f"Moving to position {i + 1}: {pos}")
    # move_joint(pos)
    time.sleep(1)

print("Sequence complete!")
`
};

// ==================== Global Variables ====================
let ros = null;
let connected = false;
let moveJointClient = null;
let gripperPublisher = null;
let scriptPublisher = null;
let scriptResultSubscriber = null;

// ==================== DOM Elements ====================
const lockScreen = document.getElementById('lockScreen');
const pinInputs = document.querySelectorAll('.pin-digit');
const lockError = document.getElementById('lockError');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnConnect = document.getElementById('btnConnect');
const rosbridgeUrl = document.getElementById('rosbridgeUrl');
const navTabs = document.querySelectorAll('.nav-tab');
const pages = document.querySelectorAll('.page');
const gripperSlider = document.getElementById('gripperSlider');
const gripperValue = document.getElementById('gripperValue');
const btnExecute = document.getElementById('btnExecute');
const codeEditor = document.getElementById('codeEditor');
const btnRunScript = document.getElementById('btnRunScript');
const btnClearEditor = document.getElementById('btnClearEditor');
const consoleOutput = document.getElementById('consoleOutput');
const btnClearConsole = document.getElementById('btnClearConsole');
const toast = document.getElementById('toast');

// ==================== Lock Screen ====================
function initLockScreen() {
  // Check session
  if (sessionStorage.getItem(CONFIG.SESSION_KEY) === 'true') {
    lockScreen.classList.add('hidden');
    return;
  }

  // Focus first input
  pinInputs[0].focus();

  // PIN input handling
  pinInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const value = e.target.value;
      if (value.length === 1) {
        if (index < pinInputs.length - 1) {
          pinInputs[index + 1].focus();
        } else {
          checkPIN();
        }
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        pinInputs[index - 1].focus();
      }
    });

    input.addEventListener('focus', () => input.select());
  });
}

function checkPIN() {
  const enteredPIN = Array.from(pinInputs).map(input => input.value).join('');
  
  if (enteredPIN === CONFIG.PIN) {
    sessionStorage.setItem(CONFIG.SESSION_KEY, 'true');
    lockScreen.classList.add('hidden');
    showToast('Access granted', 'success');
  } else {
    lockError.textContent = 'Incorrect PIN. Try again.';
    pinInputs.forEach(input => {
      input.classList.add('error');
      input.value = '';
    });
    pinInputs[0].focus();
    
    setTimeout(() => {
      pinInputs.forEach(input => input.classList.remove('error'));
      lockError.textContent = '';
    }, 1500);
  }
}

// ==================== ROS Connection ====================
function connectROS() {
  const url = rosbridgeUrl.value.trim();
  if (!url) {
    showToast('Please enter rosbridge URL', 'error');
    return;
  }

  statusText.textContent = 'Connecting...';
  btnConnect.textContent = '...';
  btnConnect.disabled = true;

  ros = new ROSLIB.Ros({ url: `ws://${url}` });

  ros.on('connection', () => {
    connected = true;
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
    btnConnect.textContent = 'Disconnect';
    btnConnect.disabled = false;
    showToast('Connected to rosbridge', 'success');
    initializeROSTopics();
  });

  ros.on('error', (error) => {
    console.error('ROS Error:', error);
    showToast('Connection error', 'error');
    disconnectROS();
  });

  ros.on('close', () => {
    if (connected) showToast('Connection closed', 'error');
    disconnectROS();
  });
}

function disconnectROS() {
  if (ros) ros.close();
  connected = false;
  statusDot.classList.remove('connected');
  statusText.textContent = 'Disconnected';
  btnConnect.textContent = 'Connect';
  btnConnect.disabled = false;
}

function initializeROSTopics() {
  // MoveJoint Service Client
  moveJointClient = new ROSLIB.Service({
    ros: ros,
    name: '/dsr01/motion/move_joint',
    serviceType: 'dsr_msgs2/srv/MoveJoint'
  });

  // Gripper Position Publisher
  gripperPublisher = new ROSLIB.Topic({
    ros: ros,
    name: '/dsr01/gripper/position_cmd',
    messageType: 'std_msgs/msg/Int32'
  });

  // Script Publisher
  scriptPublisher = new ROSLIB.Topic({
    ros: ros,
    name: '/execute_script',
    messageType: 'std_msgs/msg/String'
  });

  // Script Result Subscriber
  scriptResultSubscriber = new ROSLIB.Topic({
    ros: ros,
    name: '/script_result',
    messageType: 'std_msgs/msg/String'
  });

  scriptResultSubscriber.subscribe((message) => {
    addConsoleLog(message.data, message.data.startsWith('✅') ? 'success' : 'error');
  });
}

// ==================== Navigation ====================
function initNavigation() {
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const pageName = tab.dataset.page;
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      pages.forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${pageName}`).classList.add('active');
    });
  });
}

// ==================== Manual Control ====================
function initManualControl() {
  // Gripper slider
  gripperSlider.addEventListener('input', () => {
    gripperValue.textContent = gripperSlider.value;
  });

  // Execute button
  btnExecute.addEventListener('click', executeMovement);
}

function executeMovement() {
  if (!connected) {
    showToast('Not connected to robot', 'error');
    return;
  }

  const jointValues = [
    parseFloat(document.getElementById('joint1').value) || 0,
    parseFloat(document.getElementById('joint2').value) || 0,
    parseFloat(document.getElementById('joint3').value) || 0,
    parseFloat(document.getElementById('joint4').value) || 0,
    parseFloat(document.getElementById('joint5').value) || 0,
    parseFloat(document.getElementById('joint6').value) || 0
  ];
  const gripperVal = parseInt(gripperSlider.value);

  const request = new ROSLIB.ServiceRequest({
    pos: jointValues,
    vel: 60.0,
    acc: 60.0
  });

  btnExecute.disabled = true;
  btnExecute.textContent = 'Executing...';

  moveJointClient.callService(request, (result) => {
    // After joint movement, send gripper command
    const gripperMsg = new ROSLIB.Message({ data: gripperVal });
    gripperPublisher.publish(gripperMsg);
    showToast('Command executed', 'success');
    btnExecute.disabled = false;
    btnExecute.textContent = 'Execute Movement';
  }, (error) => {
    console.error('MoveJoint error:', error);
    showToast('Execution failed', 'error');
    btnExecute.disabled = false;
    btnExecute.textContent = 'Execute Movement';
  });
}

// ==================== Script Editor ====================
function initScriptEditor() {
  // Tab key support
  codeEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = codeEditor.selectionStart;
      const end = codeEditor.selectionEnd;
      codeEditor.value = codeEditor.value.substring(0, start) + '    ' + codeEditor.value.substring(end);
      codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
    }
  });

  // Template buttons
  document.querySelectorAll('.btn-template').forEach(btn => {
    btn.addEventListener('click', () => {
      const template = btn.dataset.template;
      if (CODE_TEMPLATES[template]) {
        codeEditor.value = CODE_TEMPLATES[template];
      }
    });
  });

  // Clear editor
  btnClearEditor.addEventListener('click', () => {
    codeEditor.value = '';
  });

  // Clear console
  btnClearConsole.addEventListener('click', () => {
    consoleOutput.innerHTML = '<div class="log-entry info">[System] Console cleared</div>';
  });

  // Run script
  btnRunScript.addEventListener('click', runScript);
}

function runScript() {
  const code = codeEditor.value.trim();
  
  if (!code) {
    showToast('No code to execute', 'error');
    return;
  }

  if (!connected) {
    showToast('Not connected to robot', 'error');
    return;
  }

  btnRunScript.disabled = true;
  btnRunScript.textContent = 'Running...';
  addConsoleLog('Executing script...', 'info');

  const msg = new ROSLIB.Message({ data: code });
  scriptPublisher.publish(msg);

  setTimeout(() => {
    btnRunScript.disabled = false;
    btnRunScript.textContent = '▶ Run Script';
  }, 1000);
}

function addConsoleLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${time}] ${message}`;
  consoleOutput.appendChild(entry);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// ==================== Toast ====================
let toastTimeout;

function showToast(message, type = 'info') {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ==================== Initialize ====================
function init() {
  initLockScreen();
  initNavigation();
  initManualControl();
  initScriptEditor();

  // Connect button
  btnConnect.addEventListener('click', () => {
    connected ? disconnectROS() : connectROS();
  });
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
