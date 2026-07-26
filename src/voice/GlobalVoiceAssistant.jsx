import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, Mic, ShieldCheck, Sparkles, Square, Volume2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { executeVoiceTools } from './toolRegistry';
import { getVoiceConfig, runVoiceAgent, synthesizeVoice, transcribeVoice } from './voiceApi';

function appContext(location, uploadedData) {
  if (!uploadedData) return { route: location.pathname, dataset: null, availableSections: [] };
  return {
    route: location.pathname,
    dataset: {
      fileName: uploadedData.fileName,
      rowCount: uploadedData.rowCount,
      columnCount: uploadedData.colCount ?? uploadedData.columns?.length,
      columns: (uploadedData.columns || []).slice(0, 100),
      domain: uploadedData.domain,
      qualityScore: uploadedData.qualityScore,
      insightSummary: (uploadedData.insights || []).slice(0, 8),
      keyMetrics: (uploadedData.kpis || uploadedData.dashboardPlan?.overview_cards || []).slice(0, 12),
      executiveSummary: uploadedData.report?.executiveSummary || uploadedData.executiveSummary || null,
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
  recognition.onerror = event => onError(new Error(event.error === 'not-allowed' ? 'Microphone permission was denied.' : `Speech recognition failed: ${event.error}`));
  recognition.onend = onEnd;
  return recognition;
}

function preferredFemaleVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const femaleNames = /female|zira|samantha|veena|heera|priya|neerja|aria|jenny|susan|hazel|linda/i;
  return voices.find(voice => femaleNames.test(voice.name) && /^(hi|en-IN)/i.test(voice.lang))
    || voices.find(voice => femaleNames.test(voice.name))
    || voices.find(voice => /^(hi|en-IN)/i.test(voice.lang))
    || voices[0];
}

export default function GlobalVoiceAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const { uploadedData } = useData();
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('Voice assistant');
  const [config, setConfig] = useState({ elevenLabsConfigured: false });
  const [shareResult, setShareResult] = useState(null);
  const [copied, setCopied] = useState('');
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const cancelCaptureRef = useRef(false);
  const startRecordingRef = useRef(null);
  const captureCleanupRef = useRef(null);
  const elevenTtsFailedRef = useRef(false);
  const elevenSttFailedRef = useRef(false);

  useEffect(() => { getVoiceConfig().then(setConfig).catch(() => {}); }, []);
  useEffect(() => () => {
    sessionActiveRef.current = false;
    captureCleanupRef.current?.();
    recorderRef.current?.stream?.getTracks().forEach(track => track.stop());
    audioRef.current?.pause();
  }, []);

  const speak = async (text) => {
    setStatus('speaking');
    setMessage(text);
    const speakInBrowser = async () => {
      if (!('speechSynthesis' in window)) return;
      await new Promise(resolve => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = navigator.language || 'en-IN';
        utterance.voice = preferredFemaleVoice() || null;
        utterance.rate = 0.9;
        utterance.pitch = 1.08;
        utterance.volume = 0.88;
        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
      });
    };
    try {
      if (config.elevenLabsConfigured && !elevenTtsFailedRef.current) {
        try {
          const blob = await synthesizeVoice(text);
          const audio = new Audio(URL.createObjectURL(blob));
          audioRef.current = audio;
          await new Promise((resolve, reject) => {
            audio.onended = resolve;
            audio.onpause = resolve;
            audio.onerror = reject;
            audio.play().catch(reject);
          });
        } catch {
          elevenTtsFailedRef.current = true;
          await speakInBrowser();
        }
      } else {
        await speakInBrowser();
      }
    } finally {
      if (sessionActiveRef.current) {
        setMessage('Listening again...');
        window.setTimeout(() => startRecordingRef.current?.(), 350);
      } else {
        setStatus('idle');
        setMessage('Voice assistant');
      }
    }
  };

  const processTranscript = async (transcript) => {
    const clean = String(transcript || '').trim();
    if (!clean) throw new Error('I could not hear a command. Please try again.');
    setStatus('thinking');
    setMessage(clean);
    const result = await runVoiceAgent(uploadedData?.sessionId || 'browser-session', clean, appContext(location, uploadedData));
    if (!sessionActiveRef.current) return;
    const toolResults = await executeVoiceTools(result.toolCalls, navigate, {
      sessionId: uploadedData?.sessionId,
      analysis: uploadedData,
    });
    const createdShare = toolResults.find(item => item.share)?.share;
    const connectedResponse = toolResults.find(item => item.response)?.response;
    if (createdShare) setShareResult(createdShare);
    await speak(connectedResponse?.answer || result.response);
  };

  const handleError = (error) => {
    sessionActiveRef.current = false;
    captureCleanupRef.current?.();
    setStatus('error');
    setMessage(error.message || 'Voice request failed.');
    window.setTimeout(() => { setStatus('idle'); setMessage('Voice assistant'); }, 4000);
  };

  const startRecording = async () => {
    if (!sessionActiveRef.current) return;
    cancelCaptureRef.current = false;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setMessage('Listening...');
    setStatus('listening');
    try {
      if (config.elevenLabsConfigured && !elevenSttFailedRef.current && navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
        recorder.onstop = async () => {
          captureCleanupRef.current?.();
          captureCleanupRef.current = null;
          stream.getTracks().forEach(track => track.stop());
          if (cancelCaptureRef.current || !sessionActiveRef.current) return;
          try {
            setStatus('thinking');
            const payload = await transcribeVoice(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
            await processTranscript(payload.transcript);
          } catch (error) {
            elevenSttFailedRef.current = true;
            if (sessionActiveRef.current) {
              setStatus('listening');
              setMessage('Switching to browser listening...');
              window.setTimeout(() => startRecordingRef.current?.(), 350);
            } else {
              handleError(error);
            }
          }
        };
        recorder.start();
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        const samples = new Uint8Array(analyser.fftSize);
        let heardSpeech = false;
        let lastSpeechAt = 0;
        let captureStartedAt = 0;
        source.connect(analyser);
        const monitor = window.setInterval(() => {
          const now = Date.now();
          if (!captureStartedAt) { captureStartedAt = now; lastSpeechAt = now; }
          analyser.getByteTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
          if (rms > 0.025) { heardSpeech = true; lastSpeechAt = now; }
          const silenceComplete = heardSpeech && now - lastSpeechAt > 1200;
          const maximumReached = now - captureStartedAt > 15000;
          if ((silenceComplete || maximumReached) && recorder.state === 'recording') recorder.stop();
        }, 120);
        captureCleanupRef.current = () => {
          window.clearInterval(monitor);
          source.disconnect();
          audioContext.close().catch(() => {});
        };
        return;
      }
      let receivedResult = false;
      const recognition = browserRecognizer(
        transcript => {
          receivedResult = true;
          if (sessionActiveRef.current) processTranscript(transcript).catch(handleError);
        },
        handleError,
        () => {
          if (!receivedResult && sessionActiveRef.current) window.setTimeout(() => startRecordingRef.current?.(), 300);
        },
      );
      if (!recognition) throw new Error('Voice recognition is unavailable in this browser. Configure ElevenLabs or use Chrome/Edge.');
      recorderRef.current = { stop: () => recognition.stop() };
      recognition.start();
    } catch (error) { handleError(error); }
  };
  useEffect(() => { startRecordingRef.current = startRecording; });

  const activate = () => {
    if (sessionActiveRef.current) {
      sessionActiveRef.current = false;
      cancelCaptureRef.current = true;
      captureCleanupRef.current?.();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      else recorderRef.current?.stop?.();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setStatus('idle');
      setMessage('Voice assistant');
      return;
    }
    sessionActiveRef.current = true;
    startRecording();
  };

  const Icon = status === 'listening' ? Square : status === 'speaking' ? Volume2 : Mic;
  return (
    <>
      <div className={`global-voice ${status}`} aria-live="polite">
        <span className="global-voice-status" role="status">{message}</span>
        <button type="button" onClick={activate} aria-label={status === 'idle' || status === 'error' ? 'Start voice assistant' : 'Stop voice assistant'} title={message}>
          <Icon size={20} />
          <i aria-hidden="true" />
        </button>
      </div>
      {shareResult && (
        <div className="voice-share-backdrop" role="presentation">
          <section className="voice-share-result" role="dialog" aria-modal="true" aria-labelledby="voice-share-title">
            <button className="voice-share-close" onClick={() => setShareResult(null)} aria-label="Close protected link"><X size={18} /></button>
            <div className="voice-share-icon"><ShieldCheck size={22} /></div>
            <h2 id="voice-share-title">Protected live link ready</h2>
            <p>The password is shown only once. Send it separately from the link.</p>
            <label>
              <span>One-time password</span>
              <div><code>{shareResult.password}</code><button onClick={async () => { await navigator.clipboard.writeText(shareResult.password); setCopied('password'); }}><Copy size={15} />{copied === 'password' ? 'Copied' : 'Copy'}</button></div>
            </label>
            <label>
              <span>Live report link</span>
              <div><input value={shareResult.link} readOnly /><button onClick={async () => { await navigator.clipboard.writeText(shareResult.link); setCopied('link'); }}><Link2 size={15} />{copied === 'link' ? 'Copied' : 'Copy'}</button></div>
            </label>
            <div className="voice-share-note"><Check size={14} /> Password protection and 7-day expiry enabled</div>
            <button className="voice-share-studio" onClick={() => { setShareResult(null); navigate('/studio'); }}>
              <Sparkles size={15} /> Customize dashboard with AI
            </button>
          </section>
        </div>
      )}
    </>
  );
}
