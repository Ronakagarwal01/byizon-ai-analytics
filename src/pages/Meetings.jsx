import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Copy, ExternalLink, Loader2, Send, Video } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useData } from '../context/DataContext';
import { askDataChat } from '../api/huggingface';
import { getSavedAutomationActivities, saveAutomationActivity } from '../utils/activityStore';

function localDateTimeDefaults() {
  const date = new Date(Date.now() + 10 * 60 * 1000);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}

export default function Meetings() {
  const { uploadedData } = useData();
  const defaults = localDateTimeDefaults();
  const [title, setTitle] = useState('Byizon scheduled meeting');
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [attendees, setAttendees] = useState('');
  const [channel, setChannel] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [activities, setActivities] = useState(getSavedAutomationActivities());

  useEffect(() => {
    const refresh = () => setActivities(getSavedAutomationActivities());
    window.addEventListener('byizon:activity-saved', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('byizon:activity-saved', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const meetingActivities = useMemo(
    () => activities.filter(item => item.type === 'meeting' || item.action === 'google_meet_create').slice(0, 12),
    [activities],
  );
  const latest = meetingActivities[0];

  const createMeet = async (sendToSlack = false) => {
    setLoading(true);
    setNotice('');
    const attendeeText = attendees.trim() ? ` attendees: ${attendees.trim()}` : '';
    const command = `Google Meet link banao title: ${title} on ${date} ${time}${attendeeText}`;
    try {
      const response = await askDataChat(command, uploadedData, []);
      const task = typeof response === 'object' ? response.task : null;
      if (task) {
        saveAutomationActivity(task, 'meetings');
        let nextNotice = task.message || 'Meeting link generated.';
        if (sendToSlack && channel.trim()) {
          const slackResponse = await askDataChat(`send the latest meeting link to Slack channel ${channel.trim()}`, uploadedData, []);
          const slackTask = typeof slackResponse === 'object' ? slackResponse.task : null;
          if (slackTask) {
            saveAutomationActivity(slackTask, 'meetings');
            nextNotice = `${nextNotice} Slack sharing completed.`;
          } else {
            nextNotice = `${nextNotice} Slack sharing response: ${typeof slackResponse === 'string' ? slackResponse : slackResponse?.answer || 'completed'}`;
          }
        }
        setNotice(nextNotice);
      } else {
        setNotice(typeof response === 'string' ? response : response?.answer || 'Meet request completed.');
      }
    } catch (error) {
      setNotice(error.message || 'Could not create the meeting link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-layout byizon-dark-shell">
      <Sidebar />
      <main className="main-content meetings-page">
        <section className="dark-hero-card meetings-hero">
          <span className="dark-kicker"><Video size={15} /> Meetings command center</span>
          <h1>Create and manage Google Meet links</h1>
          <p>Schedule meetings manually or through the Byizon assistant. Every generated link is saved to your workspace for quick access and sharing.</p>
          {latest?.url && (
            <div className="latest-meet-link">
              <div className="latest-meet-details">
                <span><CheckCircle2 size={16} /> Latest meeting</span>
                <strong title={latest.url}>{latest.url}</strong>
              </div>
              <div className="latest-meet-actions">
                <button type="button" onClick={() => navigator.clipboard.writeText(latest.url)}><Copy size={14} /> Copy</button>
                <a href={latest.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
              </div>
            </div>
          )}
        </section>

        <section className="meetings-grid">
          <form className="dark-panel meeting-form" onSubmit={event => { event.preventDefault(); createMeet(false); }}>
            <div>
              <span className="dark-kicker">Manual generator</span>
              <h2>Create a Meet link</h2>
            </div>
            <label>Title<input value={title} onChange={event => setTitle(event.target.value)} /></label>
            <div className="meeting-form-row">
              <label>Date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
              <label>Time<input type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
            </div>
            <label>Attendee emails <input value={attendees} onChange={event => setAttendees(event.target.value)} placeholder="name@example.com, team@example.com" /></label>
            <label>Slack channel for sharing <input value={channel} onChange={event => setChannel(event.target.value)} placeholder="#all-ronak" /></label>
            <div className="meeting-actions">
              <button className="btn-primary" type="submit" disabled={loading}>{loading ? <Loader2 className="spin" size={15} /> : <Video size={15} />} Generate link</button>
              <button className="btn-outline" type="button" disabled={loading} onClick={() => createMeet(true)}><Send size={15} /> Generate and send</button>
            </div>
            {notice && <div className="dark-notice">{notice}</div>}
          </form>

          <section className="dark-panel meeting-history-panel">
            <span className="dark-kicker"><CalendarClock size={15} /> Generated links</span>
            <h2>Meeting history</h2>
            <div className="meeting-history-list">
              {meetingActivities.length ? meetingActivities.map(item => (
                <article key={item.id}>
                  <div><strong>{item.title}</strong><small>{item.message}</small><time>{new Date(item.createdAt).toLocaleString()}</time></div>
                  {item.url && <button type="button" onClick={() => navigator.clipboard.writeText(item.url)}><Copy size={14} /> Copy</button>}
                </article>
              )) : (
                <div className="empty-dark-state">No meeting has been generated in this workspace yet.</div>
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
