// Answer checks shared by the server (scoring) and the page (FlexAgent answer capture).
// FlexAgent speaks a filler line ("One moment please…") when a tool is slow. An answer that is only filler, or
// very short, probably lost its real text in capture. Loaded as a plain <script> in the page and require()d by Node.
const FILLER_PHRASE =
  /\b(?:(?:one|just a|a) (?:moment|second|sec)|hold on|hang on|bear with me|let me (?:check|look|see|find)|(?:i'm |i am )?(?:checking|looking)(?: (?:that|this|into it|now))?)\b[^.!?…\n]{0,30}(?:[.!?…]+|$)/gi;
function answerLooksIncomplete(answer) {
  return (
    String(answer || '')
      .replace(FILLER_PHRASE, '')
      .trim().length < 40
  );
}
// A correct decline can be short; a filler line alone is still an unfinished answer.
function answerIsOnlyFiller(answer) {
  return (
    String(answer || '')
      .replace(FILLER_PHRASE, '')
      .trim().length === 0
  );
}
if (typeof module === 'object' && module.exports)
  module.exports = { FILLER_PHRASE, answerLooksIncomplete, answerIsOnlyFiller };
