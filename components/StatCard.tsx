
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  isActive?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, suffix, icon, color, onClick, isActive }) => {
  return (
    <button 
      onClick={onClick}
      className={`w-full text-left bg-slate-900/60 backdrop-blur-xl p-5 rounded-[1.5rem] border transition-all group shadow-lg flex flex-col ${
        isActive 
          ? 'border-emerald-500/50 ring-1 ring-emerald-500/20 scale-[1.02] bg-slate-800/80' 
          : 'border-white/5 hover:border-white/10 hover:bg-slate-800/40'
      }`}
    >
      <div className="flex items-center justify-between mb-4 w-full">
        <span className={`text-[10px] font-black uppercase tracking-[0.15em] leading-none ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
          {label}
        </span>
        <div className={`p-2 rounded-xl transition-all group-hover:scale-110 ${color}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-black text-white tracking-tighter leading-none">{value}</span>
        {suffix && <span className="text-sm font-bold text-slate-600 italic">{suffix}</span>}
      </div>
      {isActive && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-1 h-1 bg-emerald-500 rounded-full animate-ping"></div>
          <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Filtrando Mapa</span>
        </div>
      )}
    </button>
  );
};

export default StatCard;
