import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Sparkles, Volume2, Waves } from 'lucide-react';
import { getVoiceConfig, runVoiceAgent, synthesizeVoice, transcribeVoice } from '../voice/voiceApi';

function appContext(pathname, uploadedData) {
  if (!uploadedData) return { route: pathname, dataset: null, availableSections: ['dashboard', 'reports', 'chat', 'connections', 'upload'] };
  return {
    route: pathname,
    dataset: {
      fileName: uploadedData.fileName,
      rowCount: uploadedData.rowCount,
      columnCount: uploadedData.colCount ?? uploadedData.columns?.length,
      columns: (uploadedData.columns || []).slice(0, 80),
      keyMetrics: (uploadedData.kpis || uploadedData.dashboardPlan?.overview_cards || []).slice(0, 10),
      insightSummary: (uploadedData.insights || uploadedData.insightObjects || []).slice(0, 8),
    },
    availableSections: ['dashboard', 'reports', 'chat', 'connections', 'upload'],
  };
}

function browserRecognizer(onText, onError, onEnd) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = navigator.language || 'en-IN';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onresult = event => onText(event.results[event.results.length - 1][0].transcript);
  recognition.onerror = event => onError(new Error(event.error === 'not-allowed' ? 'Microphone permission denied.' : `Speech recognition failed: ${event.error}`));
  recognition.onend = onEnd;
  return recognition;
}

function preferredVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find(voice => /^(hi|en-IN)/i.test(voice.lang))
    || voices.find(voice => /zira|veena|priya|jenny|aria|female/i.test(voice.name))
    || voices[0];
}

function instantVoiceAnswer(text) {
  const value = String(text || '').toLowerCase();
  const wantsUpload = /(upload|data set|dataset|file|csv|excel|sheet|data)/i.test(value)
    && /(how|kaise|kese|kidhar|where|open|karu|karoon|connect|attach|chadhau|chadaun|can i|can we)/i.test(value);
  if (wantsUpload) {
    return 'Data upload karne ke liye top bar me Connect data dabao, ya Dashboard par jaakar CSV ya Excel file upload karo. Upload ke baad dashboard, reports, chat aur voice AI us data ke context me kaam karenge.';
  }
  if (/(hello|hi|namaste|hey|kaise ho)/i.test(value)) {
    return 'Namaste, main ready hoon. Aap Hindi, English ya Hinglish me seedha bol sakte ho.';
  }
  if (/(what can you do|kya kar sakte|help|madad|kaam kya)/i.test(value)) {
    return 'Main app navigation, data upload guidance, dashboard help, reports aur connected data ke questions me help kar sakta hoon. Aap seedha boliye.';
  }
  if (/(dashboard|report|analytics|chart|table|kpi)/i.test(value)) {
    return 'Dashboard aur reports ke liye pehle data upload ya connect karo. Uske baad main KPI, chart, trend, anomaly aur summary ke answers de sakta hoon.';
  }
  if (/(meeting|meet|calendar|schedule)/i.test(value)) {
    return 'Meeting ke liye sidebar me Meetings page open karo. Wahan Google Meet link generate aur track kar sakte ho.';
  }
  if (/(connect|integration|crm|google|slack|workspace)/i.test(value)) {
    return 'Connections ke liye Connect data button ya Integrations page use karo. Wahan Google Workspace, Slack aur CRM sources connect ho sakte hain.';
  }
  if (/(stop|band|khatam|close)/i.test(value)) {
    return 'Theek hai. Agar conversation band karni hai to Stop conversation button dabao.';
  }
  return null;
}

