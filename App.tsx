
import React, { useState, useMemo, useEffect } from 'react';
import { PlayerInfo, RegisteredGame, MatchPerformance } from './types';
import { parseFootballXML } from './services/xmlParser';
import { generateScoutingReport } from './services/geminiService';
import PitchHeatmap from './components/PitchHeatmap';
import StatCard from './components/StatCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from './lib/supabase';

type Page = 'home' | 'player' | 'game' | 'roster' | 'analytics';
type MetricFilter = 'goals' | 'assists' | 'keyPasses' | 'shots' | 'passes' | 'duels' | 'interceptions' | 'tackles' | null;

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Data Storage (Persisted via Supabase)
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [games, setGames] = useState<RegisteredGame[]>([]);
  const [performances, setPerformances] = useState<MatchPerformance[]>([]);

  // Form States
  const [newPlayer, setNewPlayer] = useState<Omit<PlayerInfo, 'id'>>({
    name: '',
    photoUrl: null,
    position: 'Meio-Campista'
  });
  const [newGame, setNewGame] = useState<Omit<RegisteredGame, 'id'>>({
    homeTeam: '',
    awayTeam: '',
    date: '',
    competition: ''
  });

  // UI States
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'stats' | 'ai'>('heatmap');
  const [heatmapIntensity, setHeatmapIntensity] = useState(15);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(null);
  const [rosterGameSelection, setRosterGameSelection] = useState<Record<string, string>>({});
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // --- PERSISTENCE LOGIC (SUPABASE) ---
  
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from('players').select('*');
    const { data: gData } = await supabase.from('games').select('*');
    const { data: perfData } = await supabase.from('performances').select('*');
    
    if (pData) setPlayers(pData);
    if (gData) setGames(gData);
    if (perfData) setPerformances(perfData);
    setLoading(false);
  };

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handlePerformanceUpload = async (e: React.ChangeEvent<HTMLInputElement>, playerId: string, gameId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const xmlString = event.target?.result as string;
        const { events, stats: parsedStats } = parseFootballXML(xmlString);
        
        const player = players.find(p => p.id === playerId);
        if (!player) return;

        const aiResult = await generateScoutingReport(player, parsedStats);
        const finalStats = { ...parsedStats, rating: aiResult.rating };
        
        const newPerfData = {
          player_id: playerId,
          game_id: gameId,
          analysis: {
            player,
            events,
            stats: finalStats,
            aiInsights: aiResult.report
          }
        };

        const { data, error } = await supabase.from('performances').insert(newPerfData).select().single();
        
        if (error) throw error;
        
        setPerformances(prev => [...prev, data]);
        showNotification(`Sucesso! Scout de ${player.name} salvo na nuvem.`);
        
      } catch (err) {
        console.error("Upload error:", err);
        showNotification("Erro ao processar e salvar arquivo.");
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const deletePerformance = async (playerId: string, gameId: string) => {
    const { error } = await supabase.from('performances').delete().match({ player_id: playerId, game_id: gameId });
    if (!error) {
      setPerformances(prev => prev.filter(p => !(p.playerId === playerId && p.gameId === gameId)));
      showNotification("Scout removido com sucesso.");
    }
  };

  const deletePlayer = async (id: string) => {
    const player = players.find(p => p.id === id);
    if (window.confirm(`Excluir ${player?.name}?`)) {
      const { error } = await supabase.from('players').delete().eq('id', id);
      if (!error) {
        setPlayers(prev => prev.filter(p => p.id !== id));
        setPerformances(prev => prev.filter(perf => perf.playerId !== id));
        showNotification("Atleta removido.");
      }
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('player-photos')
        .upload(filePath, file);

      if (uploadError) {
        showNotification("Erro no upload da imagem");
        setLoading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from('player-photos').getPublicUrl(filePath);
      setNewPlayer(prev => ({ ...prev, photoUrl: publicUrl }));
      setLoading(false);
    }
  };

  const savePlayer = async () => {
    if (!newPlayer.name) return;
    const { data, error } = await supabase.from('players').insert(newPlayer).select().single();
    if (data) {
      setPlayers(prev => [...prev, data]);
      setNewPlayer({ name: '', photoUrl: null, position: 'Meio-Campista' });
      showNotification("Jogador salvo!");
    }
  };

  const saveGame = async () => {
    if (!newGame.homeTeam || !newGame.awayTeam) return;
    const { data, error } = await supabase.from('games').insert(newGame).select().single();
    if (data) {
      setGames(prev => [...prev, data]);
      setNewGame({ homeTeam: '', awayTeam: '', date: '', competition: '' });
      showNotification("Partida agendada!");
    }
  };

  // --- RENDER LOGIC (RETAINED FROM PREVIOUS VERSION) ---

  const selectedPerformance = useMemo(() => 
    performances.find(p => p.gameId === selectedGameId && p.playerId === selectedPlayerId),
    [performances, selectedGameId, selectedPlayerId]
  );

  const filteredEvents = useMemo(() => {
    if (!selectedPerformance) return [];
    if (!metricFilter) return selectedPerformance.analysis.events;

    return selectedPerformance.analysis.events.filter(e => {
      const type = e.type.toLowerCase();
      switch (metricFilter) {
        case 'goals': return (type.includes('goal') || type.includes('golo')) && !type.includes('own');
        case 'assists': return type.includes('assist');
        case 'keyPasses': return type.includes('key pass') || type.includes('decisivo') || type.includes('shot assist');
        case 'shots': return type.includes('shot');
        case 'passes': return type.includes('pass') || type.includes('cross');
        case 'duels': return type.includes('challenge') || type.includes('duel');
        case 'interceptions': return type.includes('recovery') || type.includes('interception');
        case 'tackles': return type.includes('tackle');
        default: return true;
      }
    });
  }, [selectedPerformance, metricFilter]);

  const chartData = useMemo(() => selectedPerformance ? [
    { name: 'Gols', value: selectedPerformance.analysis.stats.goals },
    { name: 'Assist.', value: selectedPerformance.analysis.stats.assists },
    { name: 'P.Decis.', value: selectedPerformance.analysis.stats.keyPasses },
    { name: 'Duelos (V)', value: selectedPerformance.analysis.stats.duelsWon },
    { name: 'On Target', value: selectedPerformance.analysis.stats.shotsOnTarget },
  ] : [], [selectedPerformance]);

  const toggleFilter = (filter: MetricFilter) => {
    setMetricFilter(prev => prev === filter ? null : filter);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const renderHome = () => (
    <div className="h-[70vh] flex items-center justify-center print:hidden">
      <div className="text-center p-12 bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-[3rem] max-w-xl backdrop-blur-md">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-500 shadow-xl shadow-emerald-500/5 border border-emerald-500/20">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        </div>
        <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Scout Cloud Pro</h3>
        <p className="text-slate-500 mb-8 font-medium">Agora seus dados estão seguros na nuvem. Gerencie seu elenco de qualquer lugar.</p>
        <div className="flex flex-wrap gap-4 justify-center">
          <button onClick={() => setCurrentPage('player')} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-500/20">Novo Jogador</button>
          <button onClick={() => setCurrentPage('game')} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 border border-white/5">Nova Partida</button>
        </div>
      </div>
    </div>
  );

  const renderRoster = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 print:hidden">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-3xl font-black text-white tracking-tight">Elenco na Nuvem</h3>
          <p className="text-slate-500 font-medium italic">Dados sincronizados em tempo real.</p>
        </div>
        <button onClick={() => setCurrentPage('player')} className="px-6 py-2.5 bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all">
          Adicionar Jogador
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? <p className="col-span-full text-center text-slate-500 animate-pulse">Carregando dados do servidor...</p> : 
        players.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-slate-900/20 border border-white/5 rounded-[2rem]">
            <p className="text-slate-500 font-medium italic">Nenhum jogador cadastrado.</p>
          </div>
        ) : (
          players.map(player => {
            const playerGameId = rosterGameSelection[player.id] || "";
            const hasPerformance = performances.some(p => p.player_id === player.id && p.game_id === playerGameId);

            return (
              <div key={player.id} className="bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 backdrop-blur-xl group hover:border-emerald-500/30 transition-all flex flex-col relative overflow-hidden">
                <button onClick={() => deletePlayer(player.id)} className="absolute top-4 right-4 p-2 text-slate-700 hover:text-red-500 transition-colors z-10"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                <div className="flex items-center gap-5 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 overflow-hidden border border-white/5 relative">
                    {player.photoUrl ? <img src={player.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-700"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg></div>}
                  </div>
                  <div className="flex-grow overflow-hidden pr-8">
                    <h4 className="text-lg font-black text-white uppercase truncate tracking-tight">{player.name}</h4>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">{player.position}</p>
                  </div>
                </div>
                
                <div className="bg-slate-800/40 p-5 rounded-2xl border border-white/5 space-y-4">
                  <select 
                    className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none"
                    value={playerGameId}
                    onChange={(e) => setRosterGameSelection(prev => ({ ...prev, [player.id]: e.target.value }))}
                  >
                    <option value="">Selecione um jogo...</option>
                    {games.map(game => <option key={game.id} value={game.id}>{game.homeTeam} vs {game.awayTeam} ({game.date})</option>)}
                  </select>

                  <div className="pt-2">
                    {hasPerformance ? (
                      <button onClick={() => deletePerformance(player.id, playerGameId)} className="w-full p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-black text-[10px] uppercase">Remover Scout Cloud</button>
                    ) : (
                      <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer font-black text-[10px] uppercase ${playerGameId && !loading ? 'border-emerald-500/40 text-emerald-500' : 'border-slate-800 text-slate-600 opacity-50'}`}>
                        {loading ? 'Sincronizando...' : 'Enviar XML p/ Nuvem'}
                        <input type="file" accept=".xml" className="hidden" disabled={!playerGameId || loading} onChange={(e) => handlePerformanceUpload(e, player.id, playerGameId)} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const renderAnalytics = () => {
    const sortedGames = [...games].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const playersInSelectedGame = players.filter(pl => performances.some(p => p.game_id === selectedGameId && p.player_id === pl.id));

    return (
      <div className="space-y-6 animate-in fade-in duration-700">
        <div className="relative bg-slate-900/60 backdrop-blur-2xl p-6 rounded-[2rem] border border-white/10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 shadow-2xl print:hidden">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">1. Partida</label>
            <select className="w-full bg-slate-800/40 border border-white/5 rounded-2xl px-5 py-3.5 text-sm text-white" value={selectedGameId || ''} onChange={(e) => { setSelectedGameId(e.target.value); setSelectedPlayerId(null); }}>
              <option value="">Escolha o jogo...</option>
              {sortedGames.map(g => <option key={g.id} value={g.id}>{g.homeTeam} x {g.awayTeam} ({g.date})</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">2. Atleta</label>
            <select className="w-full bg-slate-800/40 border border-white/5 rounded-2xl px-5 py-3.5 text-sm text-white" disabled={!selectedGameId} value={selectedPlayerId || ''} onChange={(e) => setSelectedPlayerId(e.target.value)}>
              <option value="">Escolha o atleta...</option>
              {playersInSelectedGame.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-end"><button onClick={handlePrintReport} disabled={!selectedPerformance} className="w-full bg-white text-slate-900 font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest disabled:opacity-20">Gerar Relatório PDF</button></div>
        </div>

        {selectedPerformance ? (
          <div className="space-y-6 print:space-y-4">
            <div className="bg-slate-900/40 p-5 rounded-[2.5rem] border border-white/5 flex items-center gap-8 print:bg-white print:text-slate-900">
                <div className="w-24 h-24 rounded-3xl bg-slate-800 overflow-hidden border-2 border-white/10">
                  {selectedPerformance.analysis.player.photoUrl && <img src={selectedPerformance.analysis.player.photoUrl} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-grow">
                  <h4 className="text-3xl font-black uppercase italic">{selectedPerformance.analysis.player.name}</h4>
                  <p className="text-emerald-500 font-black text-xs uppercase">{selectedPerformance.analysis.player.position} • {games.find(g => g.id === selectedGameId)?.competition}</p>
                </div>
                <div className="bg-slate-800/40 p-4 rounded-3xl flex items-center gap-4 print:bg-slate-50">
                  <div className="w-16 h-16 rounded-full bg-emerald-500 flex flex-col items-center justify-center text-white">
                    <span className="text-[8px] font-black">SCORE</span>
                    <span className="text-2xl font-black italic">{selectedPerformance.analysis.stats.rating.toFixed(1)}</span>
                  </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 print:grid-cols-12">
                <div className="xl:col-span-8 print:col-span-7"><PitchHeatmap events={filteredEvents} intensity={heatmapIntensity} /></div>
                <div className="xl:col-span-4 space-y-4 print:col-span-5">
                   <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Gols" value={selectedPerformance.analysis.stats.goals} icon={<span className="text-[10px] font-black italic">GOL</span>} color="bg-emerald-600/30" />
                      <StatCard label="Assist." value={selectedPerformance.analysis.stats.assists} icon={<span className="text-[10px] font-black italic">AST</span>} color="bg-blue-600/30" />
                      <StatCard label="Passes Totais" value={selectedPerformance.analysis.stats.passes} icon={<span className="text-[10px] font-black">PAS</span>} color="bg-emerald-500/10" />
                      <StatCard label="Passes Certos" value={selectedPerformance.analysis.stats.passesAccurate} icon={<span className="text-[10px] font-black">ACC</span>} color="bg-emerald-500/10" />
                      <StatCard label="Duelos (V)" value={selectedPerformance.analysis.stats.duelsWon} icon={<span className="text-[10px] font-black">WON</span>} color="bg-amber-500/10" />
                      <StatCard label="Total Duelos" value={selectedPerformance.analysis.stats.duels} icon={<span className="text-[10px] font-black">TOT</span>} color="bg-amber-500/10" />
                   </div>
                   <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 text-sm text-slate-300 print:bg-white print:text-slate-800">
                     <h5 className="text-[10px] font-black text-emerald-500 uppercase mb-2">Análise de IA</h5>
                     {selectedPerformance.analysis.aiInsights}
                   </div>
                </div>
            </div>
          </div>
        ) : <p className="text-center py-20 text-slate-500">Selecione os dados para visualizar o scout.</p>}
      </div>
    );
  };

  const renderRegisterPlayer = () => (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 print:hidden">
      <div className="bg-slate-900/60 p-10 rounded-[3rem] border border-white/5 backdrop-blur-xl">
        <h3 className="text-3xl font-black text-white mb-8 tracking-tight">Cadastrar Jogador</h3>
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Nome Completo</label>
            <input type="text" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder="Ex: Caio Matheus" value={newPlayer.name} onChange={(e) => setNewPlayer(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Posição</label>
            <select className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none" value={newPlayer.position} onChange={(e) => setNewPlayer(p => ({ ...p, position: e.target.value }))}>
              <option>Goleiro</option><option>Zagueiro</option><option>Lateral</option><option>Meio-Campista</option><option>Extremo</option><option>Atacante</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Foto do Atleta</label>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-2xl bg-slate-800 overflow-hidden border border-white/5">
                {newPlayer.photoUrl ? <img src={newPlayer.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="2" /></svg></div>}
              </div>
              <label className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl text-sm font-bold cursor-pointer transition-colors border border-white/5">Upload Foto<input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} /></label>
            </div>
          </div>
          <button onClick={savePlayer} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm mt-4">Salvar Registro Cloud</button>
        </div>
      </div>
    </div>
  );

  const renderRegisterGame = () => (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 print:hidden">
      <div className="bg-slate-900/60 p-10 rounded-[3rem] border border-white/5 backdrop-blur-xl">
        <h3 className="text-3xl font-black text-white mb-8 tracking-tight">Cadastrar Partida</h3>
        <div className="grid grid-cols-2 gap-6">
          <input type="text" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white" placeholder="Time Casa" value={newGame.homeTeam} onChange={(e) => setNewGame(g => ({ ...g, homeTeam: e.target.value }))} />
          <input type="text" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white" placeholder="Time Fora" value={newGame.awayTeam} onChange={(e) => setNewGame(g => ({ ...g, awayTeam: e.target.value }))} />
          <input type="date" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white" value={newGame.date} onChange={(e) => setNewGame(g => ({ ...g, date: e.target.value }))} />
          <input type="text" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white" placeholder="Competição" value={newGame.competition} onChange={(e) => setNewGame(g => ({ ...g, competition: e.target.value }))} />
        </div>
        <button onClick={saveGame} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm mt-8">Finalizar Cadastro Cloud</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex overflow-hidden font-inter print:bg-white print:overflow-visible">
      <aside className={`border-r border-white/5 bg-slate-900/40 backdrop-blur-md flex flex-col flex-shrink-0 sticky top-0 h-screen transition-all duration-300 ease-in-out print:hidden ${isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 pointer-events-none overflow-hidden'}`}>
        <div className="p-7 w-64">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg></div>
            <h1 className="text-lg font-black tracking-tighter text-white italic leading-tight uppercase">Scout Cloud</h1>
          </div>
          <nav className="space-y-1.5">
            <button onClick={() => setCurrentPage('home')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest ${currentPage === 'home' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>HOME</button>
            <button onClick={() => setCurrentPage('player')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${currentPage === 'player' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>Novo Atleta</button>
            <button onClick={() => setCurrentPage('game')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${currentPage === 'game' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>Nova Partida</button>
            <button onClick={() => setCurrentPage('roster')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest ${currentPage === 'roster' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>ELENCO</button>
            <button onClick={() => setCurrentPage('analytics')} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest ${currentPage === 'analytics' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>DADOS</button>
          </nav>
        </div>
      </aside>

      <div className="flex-grow flex flex-col h-screen overflow-y-auto bg-slate-950/20 transition-all duration-300 print:bg-white print:h-auto print:overflow-visible">
        {successMessage && <div className="fixed top-6 right-6 z-[60] animate-in slide-in-from-right-8 fade-in print:hidden"><div className="bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold border border-emerald-400/50">{successMessage}</div></div>}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-slate-900/20 backdrop-blur-sm sticky top-0 z-40 print:hidden">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 rounded-xl bg-slate-800 border border-white/5 text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h8m-8 6h16" /></svg>
          </button>
        </header>
        <main className="p-8 pb-20 print:p-0 print:m-0">
          {currentPage === 'home' && renderHome()}
          {currentPage === 'player' && renderRegisterPlayer()}
          {currentPage === 'game' && renderRegisterGame()}
          {currentPage === 'roster' && renderRoster()}
          {currentPage === 'analytics' && renderAnalytics()}
        </main>
      </div>
      <style>{`
        @media print {
          @page { margin: 0.5cm; size: A4 landscape; }
          .print-hidden, aside, header, nav { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
