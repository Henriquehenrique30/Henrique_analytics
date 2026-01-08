
import React, { useState, useMemo, useEffect } from 'react';
import { PlayerInfo, RegisteredGame, MatchPerformance } from './types';
import { parseFootballJSON } from './services/jsonParser';
import { generateScoutingReport } from './services/geminiService';
import { supabase } from './lib/supabase';
import PitchHeatmap from './components/PitchHeatmap';
import StatCard from './components/StatCard';

type Page = 'home' | 'player' | 'game' | 'roster' | 'analytics';
type MetricFilter = 'goals' | 'assists' | 'keyPasses' | 'shots' | 'passes' | 'duels' | 'interceptions' | 'tackles' | 'chancesCreated' | null;

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showAIModal, setShowAIModal] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);
  
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [games, setGames] = useState<RegisteredGame[]>([]);
  const [performances, setPerformances] = useState<MatchPerformance[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(null);
  const [rosterGameSelection, setRosterGameSelection] = useState<Record<string, string>>({});
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [newPlayer, setNewPlayer] = useState({ name: '', photoUrl: null, position: 'Meio-Campista' });
  const [newGame, setNewGame] = useState({ homeTeam: '', awayTeam: '', date: '', competition: '' });

  const fetchData = async () => {
    setDataLoading(true);
    if (!supabase || isLocalMode) {
      const storedPlayers = localStorage.getItem('local_players');
      const storedGames = localStorage.getItem('local_games');
      const storedPerf = localStorage.getItem('local_performances');
      if (storedPlayers) setPlayers(JSON.parse(storedPlayers));
      if (storedGames) setGames(JSON.parse(storedGames));
      if (storedPerf) setPerformances(JSON.parse(storedPerf));
      setDataLoading(false);
      return;
    }

    try {
      const { data: pData } = await supabase.from('players').select('*').order('name');
      const { data: gData } = await supabase.from('games').select('*').order('date', { ascending: false });
      const { data: perfData } = await supabase.from('performances').select('*');
      
      if (pData) setPlayers(pData.map((p: any) => ({ ...p, photoUrl: p.photo_url })));
      if (gData) setGames(gData.map((g: any) => ({ id: g.id, homeTeam: g.home_team, awayTeam: g.away_team, date: g.date, competition: g.competition })));
      if (perfData) setPerformances(perfData.map((p: any) => ({ id: p.id, playerId: p.player_id, gameId: p.game_id, analysis: p.analysis })));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [isLocalMode]);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  if (!supabase && !isLocalMode) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-6 text-center">
        <div className="max-w-md p-10 bg-slate-900 rounded-[3rem] border border-red-500/20 shadow-2xl">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-red-500/20">
             <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-3xl font-black text-white uppercase italic mb-4 tracking-tighter">Conexão Pendente</h1>
          <p className="text-slate-400 mb-8 italic leading-relaxed text-sm">As chaves do Supabase não foram detectadas. Você pode configurar as variáveis de ambiente ou continuar usando o banco de dados local do seu navegador.</p>
          <button onClick={() => setIsLocalMode(true)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] transition-all shadow-xl">Continuar Offline</button>
        </div>
      </div>
    );
  }

  const handlePerformanceUpload = async (e: React.ChangeEvent<HTMLInputElement>, playerId: string, gameId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const { events, stats: parsedStats } = parseFootballJSON(json);
        const player = players.find(p => p.id === playerId);
        if (!player) throw new Error("Atleta não encontrado.");
        const aiResult = await generateScoutingReport(player, parsedStats);
        const analysisData = { player, events, stats: { ...parsedStats, rating: aiResult.rating }, aiInsights: aiResult.report };

        if (supabase && !isLocalMode) {
          const { data, error } = await supabase.from('performances').upsert([{ player_id: playerId, game_id: gameId, analysis: analysisData }], { onConflict: 'player_id,game_id' }).select();
          if (error) throw error;
          const result = data as any[];
          setPerformances(prev => [...prev.filter(p => !(p.playerId === playerId && p.gameId === gameId)), { id: result[0].id, playerId: result[0].player_id, gameId: result[0].game_id, analysis: result[0].analysis }]);
        } else {
          const newPerf = { id: Math.random().toString(36).substr(2, 9), playerId, gameId, analysis: analysisData };
          const updated = [...performances.filter(p => !(p.playerId === playerId && p.gameId === gameId)), newPerf];
          setPerformances(updated);
          localStorage.setItem('local_performances', JSON.stringify(updated));
        }
        showNotification("Desempenho sincronizado!");
      } catch (err: any) {
        showNotification(`Erro: ${err.message}`, 'error');
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const savePlayer = async () => {
    if (!newPlayer.name) return;
    setLoading(true);
    try {
      let photoUrl = photoPreview;
      if (supabase && !isLocalMode && selectedPhotoFile) {
        const fileName = `${Date.now()}_${selectedPhotoFile.name.replace(/\s/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('player-photos').upload(fileName, selectedPhotoFile);
        if (!upErr) {
            const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
            photoUrl = data.publicUrl;
        }
      }
      if (supabase && !isLocalMode) {
        const { data, error } = await supabase.from('players').insert([{ name: newPlayer.name, photo_url: photoUrl, position: newPlayer.position }]).select();
        if (error) throw error;
        const result = data as any[];
        setPlayers(prev => [...prev, { ...result[0], photoUrl: result[0].photo_url }]);
      } else {
        const localPlayer = { id: Math.random().toString(36).substr(2, 9), name: newPlayer.name, photoUrl: photoPreview, position: newPlayer.position };
        const updated = [...players, localPlayer];
        setPlayers(updated);
        localStorage.setItem('local_players', JSON.stringify(updated));
      }
      setCurrentPage('roster');
      showNotification("Atleta cadastrado!");
      setNewPlayer({ name: '', photoUrl: null, position: 'Meio-Campista' });
      setPhotoPreview(null);
      setSelectedPhotoFile(null);
    } catch (e: any) { showNotification(`Erro: ${e.message}`, 'error'); }
    setLoading(false);
  };

  const saveGame = async () => {
    if (!newGame.homeTeam || !newGame.awayTeam) return;
    setLoading(true);
    try {
      if (supabase && !isLocalMode) {
        // Fix line 156/158 property access error by explicitly casting data from Supabase to any to safely handle property access
        const { data, error } = await supabase.from('games').insert([{ home_team: newGame.homeTeam, away_team: newGame.awayTeam, date: newGame.date, competition: newGame.competition }]).select();
        if (error) throw error;
        const result = data as any[];
        setGames(prev => [{ id: result[0].id, homeTeam: result[0].home_team, awayTeam: result[0].away_team, date: result[0].date, competition: result[0].competition }, ...prev]);
      } else {
        const localGame = { id: Math.random().toString(36).substr(2, 9), ...newGame };
        const updated = [localGame, ...games];
        setGames(updated);
        localStorage.setItem('local_games', JSON.stringify(updated));
      }
      setCurrentPage('analytics');
      showNotification("Partida registrada!");
      setNewGame({ homeTeam: '', awayTeam: '', date: '', competition: '' });
    } catch (e: any) { showNotification(`Erro: ${e.message}`, 'error'); }
    setLoading(false);
  };

  const selectedPerformance = useMemo(() => 
    performances.find(p => p.gameId === selectedGameId && p.playerId === selectedPlayerId),
    [performances, selectedGameId, selectedPlayerId]
  );

  const filteredEvents = useMemo(() => {
    if (!selectedPerformance) return [];
    if (!metricFilter) return selectedPerformance.analysis.events;
    return selectedPerformance.analysis.events.filter((e: any) => {
      const type = e.type.toLowerCase();
      switch (metricFilter) {
        case 'goals': return type.includes('goal');
        case 'assists': return type.includes('assist');
        case 'passes': return type.includes('pass');
        case 'shots': return type.includes('shot');
        case 'keyPasses': return type.includes('key') || type.includes('decisivo');
        case 'duels': return type.includes('duel');
        case 'interceptions': return type.includes('interception');
        case 'tackles': return type.includes('tackle');
        case 'chancesCreated': return type.includes('chance') || type.includes('criada');
        default: return true;
      }
    });
  }, [selectedPerformance, metricFilter]);

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex overflow-hidden font-inter select-none">
      <aside className={`border-r border-white/5 bg-slate-900/40 w-64 flex flex-col h-screen sticky top-0 transition-all ${isSidebarOpen ? 'ml-0' : '-ml-64'}`}>
        <div className="p-7">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 text-xl">⚽</div>
            <h1 className="text-lg font-black text-white italic tracking-tighter uppercase leading-none">Scout<br/>Pro</h1>
          </div>
          <nav className="space-y-1">
            {[{ id: 'home', label: 'Início' }, { id: 'roster', label: 'Elenco' }, { id: 'analytics', label: 'Análises' }, { id: 'player', label: 'Novo Atleta' }, { id: 'game', label: 'Novo Jogo' }].map(item => (
              <button key={item.id} onClick={() => setCurrentPage(item.id as Page)} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === item.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}>{item.label}</button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex-grow flex flex-col h-screen overflow-y-auto">
        {notification && (
          <div className={`fixed top-8 right-8 z-[110] px-8 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest animate-in slide-in-from-right-8 duration-500 ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
            {notification.msg}
          </div>
        )}
        
        <header className="h-16 border-b border-white/5 flex items-center px-8 bg-slate-900/20 backdrop-blur-md sticky top-0 z-40">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h8m-8 6h16" strokeWidth="2.5"/></svg>
          </button>
          <div className="ml-auto flex items-center gap-4">
             <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{isLocalMode ? 'Offline Mode' : 'Cloud Sync Active'}</span>
             <div className={`w-2 h-2 rounded-full animate-pulse ${isLocalMode ? 'bg-yellow-500' : 'bg-emerald-500'}`}></div>
          </div>
        </header>

        <main className="p-8 pb-20">
          {currentPage === 'home' && (
             <div className="h-[70vh] flex flex-col items-center justify-center">
               <h3 className="text-4xl font-black text-white mb-2 italic uppercase tracking-tighter">Performance Hub</h3>
               <p className="text-slate-500 mb-8 max-w-sm text-center text-sm">Ferramenta avançada para análise de dados táticos e scouts individuais de atletas.</p>
               <button onClick={() => setCurrentPage('roster')} className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-2xl">Acessar Elenco</button>
             </div>
          )}

          {currentPage === 'player' && (
            <div className="max-w-xl mx-auto bg-slate-900/60 p-8 rounded-[2.5rem] border border-white/5">
              <h3 className="text-xl font-black text-white mb-6 uppercase italic">Novo Atleta</h3>
              <div className="space-y-4">
                <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm outline-none" placeholder="Nome Completo" value={newPlayer.name} onChange={e => setNewPlayer({...newPlayer, name: e.target.value})} />
                <select className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm outline-none" value={newPlayer.position} onChange={e => setNewPlayer({...newPlayer, position: e.target.value})}>
                  <option>Goleiro</option><option>Zagueiro</option><option>Lateral</option><option>Meio-Campista</option><option>Extremo</option><option>Atacante</option>
                </select>
                <label className="block w-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-4 text-center rounded-2xl text-[10px] font-black uppercase cursor-pointer text-emerald-400 hover:bg-emerald-500/20 transition-all">
                  Upload de Foto
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if(f) { setSelectedPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); }
                  }} />
                </label>
                <button onClick={savePlayer} disabled={loading || !newPlayer.name} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl uppercase text-[10px] tracking-widest mt-4">{loading ? 'Salvando...' : 'Salvar Atleta'}</button>
              </div>
            </div>
          )}

          {currentPage === 'game' && (
            <div className="max-w-xl mx-auto bg-slate-900/60 p-8 rounded-[2.5rem] border border-white/5">
              <h3 className="text-xl font-black text-white mb-6 uppercase italic">Registrar Confronto</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm" placeholder="Mandante" value={newGame.homeTeam} onChange={e => setNewGame({...newGame, homeTeam: e.target.value})} />
                  <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm" placeholder="Visitante" value={newGame.awayTeam} onChange={e => setNewGame({...newGame, awayTeam: e.target.value})} />
                </div>
                <input type="date" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm" value={newGame.date} onChange={e => setNewGame({...newGame, date: e.target.value})} />
                <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm" placeholder="Torneio" value={newGame.competition} onChange={e => setNewGame({...newGame, competition: e.target.value})} />
                <button onClick={saveGame} disabled={loading || !newGame.homeTeam} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl uppercase text-[10px] tracking-widest mt-4">Criar Jogo</button>
              </div>
            </div>
          )}

          {currentPage === 'roster' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {players.map(p => (
                <div key={p.id} className="bg-slate-900/60 p-5 rounded-[2rem] border border-white/5 hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden border border-white/5">
                      {p.photoUrl ? <img src={p.photoUrl} className="w-full h-full object-cover" alt={p.name} /> : <div className="w-full h-full flex items-center justify-center text-slate-700">👤</div>}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase truncate max-w-[120px]">{p.name}</h4>
                      <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">{p.position}</p>
                    </div>
                  </div>
                  <select onChange={e => setRosterGameSelection({...rosterGameSelection, [p.id]: e.target.value})} className="w-full bg-slate-800/50 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-slate-300 mb-3 outline-none">
                    <option value="">Selecione Jogo...</option>
                    {games.map(g => <option key={g.id} value={g.id}>{g.homeTeam} x {g.awayTeam}</option>)}
                  </select>
                  <label className={`block w-full text-center py-3 rounded-xl text-[8px] font-black uppercase tracking-widest cursor-pointer transition-all border-2 border-dashed ${rosterGameSelection[p.id] ? 'border-emerald-500/30 text-emerald-500' : 'border-slate-800 text-slate-700 opacity-40'}`}>
                    {loading ? 'Processando...' : 'Carregar Scout'}
                    <input type="file" accept=".json" className="hidden" disabled={!rosterGameSelection[p.id] || loading} onChange={e => handlePerformanceUpload(e, p.id, rosterGameSelection[p.id])} />
                  </label>
                </div>
              ))}
            </div>
          )}

          {currentPage === 'analytics' && (
            <div className="space-y-6">
              <div className="bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 flex flex-wrap items-center gap-6 shadow-2xl backdrop-blur-xl">
                <div className="flex-grow grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Partida</label>
                    <select className="w-full bg-slate-800/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none" value={selectedGameId || ''} onChange={e => { setSelectedGameId(e.target.value); setSelectedPlayerId(null); }}>
                      <option value="">Escolha...</option>
                      {games.map(g => <option key={g.id} value={g.id}>{g.homeTeam} x {g.awayTeam}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Jogador</label>
                    <select className="w-full bg-slate-800/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none" disabled={!selectedGameId} value={selectedPlayerId || ''} onChange={e => setSelectedPlayerId(e.target.value)}>
                      <option value="">Escolha...</option>
                      {players.filter(p => performances.some(perf => perf.playerId === p.id && perf.gameId === selectedGameId)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button onClick={() => setShowAIModal(true)} disabled={!selectedPerformance} className="bg-emerald-600 text-white font-black py-3 px-8 rounded-xl text-[9px] uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-20 transition-all">Análise IA</button>
                   <button onClick={() => window.print()} disabled={!selectedPerformance} className="bg-white text-slate-900 font-black py-3 px-8 rounded-xl text-[9px] uppercase tracking-widest hover:bg-slate-100 disabled:opacity-20 transition-all">Relatório PDF</button>
                </div>
              </div>

              {selectedPerformance ? (
                <div className="animate-in fade-in duration-700 space-y-6">
                  {/* Header Compacto */}
                  <div className="bg-slate-900/80 p-6 rounded-[2.5rem] border border-white/5 flex items-center gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-full bg-emerald-500/5 blur-3xl rounded-full"></div>
                    <div className="w-20 h-20 rounded-2xl bg-slate-800 overflow-hidden border border-white/10 shadow-xl flex-shrink-0">
                      {selectedPerformance.analysis.player.photoUrl ? <img src={selectedPerformance.analysis.player.photoUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-slate-700 text-3xl">👤</div>}
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none mb-1">{selectedPerformance.analysis.player.name}</h2>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{selectedPerformance.analysis.player.position}</span>
                        <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Game ID: #{selectedPerformance.gameId.slice(0,6)}</span>
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-3 bg-emerald-500/10 px-6 py-4 rounded-3xl border border-emerald-500/20">
                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Match Rating</span>
                      <span className="text-4xl font-black text-white italic tracking-tighter leading-none">{selectedPerformance.analysis.stats.rating.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Dashboard Content */}
                  <div className="grid grid-cols-12 gap-6">
                    {/* Heatmap Section */}
                    <div className="col-span-12 lg:col-span-7 bg-slate-900/40 p-2 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl flex flex-col">
                      <div className="p-4 flex items-center justify-between border-b border-white/5 mb-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Mapa de Calor & Ações</h4>
                        {metricFilter && (
                           <button onClick={() => setMetricFilter(null)} className="text-[8px] font-black text-red-400 uppercase tracking-widest hover:text-red-300 transition-colors">Remover Filtro ✕</button>
                        )}
                      </div>
                      <div className="flex-grow">
                         <PitchHeatmap events={filteredEvents} intensity={15} />
                      </div>
                    </div>

                    {/* Stats Grid Compacto */}
                    <div className="col-span-12 lg:col-span-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 gap-4">
                      <StatCard label="Gols" value={selectedPerformance.analysis.stats.goals} icon="⚽" color="bg-emerald-500/20 text-emerald-500" isActive={metricFilter === 'goals'} onClick={() => setMetricFilter(metricFilter === 'goals' ? null : 'goals')} />
                      <StatCard label="Assistências" value={selectedPerformance.analysis.stats.assists} icon="🎯" color="bg-blue-500/20 text-blue-500" isActive={metricFilter === 'assists'} onClick={() => setMetricFilter(metricFilter === 'assists' ? null : 'assists')} />
                      <StatCard label="Chances Criadas" value={selectedPerformance.analysis.stats.chancesCreated} icon="⚡" color="bg-orange-500/20 text-orange-500" isActive={metricFilter === 'chancesCreated'} onClick={() => setMetricFilter(metricFilter === 'chancesCreated' ? null : 'chancesCreated')} />
                      <StatCard label="P. Decisivos" value={selectedPerformance.analysis.stats.keyPasses} icon="🔑" color="bg-yellow-500/20 text-yellow-500" isActive={metricFilter === 'keyPasses'} onClick={() => setMetricFilter(metricFilter === 'keyPasses' ? null : 'keyPasses')} />
                      <StatCard label="Finalizações" value={selectedPerformance.analysis.stats.shots} suffix={`No alvo: ${selectedPerformance.analysis.stats.shotsOnTarget}`} icon="🥅" color="bg-rose-500/20 text-rose-500" isActive={metricFilter === 'shots'} onClick={() => setMetricFilter(metricFilter === 'shots' ? null : 'shots')} />
                      <StatCard label="Passes" value={selectedPerformance.analysis.stats.passes} suffix={`${selectedPerformance.analysis.stats.passAccuracy.toFixed(0)}%`} icon="P" color="bg-slate-700/50 text-white" isActive={metricFilter === 'passes'} onClick={() => setMetricFilter(metricFilter === 'passes' ? null : 'passes')} />
                      <StatCard label="Duelos Ganhos" value={selectedPerformance.analysis.stats.duelsWon} suffix={`de ${selectedPerformance.analysis.stats.duels}`} icon="⚔️" color="bg-indigo-500/20 text-indigo-500" isActive={metricFilter === 'duels'} onClick={() => setMetricFilter(metricFilter === 'duels' ? null : 'duels')} />
                      <StatCard label="Desarmes" value={selectedPerformance.analysis.stats.tackles} icon="🚫" color="bg-red-500/20 text-red-500" isActive={metricFilter === 'tackles'} onClick={() => setMetricFilter(metricFilter === 'tackles' ? null : 'tackles')} />
                      <StatCard label="Interceptações" value={selectedPerformance.analysis.stats.interceptions} icon="🛡️" color="bg-purple-500/20 text-purple-500" isActive={metricFilter === 'interceptions'} onClick={() => setMetricFilter(metricFilter === 'interceptions' ? null : 'interceptions')} />
                      {/* Rating Médio no Grid para completar visual */}
                      <div className="bg-slate-900/40 p-5 rounded-[1.5rem] border border-white/5 flex flex-col items-center justify-center text-center opacity-60">
                        <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Impacto Geral</span>
                        <div className="text-xl font-black text-white italic">PRO SCOUT</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-32 text-center bg-slate-900/40 rounded-[3rem] border-2 border-dashed border-slate-800">
                  <p className="text-slate-500 font-medium italic text-sm">Nenhum dado selecionado. Use os filtros acima para iniciar a análise.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showAIModal && selectedPerformance && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
          <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-[3rem] overflow-hidden flex flex-col shadow-2xl max-h-[85vh]">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-800/20">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex flex-col items-center justify-center text-white font-black leading-none">
                  <span className="text-[7px] uppercase mb-0.5">Nota</span>
                  <span className="text-xl italic">{selectedPerformance.analysis.stats.rating.toFixed(1)}</span>
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic leading-none">{selectedPerformance.analysis.player.name}</h3>
                  <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-1">Relatório Técnico Gerado por IA</p>
                </div>
              </div>
              <button onClick={() => setShowAIModal(false)} className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all">✕</button>
            </div>
            <div className="p-10 overflow-y-auto text-slate-300 text-sm leading-relaxed italic whitespace-pre-line custom-scrollbar">
              {selectedPerformance.analysis.aiInsights}
            </div>
            <div className="p-8 border-t border-white/5 bg-slate-800/10 text-center">
               <button onClick={() => setShowAIModal(false)} className="px-12 py-3.5 bg-white text-slate-900 font-black rounded-xl uppercase text-[9px] tracking-widest hover:bg-slate-100 transition-all shadow-xl">Fechar Relatório</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