export default function InlineVoiceAssistant({ uploadedData, pathname, continuousMode = false, preferBrowserRecognition = false }) {
  const [config, setConfig] = useState({ elevenLabsConfigured: false });
  const [status, setStatus] = useState('idle');
  const [sessionOn, setSessionOn] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('Mic start karo, naturally bolo — main text aur voice dono me jawab dunga.');
  const [turns, setTurns] = useState([]);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const startRecordingRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const timeoutRef = useRef(null);
  const restartRef = useRef(null);
  const sessionOnRef = useRef(false);
  const processingRef = useRef(false);
  const startingRef = useRef(false);

  useEffect(() => {
    getVoiceConfig().then(setConfig).catch(() => {});
    return () => {
      window.clearTimeout(timeoutRef.current);
      window.clearTimeout(restartRef.current);
      sessionOnRef.current = false;
      try {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      } catch {
        // Ignore cleanup race if the browser already stopped the recorder.
      }
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // Ignore cleanup race if speech recognition has already ended.
      }
      streamRef.current?.getTracks?.().forEach(track => track.stop());
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = async (text) => {
    setStatus('speaking');
    const browserSpeak = () => new Promise(resolve => {
      if (!('speechSynthesis' in window)) return resolve();
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = navigator.language || 'en-IN';
      utterance.voice = preferredVoice() || null;
      utterance.rate = continuousMode ? 1.08 : 0.92;
      utterance.pitch = 1.05;
      utterance.volume = 0.9;
      const safetyTimer = window.setTimeout(resolve, Math.min(6500, Math.max(1800, String(text).length * 38)));
      const done = () => {
        window.clearTimeout(safetyTimer);
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    });

    try {
      if (config.elevenLabsConfigured) {
        const blob = await synthesizeVoice(text);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        await new Promise((resolve, reject) => {
          audio.onended = resolve;
          audio.onpause = resolve;
          audio.onerror = reject;
          audio.play().catch(reject);
        });
        URL.revokeObjectURL(url);
      } else {
        await browserSpeak();
      }
    } catch {
      await browserSpeak();
    } finally {
      setStatus(sessionOnRef.current ? 'listening' : 'idle');
      if (continuousMode && sessionOnRef.current) scheduleNextListen(180);
    }
  };

  const scheduleNextListen = (delay = 450) => {
    if (!continuousMode || !sessionOnRef.current) return;
    window.clearTimeout(restartRef.current);
    restartRef.current = window.setTimeout(() => {
      if (sessionOnRef.current && !processingRef.current) startRecording(true);
    }, delay);
  };

  const processText = async (text, keepSession = false) => {
    const clean = String(text || '').trim();
    if (!clean) throw new Error('Kuch clear sunai nahi diya. Please dubara boliye.');
    processingRef.current = true;
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // Speech recognition may already be closed by the browser.
    }
    setTranscript(clean);
    setTurns(previous => [...previous.slice(-5), { id: `user_${Date.now()}`, role: 'user', text: clean }]);
    setStatus('thinking');
    try {
      const instant = continuousMode ? instantVoiceAnswer(clean) : null;
      const localOnly = continuousMode && !uploadedData;
      const result = instant
        ? { response: instant, source: 'instant' }
        : localOnly
          ? {
              response: 'Samjha. Abhi data connected nahi hai, isliye main app guidance instantly de sakta hoon. Data analysis ke liye pehle CSV/Excel upload ya Connect data use karo.',
              source: 'instant',
            }
        : await runVoiceAgent(
            uploadedData?.sessionId || 'inline-voice-session',
            clean,
            { ...appContext(pathname, uploadedData), responseMode: continuousMode ? 'fast_voice' : 'voice' },
            { timeoutMs: continuousMode ? 2200 : 12000 },
          );
      const response = result.response || 'Maine aapki baat suni, lekin response prepare nahi ho paya.';
      setAnswer(response);
      setTurns(previous => [...previous.slice(-5), { id: `ai_${Date.now()}`, role: 'ai', text: response }]);
      await speak(response);
    } catch (err) {
      const fallback = err?.name === 'AbortError'
        ? 'Response thoda slow ho raha hai. Short question boliye ya data connect karke phir try karo.'
        : 'Mujhe response banane me issue aaya. Main mic ON rakhta hoon, aap dubara bol sakte ho.';
      setAnswer(fallback);
      setTurns(previous => [...previous.slice(-5), { id: `ai_${Date.now()}`, role: 'ai', text: fallback }]);
      await speak(fallback);
    } finally {
      processingRef.current = false;
      if (keepSession) scheduleNextListen();
    }
  };

  const stopRecording = () => {
    window.clearTimeout(timeoutRef.current);
    window.clearTimeout(restartRef.current);
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      else {
        recorderRef.current?.stop?.();
        recognitionRef.current?.stop?.();
      }
    } catch {
      // Browser speech APIs can throw when stopped twice.
    }
  };

  const stopInteraction = () => {
    sessionOnRef.current = false;
    setSessionOn(false);
    processingRef.current = false;
    startingRef.current = false;
    stopRecording();
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setStatus('idle');
  };

  const startRecording = async (fromLoop = false) => {
    if (startingRef.current || processingRef.current || (!fromLoop && sessionOnRef.current)) return;
    startingRef.current = true;
    setError('');
    if (!fromLoop) {
      setTranscript('');
      if (continuousMode) {
        sessionOnRef.current = true;
        setSessionOn(true);
      }
    }
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();

    try {
      if (!preferBrowserRecognition && config.elevenLabsConfigured && navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
        recorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          try {
            setStatus('thinking');
            const payload = await transcribeVoice(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
            await processText(payload.transcript, continuousMode);
          } catch {
            setStatus('error');
            setError('Voice server me issue aaya. Browser voice mode use karke dubara try karo.');
          }
        };
        setStatus('listening');
        recorder.start();
        startingRef.current = false;
        timeoutRef.current = window.setTimeout(stopRecording, 12000);
        return;
      }

      const recognition = browserRecognizer(
        text => {
          if (processingRef.current) return;
          processText(text, continuousMode).catch(err => {
            processingRef.current = false;
            if (continuousMode && sessionOnRef.current) {
              setStatus('listening');
              setError('');
            } else {
              setStatus('error');
              setError(err.message || 'Voice request failed.');
            }
            scheduleNextListen(900);
          });
        },
        err => {
          const recoverable = /no-speech|network|aborted|audio-capture/i.test(err.message);
          if (continuousMode && sessionOnRef.current && recoverable) {
            setStatus('listening');
            setError('');
            scheduleNextListen(/network/i.test(err.message) ? 650 : 250);
            return;
          }
          setStatus('error');
          setError(err.message);
          scheduleNextListen(1200);
        },
        () => setStatus(current => {
          if (processingRef.current) return current;
          if (continuousMode && sessionOnRef.current && current === 'listening') {
            scheduleNextListen(300);
            return 'listening';
          }
          return current === 'listening' ? 'idle' : current;
        }),
      );
      if (!recognition) throw new Error('Voice recognition is unavailable in this browser. Chrome/Edge me try karo.');
      recognitionRef.current = recognition;
      recorderRef.current = { stop: () => recognition.stop() };
      setStatus('listening');
      recognition.start();
      startingRef.current = false;
    } catch (err) {
      startingRef.current = false;
      setStatus('error');
      setError(err.message || 'Microphone start nahi ho paya.');
      if (continuousMode) {
        if (/already started|recognition has already/i.test(err.message || '')) {
          setStatus('listening');
          scheduleNextListen(700);
        } else if (sessionOnRef.current) {
          scheduleNextListen(1200);
        } else {
          setSessionOn(false);
        }
      }
    }
  };

  useEffect(() => {
    startRecordingRef.current = startRecording;
  });

  useEffect(() => {
    if (!continuousMode) return undefined;
    const heartbeat = window.setInterval(() => {
      if (!sessionOnRef.current || processingRef.current || startingRef.current) return;
      if (window.speechSynthesis?.speaking) return;
      setStatus(current => current === 'idle' || current === 'error' ? 'listening' : current);
      startRecordingRef.current?.(true);
    }, 900);
    return () => window.clearInterval(heartbeat);
  }, [continuousMode]);

  const active = sessionOn || ['listening', 'thinking', 'speaking'].includes(status);
  const statusLabel = status === 'listening'
    ? 'Sun raha hoon... boliye'
    : status === 'thinking'
      ? 'Soch raha hoon...'
      : status === 'speaking'
        ? 'Jawab bol raha hoon...'
        : status === 'error'
          ? 'Voice ruki hui hai'
          : 'Voice ready hai';

  return (
    <section className={`inline-voice-assistant voice-${status}`} aria-label="Voice assistant">
      <div className="inline-voice-visual">
        <button
          type="button"
          className="inline-voice-orb"
          onClick={active ? stopInteraction : startRecording}
          aria-label={active ? 'Stop voice assistant' : 'Start voice assistant'}
        >
          <i /><i /><i />
          {status === 'thinking' ? <Loader2 className="spin" size={30} /> : active ? <MicOff size={30} /> : <Mic size={30} />}
        </button>
        <div className="inline-voice-bars" aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>
        <span className="inline-voice-action">{sessionOn ? 'Stop conversation' : 'Start conversation'}</span>
      </div>
      <div className="inline-voice-copy">
        <span className="premium-page-eyebrow"><Waves size={14} /> Voice AI</span>
        <h2>Byizon se bolo</h2>
        <p>{continuousMode ? 'Mic ON rakho, Byizon har reply ke baad phir se sunega. Stop dabane par conversation band hogi.' : 'Voice se poochho, jawab text aur voice dono me milega.'}</p>
        <div className="inline-voice-status">
          <Sparkles size={15} />
          <strong>{statusLabel}</strong>
          <span>{continuousMode ? 'Lagatar sunne wala mode' : config.elevenLabsConfigured ? 'ElevenLabs voice enabled' : 'Browser voice fallback enabled'}</span>
        </div>
      </div>
      <div className="inline-voice-output">
        <label>Aapne bola</label>
        <p>{transcript || 'Mic start karke kuch boliye...'}</p>
        <label>Byizon ka jawab</label>
        <p>{answer}</p>
        {turns.length > 0 && (
          <div className="inline-voice-turns">
            {turns.slice(-8).map(turn => (
              <div key={turn.id} className={`inline-voice-turn ${turn.role}`}>
                <strong>{turn.role === 'user' ? 'Aap' : 'Byizon'}</strong>
                <span>{turn.text}</span>
              </div>
            ))}
          </div>
        )}
        {error && <div className="inline-voice-error">{error}</div>}
        {status === 'speaking' && <span className="inline-speaking-pill"><Volume2 size={14} /> Voice chal rahi hai</span>}
      </div>
    </section>
  );
}
