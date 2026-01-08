
import React, { useState, useMemo, useEffect } from 'react';
import { PlayerInfo, RegisteredGame, MatchPerformance } from './types';
import { parseFootballJSON } from './services/jsonParser';
import { generateScoutingReport } from './services/geminiService';
import { supabase } from './lib/supabase';
import PitchHeatmap from './components/PitchHeatmap';
import StatCard from './components/StatCard';

type Page = 'home' | 'player' | 'game' | 'roster' | 'analytics';
type MetricFilter = 'goals' | 'assists' | 'keyPasses' | 'shots' | 'passes' | 'duels' | 'interceptions' | 'tackles' | null;

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showAIModal, setShowAIModal] = useState(false);
  
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
    try {
      const { data: pData, error: pError } = await supabase.from('players').select('*').order('name');
      if (pError) throw pError;
      
      const { data: gData, error: gError } = await supabase.from('games').select('*').order('date', { ascending: false });
      if (gError) throw gError;
      
      const { data: perfData, error: perfError } = await supabase.from('performances').select('*');
      if (perfError) throw perfError;
      
      if (pData) setPlayers(pData.map((p: any) => ({ ...p, photoUrl: p.photo_url })));
      if (gData) setGames(gData.map((g: any) => ({ 
        id: g.id, homeTeam: g.home_team, awayTeam: g.away_team, date: g.date, competition: g.competition 
      })));
      if (perfData) setPerformances(perfData.map((p: any) => ({
        id: p.id, playerId: p.player_id, gameId: p.game_id, analysis: p.analysis
      })));
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      showNotification(`Falha de conexão: ${error.message}`, 'error');
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

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
        if (!player) throw new Error("Atleta não encontrado no banco de dados.");

        const aiResult = await generateScoutingReport(player, parsedStats);
        
        const analysisData = {
          player,
          events,
          stats: { ...parsedStats, rating: aiResult.rating },
          aiInsights: aiResult.report
        };

        const { data, error } = await supabase.from('performances').upsert([{
          player_id: playerId,
          game_id: gameId,
          analysis: analysisData
        }], { onConflict: 'player_id,game_id' }).select();

        if (error) throw error;

        setPerformances(prev => [
          ...prev.filter(p => !(p.playerId === playerId && p.gameId === gameId)), 
          { id: data[0].id, playerId: data[0].player_id, gameId: data[0].game_id, analysis: data[0].analysis }
        ]);
        showNotification("Desempenho sincronizado com sucesso!");
      } catch (err: any) {
        console.error(err);
        showNotification(`Erro no processamento: ${err.message}`, 'error');
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
      let photoUrl = null;
      if (selectedPhotoFile) {
        const fileName = `${Date.now()}_${selectedPhotoFile.name.replace(/\s/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('player-photos').upload(fileName, selectedPhotoFile);
        if (upErr) {
            console.error("Erro upload storage:", upErr);
        } else {
            const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
            photoUrl = data.publicUrl;
        }
      }
      
      const { data, error } = await supabase.from('players').insert([{
        name: newPlayer.name,
        photo_url: photoUrl,
        position: newPlayer.position
      }]).select();
      
      if (error) throw error;
      
      if (data) {
        setPlayers(prev => [...prev, { ...data[0], photoUrl: data[0].photo_url }]);
        setCurrentPage('roster');
        showNotification("Atleta cadastrado com sucesso!");
        setNewPlayer({ name: '', photoUrl: null, position: 'Meio-Campista' });
        setPhotoPreview(null);
        setSelectedPhotoFile(null);
      }
    } catch (e: any) { 
      console.error("Erro savePlayer:", e);
      showNotification(`Erro ao cadastrar atleta: ${e.message}`, 'error'); 
    }
    setLoading(false);
  };

  const saveGame = async () => {
    if (!newGame.homeTeam || !newGame.awayTeam) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('games').insert([{
        home_team: newGame.homeTeam,
        away_team: newGame.awayTeam,
        date: newGame.date,
        competition: newGame.competition
      }]).select();
      
      if (error) throw error;
      
      if (data) {
        setGames(prev => [{ id: data[0].id, homeTeam: data[0].home_team, awayTeam: data[0].away_team, date: data[0].date, competition: data[0].competition }, ...prev]);
        setCurrentPage('analytics');
        showNotification("Partida registrada com sucesso!");
        setNewGame({ homeTeam: '', awayTeam: '', date: '', competition: '' });
      }
    } catch (e: any) { 
      console.error("Erro saveGame:", e);
      showNotification(`Erro ao registrar partida: ${e.message}`, 'error'); 
    }
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
        default: return true;
      }
    });
  }, [selectedPerformance, metricFilter]);

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex overflow-hidden font-inter">
      {/* Sidebar */}
      <aside className={`border-r border-white/5 bg-slate-900/40 w-64 flex flex-col h-screen sticky top-0 transition-all ${isSidebarOpen ? 'ml-0' : '-ml-64'}`}>
        <div className="p-7">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 text-xl">⚽</div>
            <h1 className="text-lg font-black text-white italic tracking-tighter uppercase leading-none">Scout<br/>Pro</h1>
          </div>
          <nav className="space-y-1">
            {[
              { id: 'home', label: 'Início' },
              { id: 'roster', label: 'Elenco' },
              { id: 'analytics', label: 'Análises' },
              { id: 'player', label: 'Novo Atleta' },
              { id: 'game', label: 'Novo Jogo' }
            ].map(item => (
              <button 
                key={item.id} 
                onClick={() => setCurrentPage(item.id as Page)} 
                className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === item.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex-grow flex flex-col h-screen overflow-y-auto">
        {notification && (
          <div className={`fixed top-8 right-8 z-[110] px-8 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest animate-in slide-in-from-right-8 duration-500 ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
            {notification.type === 'error' ? '✖ ' : '✓ '} {notification.msg}
          </div>
        )}
        
        <header className="h-16 border-b border-white/5 flex items-center px-10 bg-slate-900/20 backdrop-blur-md sticky top-0 z-40">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h8m-8 6h16" strokeWidth="2.5"/></svg>
          </button>
          <div className="ml-auto flex items-center gap-4">
             <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Status do Banco de Dados</span>
             <div className={`w-2 h-2 rounded-full animate-pulse ${dataLoading ? 'bg-yellow-500' : 'bg-emerald-500'}`}></div>
          </div>
        </header>

        <main className="p-10 pb-20">
          {currentPage === 'home' && (
             <div className="h-[70vh] flex items-center justify-center">
               <div className="text-center p-12 bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-[3rem] max-w-xl">
                 <h3 className="text-2xl font-black text-white mb-3">SISTEMA DE ANÁLISE PROFISSIONAL</h3>
                 <p className="text-slate-500 mb-8 italic">Gerencie atletas e gere heatmaps a partir de scouts JSON.</p>
                 <button onClick={() => setCurrentPage('roster')} className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all">Começar Análise</button>
               </div>
             </div>
          )}

          {currentPage === 'player' && (
            <div className="max-w-xl mx-auto bg-slate-900/60 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
              <h3 className="text-2xl font-black text-white mb-6 uppercase italic">Cadastro de Atleta</h3>
              <div className="space-y-4">
                <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" placeholder="Nome do Jogador" value={newPlayer.name} onChange={e => setNewPlayer({...newPlayer, name: e.target.value})} />
                <select className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" value={newPlayer.position} onChange={e => setNewPlayer({...newPlayer, position: e.target.value})}>
                  <option>Goleiro</option><option>Zagueiro</option><option>Lateral</option><option>Meio-Campista</option><option>Extremo</option><option>Atacante</option>
                </select>
                <div className="flex items-center gap-4 p-4 bg-slate-800/20 rounded-2xl border border-white/5">
                  <div className="w-16 h-16 rounded-xl bg-slate-800 overflow-hidden border border-white/5 flex-shrink-0">
                    {photoPreview ? <img src={photoPreview} className="w-full h-full object-cover" alt="Preview" /> : <div className="w-full h-full flex items-center justify-center text-slate-700 font-black text-[8px] uppercase text-center p-2">Sem Foto</div>}
                  </div>
                  <label className="flex-grow bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-center rounded-xl text-[10px] font-black uppercase cursor-pointer text-emerald-400 hover:bg-emerald-500/20 transition-all">
                    Upload Foto (PNG/JPG)
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if(f) { setSelectedPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); }
                    }} />
                  </label>
                </div>
                <button onClick={savePlayer} disabled={loading || !newPlayer.name} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl uppercase text-xs tracking-widest mt-4 shadow-xl transition-all">
                  {loading ? 'Sincronizando Banco...' : 'Finalizar Cadastro'}
                </button>
              </div>
            </div>
          )}

          {currentPage === 'game' && (
            <div className="max-w-xl mx-auto bg-slate-900/60 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
              <h3 className="text-2xl font-black text-white mb-6 uppercase italic">Registrar Confronto</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white" placeholder="Time Mandante" value={newGame.homeTeam} onChange={e => setNewGame({...newGame, homeTeam: e.target.value})} />
                  <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white" placeholder="Time Visitante" value={newGame.awayTeam} onChange={e => setNewGame({...newGame, awayTeam: e.target.value})} />
                </div>
                <input type="date" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white" value={newGame.date} onChange={e => setNewGame({...newGame, date: e.target.value})} />
                <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white" placeholder="Campeonato / Torneio" value={newGame.competition} onChange={e => setNewGame({...newGame, competition: e.target.value})} />
                <button onClick={saveGame} disabled={loading || !newGame.homeTeam} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl uppercase text-xs tracking-widest mt-4 shadow-xl transition-all">
                  {loading ? 'Salvando...' : 'Criar Partida'}
                </button>
              </div>
            </div>
          )}

          {currentPage === 'roster' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {players.length === 0 && !dataLoading && <div className="col-span-full py-20 text-center text-slate-500 italic">Nenhum atleta encontrado no banco de dados.</div>}
              {players.map(p => (
                <div key={p.id} className="bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 backdrop-blur-xl flex flex-col relative group hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center gap-5 mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 overflow-hidden border border-white/5 flex-shrink-0">
                      {p.photoUrl ? <img src={p.photoUrl} className="w-full h-full object-cover" alt={p.name} /> : <div className="w-full h-full flex items-center justify-center text-slate-700 text-2xl">👤</div>}
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-white uppercase truncate max-w-[150px]">{p.name}</h4>
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{p.position}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <select 
                      onChange={e => setRosterGameSelection({...rosterGameSelection, [p.id]: e.target.value})} 
                      className="w-full bg-slate-800/50 border border-white/5 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">Selecione a partida...</option>
                      {games.map(g => <option key={g.id} value={g.id}>{g.homeTeam} vs {g.awayTeam} ({g.date})</option>)}
                    </select>
                    <label className={`block w-full text-center py-3 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all border-2 border-dashed ${rosterGameSelection[p.id] ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-slate-800 text-slate-600 opacity-50'}`}>
                      {loading ? 'Sincronizando...' : 'Vincular Scout JSON'}
                      <input 
                        type="file" 
                        accept=".json" 
                        className="hidden" 
                        disabled={!rosterGameSelection[p.id] || loading} 
                        onChange={e => handlePerformanceUpload(e, p.id, rosterGameSelection[p.id])} 
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentPage === 'analytics' && (
            <div className="space-y-6">
              <div className="bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end shadow-2xl">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Selecionar Jogo</label>
                  <select className="w-full bg-slate-800/40 border border-white/5 rounded-2xl px-5 py-3 text-sm text-white outline-none" value={selectedGameId || ''} onChange={e => { setSelectedGameId(e.target.value); setSelectedPlayerId(null); }}>
                    <option value="">Escolha...</option>
                    {games.map(g => <option key={g.id} value={g.id}>{g.homeTeam} x {g.awayTeam}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Selecionar Atleta</label>
                  <select className="w-full bg-slate-800/40 border border-white/5 rounded-2xl px-5 py-3 text-sm text-white outline-none" disabled={!selectedGameId} value={selectedPlayerId || ''} onChange={e => setSelectedPlayerId(e.target.value)}>
                    <option value="">Escolha...</option>
                    {players.filter(p => performances.some(perf => perf.playerId === p.id && perf.gameId === selectedGameId)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 lg:col-span-2">
                   <button onClick={() => setShowAIModal(true)} disabled={!selectedPerformance} className="flex-grow bg-emerald-600 text-white font-black py-3 px-6 rounded-2xl text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-20">Relatório de IA</button>
                   <button onClick={() => window.print()} disabled={!selectedPerformance} className="bg-white text-slate-900 font-black py-3 px-6 rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all shadow-xl disabled:opacity-20">Imprimir PDF</button>
                </div>
              </div>

              {selectedPerformance ? (
                <div className="animate-in fade-in slide-in-from-top-4 duration-700 space-y-6">
                  <div className="bg-slate-900 p-8 rounded-[3rem] border border-white/5 flex flex-col md:flex-row items-center gap-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-50"></div>
                    <div className="w-32 h-32 rounded-[2rem] bg-slate-800 overflow-hidden border-4 border-emerald-500/10 shadow-2xl relative z-10">
                      {selectedPerformance.analysis.player.photoUrl ? (
                        <img src={selectedPerformance.analysis.player.photoUrl} className="w-full h-full object-cover" alt={selectedPerformance.analysis.player.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700 text-4xl">👤</div>
                      )}
                    </div>
                    <div className="text-center md:text-left relative z-10">
                      <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2 leading-none">
                        {selectedPerformance.analysis.player.name}
                      </h2>
                      <div className="flex items-center justify-center md:justify-start gap-3">
                        <span className="px-4 py-1.5 bg-emerald-500 text-white text-[11px] font-black uppercase rounded-xl tracking-widest shadow-xl shadow-emerald-500/20">
                          {selectedPerformance.analysis.player.position}
                        </span>
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                          {games.find(g => g.id === selectedGameId)?.competition}
                        </span>
                      </div>
                    </div>
                    <div className="ml-auto text-center bg-emerald-500/10 p-8 rounded-[2.5rem] border border-emerald-500/20 shadow-xl relative z-10">
                      <p className="text-[10px] font-black text-emerald-500 mb-2 tracking-widest">RATING SCOUT</p>
                      <p className="text-6xl font-black text-white italic tracking-tighter leading-none">
                        {selectedPerformance.analysis.stats.rating.toFixed(1)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-12 lg:col-span-8 bg-slate-900/40 p-1 rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                      <PitchHeatmap events={filteredEvents} intensity={15} />
                    </div>
                    <div className="col-span-12 lg:col-span-4 grid grid-cols-1 gap-4">
                      <StatCard label="Gols" value={selectedPerformance.analysis.stats.goals} icon="⚽" color="bg-emerald-500/20 text-emerald-500" isActive={metricFilter === 'goals'} onClick={() => setMetricFilter(metricFilter === 'goals' ? null : 'goals')} />
                      <StatCard label="Assistências" value={selectedPerformance.analysis.stats.assists} icon="🎯" color="bg-blue-500/20 text-blue-500" isActive={metricFilter === 'assists'} onClick={() => setMetricFilter(metricFilter === 'assists' ? null : 'assists')} />
                      <StatCard label="Passes Decisivos" value={selectedPerformance.analysis.stats.keyPasses} icon="🔑" color="bg-yellow-500/20 text-yellow-500" isActive={metricFilter === 'keyPasses'} onClick={() => setMetricFilter(metricFilter === 'keyPasses' ? null : 'keyPasses')} />
                      <StatCard label="Precisão de Passe" value={`${selectedPerformance.analysis.stats.passAccuracy.toFixed(0)}%`} suffix={`(${selectedPerformance.analysis.stats.passes})`} icon="P" color="bg-slate-700/50 text-white" isActive={metricFilter === 'passes'} onClick={() => setMetricFilter(metricFilter === 'passes' ? null : 'passes')} />
                      <StatCard label="Duelos Vencidos" value={selectedPerformance.analysis.stats.duelsWon} suffix={`de ${selectedPerformance.analysis.stats.duels}`} icon="⚔️" color="bg-red-500/20 text-red-500" isActive={metricFilter === 'duels'} onClick={() => setMetricFilter(metricFilter === 'duels' ? null : 'duels')} />
                      <StatCard label="Interceptações" value={selectedPerformance.analysis.stats.interceptions} icon="🛡️" color="bg-purple-500/20 text-purple-500" isActive={metricFilter === 'interceptions'} onClick={() => setMetricFilter(metricFilter === 'interceptions' ? null : 'interceptions')} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-32 text-center bg-slate-900/40 rounded-[3rem] border-2 border-dashed border-slate-800">
                  <p className="text-slate-500 font-medium italic">Dados indisponíveis. Selecione filtros válidos.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showAIModal && selectedPerformance && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
          <div className="bg-slate-900 border border-white/10 w-full max-w-3xl rounded-[3rem] overflow-hidden flex flex-col shadow-2xl max-h-[85vh]">
            <div className="p-10 border-b border-white/5 flex justify-between items-center bg-slate-800/20">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex flex-col items-center justify-center text-white font-black leading-none shadow-lg shadow-emerald-500/30">
                  <span className="text-[8px] uppercase mb-1">Nota</span>
                  <span className="text-2xl italic">{selectedPerformance.analysis.stats.rating.toFixed(1)}</span>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white uppercase italic leading-none">{selectedPerformance.analysis.player.name}</h3>
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-2">IA Gemini 3 Pro • Relatório Técnico</p>
                </div>
              </div>
              <button onClick={() => setShowAIModal(false)} className="p-4 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <div className="p-12 overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950">
              <div className="prose prose-invert max-w-none text-slate-300 font-medium leading-relaxed whitespace-pre-line text-lg italic">
                {selectedPerformance.analysis.aiInsights}
              </div>
            </div>
            <div className="p-8 border-t border-white/5 bg-slate-800/10 text-center">
               <button onClick={() => setShowAIModal(false)} className="px-16 py-4 bg-white text-slate-900 font-black rounded-2xl uppercase text-[10px] tracking-[0.3em] hover:bg-slate-100 transition-all shadow-xl active:scale-95">Fechar Relatório</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
