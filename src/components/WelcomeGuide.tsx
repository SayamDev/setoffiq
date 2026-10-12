import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  naturalState,
  subscribeNatural,
  disableNatural,
} from '../services/voice/natural';
import { readRaw, writeRaw } from '../services/storage';
import { parseUtterance } from '../services/voice/parser';
import { JourneyMotion } from './JourneyMotion';
import { Button } from './ui';
import styles from './WelcomeGuide.module.css';

const pages = [
  {
    title: 'A little less airport guesswork.',
    body: 'Tell SetoffIQ about the flight and your drive. Get a time to leave, with the reasons behind it.',
  },
  {
    title: 'Say it. See it. Correct it.',
    body: 'You can speak naturally or type. We show what was understood and ask for anything missing.',
  },
  {
    title: 'Keep the conversation going.',
    body: 'Ask why, correct a detail, or start monitoring. You stay in control of every journey.',
  },
];
export function WelcomeGuide(): React.JSX.Element {
  const voice = useSyncExternalStore(subscribeNatural, naturalState);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(() => !readRaw('welcome-seen-v1'));
  const [step, setStep] = useState(0);
  const [demo, setDemo] = useState('Landing tomorrow at 6:30 PM');
  const [demoTime, setDemoTime] = useState('18:30');
  const [demoMessage, setDemoMessage] = useState(
    'Example only. No journey is being calculated.',
  );
  const returnFocus = useRef<HTMLElement | null>(null);
  const launch = () => {
    returnFocus.current = document.activeElement as HTMLElement;
    setStep(0);
    setOpen(true);
    document.dispatchEvent(new Event('setoffiq:guide-open'));
  };
  const close = () => {
    writeRaw('welcome-seen-v1', 'true');
    setOpen(false);
  };
  useEffect(() => {
    const node = dialog.current;
    if (open) node?.showModal();
    else if (node?.open) {
      node.close();
      returnFocus.current?.focus();
    }
  }, [open]);
  const tryExample = (text: string) => {
    setDemo(text);
    const action = parseUtterance(text, Date.now());
    if (
      action.type === 'update' &&
      action.patch.time &&
      !action.ambiguousHour &&
      !action.ambiguousBasis
    ) {
      setDemoTime(action.patch.time);
      setDemoMessage('Understood. The example flight time has changed.');
    } else
      setDemoMessage(
        action.type === 'clarify'
          ? action.message
          : 'Try a flight time with AM or PM, such as “no, 7 PM”.',
      );
  };
  return (
    <>
      <button type="button" className={styles.help} onClick={launch}>
        How to use SetoffIQ
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="welcome-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (open) close();
        }}
      >
        {open ? (
          <>
            <div className={styles.top}>
              <JourneyMotion beat={step} />
              <button type="button" className={styles.skip} onClick={close}>
                Skip guide
              </button>
            </div>
            <div key={step} className={styles.page}>
              <h2 id="welcome-title">{pages[step]!.title}</h2>
              <p className={styles.intro}>{pages[step]!.body}</p>
              {step === 0 ? (
                <div className={styles.example}>
                  <p className={styles.quote}>
                    “I’m picking someone up tomorrow at 6:30 PM, Ryanair from
                    Rabat.”
                  </p>
                  <p>
                    We’ll ask for your starting postcode, then calculate the
                    drive and time to leave.
                  </p>
                  <p className={styles.note}>
                    Manchester Airport only. Estimates are for planning; check
                    your booking and airline guidance.
                  </p>
                </div>
              ) : null}
              {step === 1 ? (
                <form
                  className={styles.example}
                  onSubmit={(event) => {
                    event.preventDefault();
                    tryExample(demo);
                  }}
                >
                  <label htmlFor="guide-example">
                    Try correcting this example
                  </label>
                  <div className={styles.demoResult}>
                    Flight landing time <strong>{demoTime}</strong>
                  </div>
                  <input
                    id="guide-example"
                    value={demo}
                    onChange={(event) => setDemo(event.target.value)}
                    maxLength={500}
                  />
                  <div className={styles.demoActions}>
                    <Button type="submit" variant="secondary">
                      Try correction
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => tryExample('No, 7 PM')}
                    >
                      No, 7 PM
                    </Button>
                  </div>
                  <p role="status" className={styles.note}>
                    {demoMessage}
                  </p>
                </form>
              ) : null}
              {step === 2 ? (
                <div className={styles.examples}>
                  <p>
                    <strong>“Why that time?”</strong>
                    <span>Hear the calculation and its assumptions.</span>
                  </p>
                  <p>
                    <strong>“Start monitoring”</strong>
                    <span>
                      Save the journey and recheck while the app is open.
                    </span>
                  </p>
                  <p>
                    <strong>“Help” or “repeat that”</strong>
                    <span>Get guidance without starting again.</span>
                  </p>
                </div>
              ) : null}
              <p className={styles.note}>
                {step === 2
                  ? 'Tap Listen to interrupt a reply. Stop voice or Escape ends the session. Voice pauses when the tab is hidden or the screen locks.'
                  : 'Microphone access starts only when you tap Listen. Your browser may send audio to its speech service. SetoffIQ does not save audio or transcripts.'}
              </p>
            </div>
            {voice.status === 'loading' ? (
              <div className={styles.voiceNotice}>
                <p>
                  Preparing the natural voice: 115-350 MB + 22 MB runtime from
                  Hugging Face. They see file requests and your IP, not journey
                  text.
                </p>
                <button type="button" onClick={disableNatural}>
                  Cancel download, use device voice
                </button>
              </div>
            ) : null}
            <div className={styles.bottom}>
              <span aria-label={`Guide page ${step + 1} of 3`}>
                {step + 1} / 3
              </span>
              <div>
                {step > 0 ? (
                  <Button variant="quiet" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                ) : null}
                <Button
                  onClick={() => (step < 2 ? setStep(step + 1) : close())}
                >
                  {step < 2 ? 'Continue' : 'Let’s plan'}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </dialog>
    </>
  );
}
