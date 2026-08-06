import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, Plus, Video } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { getSavedAutomationActivities, saveAutomationActivity } from '../utils/activityStore';

const EVENT_KEY = 'byizon_calendar_events:v1';

function readEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events) {
  localStorage.setItem(EVENT_KEY, JSON.stringify(events));
}

function monthDays(currentMonth) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [events, setEvents] = useState(readEvents);
  const [title, setTitle] = useState('Follow up task');
  const [date, setDate] = useState(dateKey(new Date()));
  const [time, setTime] = useState('10:00');
  const [reminder, setReminder] = useState('30 minutes before');

  useEffect(() => {
    const sync = () => {
      const saved = getSavedAutomationActivities()
        .filter(item => item.type === 'calendar' || item.type === 'meeting')
        .map(item => ({
          id: item.id,
          title: item.title,
          date: (item.details?.start || item.createdAt || '').slice(0, 10),
          time: item.details?.start ? new Date(item.details.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
          reminder: 'Provider reminder',
          url: item.url,
          source: item.type,
        }))
        .filter(item => item.date);
      setEvents(previous => {
        const merged = [...saved, ...previous.filter(item => !saved.some(savedItem => savedItem.id === item.id))];
        saveEvents(merged);
        return merged;
      });
    };
    sync();
    window.addEventListener('byizon:activity-saved', sync);
    return () => window.removeEventListener('byizon:activity-saved', sync);
  }, []);

  const days = useMemo(() => monthDays(currentMonth), [currentMonth]);
  const eventsByDate = useMemo(() => {
    const grouped = {};
    events.forEach(event => {
      if (!grouped[event.date]) grouped[event.date] = [];
      grouped[event.date].push(event);
    });
    return grouped;
  }, [events]);

  const addEvent = (event) => {
    event.preventDefault();
    const nextEvent = {
      id: `manual_${Date.now()}`,
      title,
      date,
      time,
      reminder,
      source: 'manual',
      createdAt: new Date().toISOString(),
    };
    const next = [nextEvent, ...events];
    setEvents(next);
    saveEvents(next);
    saveAutomationActivity({
      activityId: nextEvent.id,
      title: `Calendar: ${title}`,
      action: 'calendar_local_task',
      message: `Task saved for ${date} ${time}. Reminder: ${reminder}.`,
      details: { start: `${date}T${time}:00+05:30`, reminder },
    }, 'calendar');
  };

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="app-layout byizon-dark-shell">
      <Sidebar />
      <main className="main-content calendar-page">
        <section className="dark-hero-card calendar-hero">
          <span className="dark-kicker"><CalendarDays size={15} /> Calendar workspace</span>
          <h1>Plan tasks, meetings, and reminders</h1>
          <p>Manual tasks and AI-created Google Calendar or Meet actions appear on this calendar, so the workflow stays visible after the command completes.</p>
        </section>

        <section className="calendar-layout">
          <div className="dark-panel calendar-board">
            <div className="calendar-toolbar">
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>Previous</button>
              <h2>{monthLabel}</h2>
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>Next</button>
            </div>
            <div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {days.map(day => {
                const key = dateKey(day);
                const dayEvents = eventsByDate[key] || [];
                const outside = day.getMonth() !== currentMonth.getMonth();
                return (
                  <article key={key} className={outside ? 'outside' : ''}>
                    <strong>{day.getDate()}</strong>
                    {dayEvents.slice(0, 3).map(item => (
                      <span key={item.id} className={item.source === 'meeting' ? 'meet-event' : ''}>
                        {item.source === 'meeting' ? <Video size={11} /> : <CheckCircle2 size={11} />}
                        {item.time ? `${item.time} ` : ''}{item.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && <em>+{dayEvents.length - 3} more</em>}
                  </article>
                );
              })}
            </div>
          </div>

          <form className="dark-panel calendar-task-form" onSubmit={addEvent}>
            <span className="dark-kicker"><Plus size={15} /> Save task</span>
            <h2>Add a calendar task</h2>
            <label>Task title<input value={title} onChange={event => setTitle(event.target.value)} /></label>
            <label>Date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            <label>Time<input type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
            <label>Reminder<select value={reminder} onChange={event => setReminder(event.target.value)}>
              <option>At time of event</option>
              <option>10 minutes before</option>
              <option>30 minutes before</option>
              <option>1 hour before</option>
              <option>1 day before</option>
            </select></label>
            <button className="btn-primary" type="submit"><Bell size={15} /> Save reminder</button>
            <div className="dark-notice">Google Calendar events created by AI will also appear here after completion.</div>
          </form>
        </section>
      </main>
    </div>
  );
}
