import { Mic2, Radio } from 'lucide-react';
import InlineVoiceAssistant from '../components/InlineVoiceAssistant';
import Sidebar from '../components/Sidebar';
import { useData } from '../context/DataContext';

export default function VoiceAssistantPage() {
  const { uploadedData } = useData();

  return (
    <div className="app-layout voice-ai-layout">
      <Sidebar />
      <main className="main-content voice-ai-page">
        <section className="voice-ai-hero">
          <div>
            <span className="premium-page-eyebrow">
              <Mic2 size={14} /> Voice AI command center
            </span>
            <h1>Byizon se voice me baat karo</h1>
            <p>
              Mic ek baar ON karo, phir baat continuous chalegi. Byizon har jawab text me
              dikhayega aur voice me sunayega. Conversation khatam karni ho to Stop dabao.
            </p>
          </div>
          <div className="voice-ai-hero-card">
            <Radio size={22} />
            <strong>{uploadedData ? 'Data ke saath voice ready' : 'General voice mode'}</strong>
            <span>
              {uploadedData
                ? `${uploadedData.fileName} connected · ${(uploadedData.rowCount || 0).toLocaleString()} rows`
                : 'Data upload/connect karoge to voice answers data ke hisaab se aayenge'}
            </span>
          </div>
        </section>

        <InlineVoiceAssistant
          uploadedData={uploadedData}
          pathname="/voice"
          continuousMode
          preferBrowserRecognition
        />
      </main>
    </div>
  );
}
