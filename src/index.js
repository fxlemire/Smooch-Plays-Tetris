require('dotenv-safe').load();
const path = require('path');
const cors = require('cors');
const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const { sendKeys } = require('./sendKeys');
const { VALID_CHARACTERS, sendMessage, sendPayload } = require('./smooch');

const app = express();
const server = http.Server(app);
const io = socketio(server);

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.resolve('./pages/index.html')));
app.use('/assets', express.static('./assets'));
app.set('env', process.env.NODE_ENV || 'development');
app.set('port', process.env.PORT || 3000);

const users = [];
let canRestart = false;

let voteKeys = [];
let authorIds = new Set();

function handleKeys(message) {
  authorIds.add(message.authorId);
  const channel = message.source.type;
  const sentKeys = (message.payload || message.text)
    .toLowerCase()
    .split('')
    .map(c => VALID_CHARACTERS[c] && VALID_CHARACTERS[c].key)
    .filter(v => v);

  voteKeys.push(...sentKeys);

  if (sentKeys.length) {
    io.emit('command', {
      user: message.name,
      channel,
      keys: sentKeys,
    });
  }

  // console.log(sentKeys);
}

const DEFAULT_INTERVAL = 50;
let currentInterval = DEFAULT_INTERVAL;

const voteFunc = () => {
  const votes = {
    rotation: {
      left: 0,
      right: 0,
    },
    vertical: {
      left: 0,
      right: 0,
    },
    down: 0,
  };

  const keysToSend = [];

  voteKeys.forEach((key) => {
    switch (key) {
      case 'z':
        votes.rotation.left += 1;
        break;
      case 'x':
        votes.rotation.right += 1;
        break;
      case 'left':
        votes.vertical.left += 1;
        break;
      case 'right':
        votes.vertical.right += 1;
        break;
      case 'down':
        votes.down += 1;
        break;
      default:
        break;
    }
  });

  if (voteKeys.length > 0) {
    console.log('votes', votes);
  }

  if (votes.rotation.left + votes.rotation.right > 0) {
    if (votes.rotation.left > votes.rotation.right) {
      keysToSend.push('z');
    } else {
      keysToSend.push('x');
    }
  }

  if (votes.vertical.left + votes.vertical.right > 0) {
    if (votes.vertical.left > votes.vertical.right) {
      keysToSend.push('left');
    } else {
      keysToSend.push('right');
    }
  }

  if (votes.down > 0) {
    keysToSend.push('down');
  }

  if (keysToSend.length > 0) {
    console.log('sending keys', keysToSend);
  }

  keysToSend.map(sendKeys);

  currentInterval = DEFAULT_INTERVAL * (authorIds.size || 1);
  currentInterval = currentInterval > 1000 ? 1000 : currentInterval;

  voteKeys = [];
  authorIds = new Set();
  setTimeout(voteFunc, currentInterval);
};

setTimeout(voteFunc, currentInterval);

app.post('/messages', async (req, res) => {
  if (!(req.body.messages && req.body.appUser)) {
    return;
  }

  const { appUser, messages } = req.body;
  let channel;

  messages.forEach((message) => {
    if (!users.includes(message.authorId)) {
      users.push(message.authorId);
    }

    channel = message.source.type;

    switch ((message.payload || message.text).toLowerCase()) {
      case 'r':
        if (canRestart) {
          io.emit('restart', {
            user: message.name,
            channel,
          });
          canRestart = false;
        }
        break;
      default:
        handleKeys(message);
        break;
    }
  });

  if (channel === 'viber') {
    sendPayload(appUser._id); // eslint-disable-line no-underscore-dangle
  }

  res.end();
});

io.on('connection', (socket) => {
  socket.on('gg', (score) => {
    canRestart = true;
    users.forEach((appUserId) => {
      sendMessage(appUserId, `Game Over! Score: ${score}`);
      sendMessage(appUserId, 'Send "r" to restart.');
    });
  });
});

server.listen(app.get('port'), (err) => {
  if (err) {
    console.error(err);
    return;
  }

  console.log(`Express server listening at http://localhost:${app.get('port')}`);
  console.log(`env = ${app.get('env')}`);
});
