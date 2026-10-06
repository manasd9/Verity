// FlexAgent answer capture over a LiveKit room: waits for the greeting, sends the question, and collects every
// agent message until the turn is over. The room and LiveKit's event names are passed in, so tests drive it with a
// fake room. Loaded as a plain <script> in the page (after shared/answer-checks.js) and require()d by tests.
const answerChecks =
  typeof module === 'object' && module.exports
    ? require('../shared/answer-checks.js')
    : { answerLooksIncomplete, answerIsOnlyFiller };
const LIVEKIT_QUIET_MS = 5000; // Quiet time after the agent returns to listening; a slow tool's real answer can follow its filler line.
const LIVEKIT_SHORT_REPLY_QUIET_MS = 20000; // Longer quiet time while everything collected is short or filler-like.
const LIVEKIT_ANSWER_TIMEOUT_MS = 90000;
const LIVEKIT_GREETING_START_MS = 3000; // Send the question anyway if no greeting starts within this time.
const LIVEKIT_GREETING_MAX_MS = 30000;
// FlexAgent greets each new visitor. Waits until that greeting ends (listening after thinking or speaking)
// so it is not taken as the answer; sends anyway if no greeting starts soon.
function waitForLiveKitGreeting(
  room,
  events,
  { startMs = LIVEKIT_GREETING_START_MS, maxMs = LIVEKIT_GREETING_MAX_MS } = {},
) {
  const agentState = () =>
    [...room.remoteParticipants.values()].map(participant => participant.attributes?.['lk.agent.state']).find(Boolean);
  return new Promise(resolve => {
    let greeting = false;
    const done = () => {
      clearTimeout(startTimer);
      clearTimeout(maxTimer);
      room.off(events.ParticipantAttributesChanged, check);
      resolve();
    };
    const check = () => {
      const state = agentState();
      if (state === 'thinking' || state === 'speaking') {
        greeting = true;
        clearTimeout(startTimer);
      } else if (state === 'listening' && greeting) done();
    };
    const startTimer = setTimeout(() => {
      if (!greeting) done();
    }, startMs);
    const maxTimer = setTimeout(done, maxMs);
    room.on(events.ParticipantAttributesChanged, check);
    check();
  });
}

// Sends the question and joins every agent transcription until the turn is over. A slow tool makes FlexAgent
// speak a filler line and return to listening before the real answer, so the turn ends only when the agent is
// listening, no message is still arriving, and it has stayed quiet for the quiet period.
function collectLiveKitAnswer(
  room,
  question,
  events,
  {
    quietMs = LIVEKIT_QUIET_MS,
    shortReplyQuietMs = LIVEKIT_SHORT_REPLY_QUIET_MS,
    timeoutMs = LIVEKIT_ANSWER_TIMEOUT_MS,
    expectShortReply = false,
  } = {},
) {
  const isAgent = identity => Boolean(room.remoteParticipants.get(identity)?.attributes?.['lk.agent.state']);
  return new Promise((resolve, reject) => {
    const texts = [];
    let pending = 0;
    let busy = false;
    let listening = false;
    let settled = false;
    let quietTimer;
    const collected = () => texts.filter(Boolean).join('\n').trim();
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(quietTimer);
      room.off(events.ParticipantAttributesChanged, onAttributes);
      error ? reject(error) : resolve(value);
    };
    const timeout = setTimeout(() => {
      const partial = collected();
      finish(
        new Error(
          partial
            ? `FlexAgent did not finish its answer within ${timeoutMs / 1000} seconds. It only sent: "${partial.slice(0, 120)}"`
            : `FlexAgent did not return a final answer within ${timeoutMs / 1000} seconds.`,
        ),
      );
    }, timeoutMs);
    const armQuiet = () => {
      clearTimeout(quietTimer);
      if (settled || !busy || !listening || pending) return;
      quietTimer = setTimeout(
        () => {
          const answer = collected();
          if (answer) finish(null, answer);
        },
        (expectShortReply ? answerChecks.answerIsOnlyFiller : answerChecks.answerLooksIncomplete)(collected())
          ? shortReplyQuietMs
          : quietMs,
      );
    };
    const onAttributes = (changed, participant) => {
      if (!isAgent(participant?.identity)) return;
      const state = participant.attributes['lk.agent.state'];
      if (state === 'thinking' || state === 'speaking') busy = true;
      listening = state === 'listening';
      armQuiet();
    };
    room.on(events.ParticipantAttributesChanged, onAttributes);
    room.registerTextStreamHandler('lk.transcription', (reader, participantInfo) => {
      if (settled || !isAgent(participantInfo?.identity)) {
        reader.readAll().catch(() => {});
        return;
      }
      const index = texts.push('') - 1;
      pending += 1;
      busy = true;
      clearTimeout(quietTimer);
      reader
        .readAll()
        .then(
          text => {
            texts[index] = String(text || '').trim();
          },
          () => {},
        )
        .finally(() => {
          pending -= 1;
          armQuiet();
        });
    });
    Promise.resolve()
      .then(() => room.localParticipant.sendText(question, { topic: 'lk.chat' }))
      .catch(error => finish(error));
  });
}
if (typeof module === 'object' && module.exports)
  module.exports = {
    LIVEKIT_QUIET_MS,
    LIVEKIT_SHORT_REPLY_QUIET_MS,
    LIVEKIT_ANSWER_TIMEOUT_MS,
    LIVEKIT_GREETING_START_MS,
    LIVEKIT_GREETING_MAX_MS,
    waitForLiveKitGreeting,
    collectLiveKitAnswer,
  };
