import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useChartTheme } from '../utils/chartTheme';

const PIE_COLORS = ['#8f4e2d', '#b86b3d', '#c98554', '#a8795b', '#6f8063'];

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
  const chartTheme = useChartTheme();
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={chartTheme.primary} stopOpacity={0.3} />
            <stop offset="95%" stopColor={chartTheme.primary} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="tgtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={chartTheme.secondary} stopOpacity={0.12} />
            <stop offset="95%" stopColor={chartTheme.secondary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
        <XAxis dataKey="month" tick={chartTheme.tick} axisLine={false} tickLine={false} />
        <YAxis tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString()} />
        <Tooltip content={<CustomTooltip />} />
        {data[0]?.target !== undefined && (
          <Area type="monotone" dataKey="target" name="Target" stroke={chartTheme.secondary} strokeWidth={1.5} strokeDasharray="4 4" fill="url(#tgtGrad)" dot={false} />
        )}
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={chartTheme.primary} strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: chartTheme.primary }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChart({ data }) {
  const chartTheme = useChartTheme();
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
        <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} />
        <YAxis tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString()} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" name="Value" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[0]} opacity={Math.max(0.58, 0.95 - i * 0.04)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RegionPieChart({ data }) {
  const chartTheme = useChartTheme();
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
          contentStyle={chartTheme.tooltip}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export { PIE_COLORS };
