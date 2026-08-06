import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const PIE_COLORS = ['#3b82f6','#60a5fa','#93c5fd','#1d4ed8'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <div className="custom-tooltip-label">{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="custom-tooltip-val" style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function RevenueAreaChart({ data }) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="tgtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString()} />
        <Tooltip content={<CustomTooltip />} />
        {data[0]?.target !== undefined && (
          <Area type="monotone" dataKey="target" name="Target" stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="4 4" fill="url(#tgtGrad)" dot={false} />
        )}
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: '#3b82f6' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChart({ data }) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString()} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" name="Value" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={`rgba(59,130,246,${Math.min(0.9, 0.35 + i * 0.1)})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RegionPieChart({ data }) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => v.toLocaleString()}
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-blue)', borderRadius: 10, fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export { PIE_COLORS };
