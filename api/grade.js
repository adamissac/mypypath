/* PyPath — a second opinion on work a deterministic check cannot judge.
 *
 * The only server this project has, and the reason it exists is narrow: an
 * Anthropic API key bills money to whoever holds it, and a key in client-side
 * JavaScript is a key published on the internet. Everything else in this app
 * still runs in the browser under the learner's own credentials.
 *
 * What this function deliberately cannot do:
 *
 * It has no Firebase service account and no admin credentials, so it cannot
 * write to Firestore at all. Every verdict it returns is written by the client
 * under the client's own credentials, through the same rules that are still
 * the only thing enforcing anything. If this function is compromised, what is
 * lost is the API key and a stream of plausible-looking grades, not the
 * student data.
 *
 * It never returns the rubric, the model's reasoning, or the hidden test
 * cases, which is the same withholding checker.js already practises: the point
 * of a hidden case is that it cannot be special-cased, and handing it back
 * gives away exactly what was being withheld.
 *
 * It fails toward "needs manual review", never toward a silent pass and never
 * toward a fail. A network hiccup must not be recorded as a student getting
 * something wrong.
 */
import Anthropic from '@anthropic-ai/sdk';
import { verifyIdToken } from './_verify-token.js';

/* The account holder's decision, not this file's. Opus 5 is the default
   because downgrading a model to save money is a cost decision that belongs to
   whoever pays the bill. claude-haiku-4-5 is roughly a fifth of the price and
   is a defensible choice for grading a beginner's paragraph about variables;
   see the design doc for the worked figures. */
const GRADING_MODEL = process.env.GRADING_MODEL || 'claude-opus-5';

/* A coarse ceiling per warm instance. Serverless instances come and go, so
   this bounds abuse rather than counting exactly; the per-learner cap that
   actually holds is the rules-enforced counter on their own document. Say what
   this is rather than implying it is airtight. */
const PER_UID_PER_INSTANCE = 40;
const seen = new Map();

/* Small on purpose. A rubric, a prompt, a paragraph, and a four-field verdict.
   Anything longer than this is a bug in the caller, not a thorough answer. */
const MAX_SUBMISSION_CHARS = 4000;
const MAX_TOKENS = 400;

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'partial', 'fail', 'review'] },
    confidence: { type: 'string', enum: ['high', 'low'] },
    flag: {
      type: 'string',
      enum: ['none', 'off-topic', 'incoherent', 'placeholder', 'output-without-method'],
    },
    feedback: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'flag', 'feedback'],
  additionalProperties: false,
};

/* Identical across every call of a given kind, so it caches. Anything that
   varies per request goes in the user turn, below the cache breakpoint. */
const SYSTEM = `You are helping mark work in an introductory Python course for school students.

You are a second opinion, not the grader of record. A deterministic check has already run and its result is authoritative where it exists.

Judge only whether the student engaged with the question that was asked. Do not judge writing quality, spelling, grammar, or length. A short answer that addresses the question is a pass.

Set flag to:
- "off-topic" when the answer is coherent but about something else
- "incoherent" when it does not form a statement about anything
- "placeholder" when it is filler, such as "idk", "n/a", or the question repeated
- "output-without-method" only for code, when the tests pass but the approach does not solve the stated problem, for example hardcoded branches matching the expected outputs
- "none" otherwise, including for an answer that is wrong but genuine

Write feedback as one or two sentences addressed to the student, saying what to try next. Never describe the student. Never mention this rubric, your reasoning, or any test case.`;

function reviewing(reason) {
  return {
    verdict: 'review',
    confidence: 'low',
    flag: 'none',
    feedback: 'Your answer is saved. Your teacher will take a look at this one.',
    reason,
  };
}

function userTurn(body) {
  const kind = body.kind === 'code' ? 'code' : 'text';
  const submission = String(body.submission || '').slice(0, MAX_SUBMISSION_CHARS);

  const lines = [
    'Question asked of the student:',
    String(body.prompt || '').slice(0, 2000),
    '',
    kind === 'code' ? 'The student submitted this code:' : 'The student wrote:',
    submission,
  ];

  if (kind === 'code' && body.deterministic) {
    // The result, never the cases that produced it.
    const d = body.deterministic;
    lines.push('', 'The automated tests already run on this code passed '
      + Number(d.passed || 0) + ' of ' + Number(d.total || 0) + ' cases.');
  }

  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json(reviewing('method'));
    return;
  }

  let uid;
  try {
    uid = await verifyIdToken(req.headers.authorization);
  } catch (e) {
    // The one case that is not a review: an unauthenticated caller gets
    // nothing, because answering them at all is what makes this an open proxy.
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const used = (seen.get(uid) || 0) + 1;
  seen.set(uid, used);
  if (used > PER_UID_PER_INSTANCE) {
    res.status(200).json(reviewing('rate-limited'));
    return;
  }

  // Set in the Vercel project, never committed. Until it is, every answer is
  // a review, which is the correct degraded state rather than an outage.
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json(reviewing('unconfigured'));
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!String(body.submission || '').trim()) {
    res.status(200).json(reviewing('empty'));
    return;
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: GRADING_MODEL,
      max_tokens: MAX_TOKENS,
      // Low effort on purpose. This is a short judgement about one paragraph,
      // and the depth that helps a hard problem is spend with nothing to show
      // for it here.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: VERDICT_SCHEMA },
      },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userTurn(body) }],
    });

    // A refusal is not a fail. It is this function declining to answer, which
    // is exactly what review means.
    if (response.stop_reason === 'refusal') {
      res.status(200).json(reviewing('refusal'));
      return;
    }

    const text = (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let verdict;
    try {
      verdict = JSON.parse(text);
    } catch (e) {
      res.status(200).json(reviewing('unparseable'));
      return;
    }

    // The schema constrains the model, not a future edit to this file. A
    // verdict missing a field would render as undefined in the learner's face.
    const shaped = {
      verdict: VERDICT_SCHEMA.properties.verdict.enum.includes(verdict.verdict)
        ? verdict.verdict : 'review',
      confidence: verdict.confidence === 'high' ? 'high' : 'low',
      flag: VERDICT_SCHEMA.properties.flag.enum.includes(verdict.flag)
        ? verdict.flag : 'none',
      feedback: String(verdict.feedback || '').slice(0, 400),
    };

    // Volume and cost, never who needed the most help. A per-student record of
    // that has no upside and an obvious downside.
    res.status(200).json(Object.assign(shaped, {
      usage: {
        input: response.usage ? response.usage.input_tokens : 0,
        output: response.usage ? response.usage.output_tokens : 0,
        cached: response.usage ? (response.usage.cache_read_input_tokens || 0) : 0,
      },
    }));
  } catch (e) {
    // Every API failure lands here: timeout, 429, 5xx, bad key. All of them
    // are a review, and none of them is the student's fault.
    res.status(200).json(reviewing('api-error'));
  }
}

export { GRADING_MODEL, VERDICT_SCHEMA, PER_UID_PER_INSTANCE };
