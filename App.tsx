
import React, { useState, useMemo, useEffect } from 'react';
import { PlayerInfo, RegisteredGame, MatchPerformance } from './types';
import { parseFootballXML } from './services/xmlParser';
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
        id: p.id,
        playerId: p.player_id,
        gameId: p.game_id,
        analysis: p.analysis
      })));
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      showNotification(`Erro ao carregar banco: ${error.message || 'Verifique sua configuração'}`);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(null);
  const [rosterGameSelection, setRosterGameSelection] = useState<Record<string, string>>({});
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handlePerformanceUpload = async (e: React.ChangeEvent<HTMLInputElement>, playerId: string, gameId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    
    reader.onerror = () => {
      showNotification("Erro ao ler o arquivo físico.");
      setLoading(false);
    };

    reader.onload = async (event) => {
      try {
        const xmlString = event.target?.result as string;
        if (!xmlString || xmlString.trim().length === 0) {
          throw new Error("O arquivo XML está vazio.");
        }

        const { events, stats: parsedStats } = parseFootballXML(xmlString);
        
        if (events.length === 0) {
          throw new Error("Não foi possível encontrar eventos no XML. Verifique se o formato está correto.");
        }

        const player = players.find(p => p.id === playerId);
        if (!player) throw new Error("Atleta não encontrado.");

        // Chamar IA para gerar o relatório
        const aiResult = await generateScoutingReport(player, parsedStats);
        const finalStats = { ...parsedStats, rating: aiResult.rating };
        
        const analysisData = {
          player,
          events,
          stats: finalStats,
          aiInsights: aiResult.report
        };

        const { data, error } = await supabase.from('performances').upsert([{
          player_id: playerId,
          game_id: gameId,
          analysis: analysisData
        }], { 
          onConflict: 'player_id,game_id' 
        }).select();

        if (error) throw new Error(`Erro no Banco de Dados: ${error.message}`);

        if (data) {
          setPerformances(prev => [
            ...prev.filter(p => !(p.playerId === playerId && p.gameId === gameId)), 
            {
              id: data[0].id,
              playerId: data[0].player_id,
              gameId: data[0].game_id,
              analysis: data[0].analysis
            }
          ]);
        }
        
        showNotification(`Sucesso! Dados de ${player.name} processados.`);
        
      } catch (err: any) {
        console.error("Process error:", err);
        showNotification(err.message || "Erro inesperado ao processar XML.");
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const savePlayer = async () => {
    if (!newPlayer.name) return;
    setLoading(true);
    try {
      let photoUrl = null;

      if (selectedPhotoFile) {
        const fileExt = selectedPhotoFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('player-photos')
          .upload(fileName, selectedPhotoFile);

        if (uploadError) {
          console.warn("Falha no upload da foto:", uploadError.message);
        } else {
          const { data: urlData } = supabase.storage
            .from('player-photos')
            .getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;
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
        setNewPlayer({ name: '', photoUrl: null, position: 'Meio-Campista' });
        setPhotoPreview(null);
        setSelectedPhotoFile(null);
        showNotification("Jogador cadastrado com sucesso!");
        setCurrentPage('roster');
      }
    } catch (err: any) {
      console.error("Erro ao salvar jogador:", err);
      showNotification(`Erro ao salvar jogador: ${err.message || 'Verifique sua conexão'}`);
    } finally {
      setLoading(false);
    }
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
        setGames(prev => [{ 
          id: data[0].id, 
          homeTeam: data[0].home_team, 
          awayTeam: data[0].away_team, 
          date: data[0].date, 
          competition: data[0].competition 
        }, ...prev]);
        setNewGame({ homeTeam: '', awayTeam: '', date: '', competition: '' });
        showNotification("Partida cadastrada com sucesso!");
        setCurrentPage('analytics');
      }
    } catch (err: any) {
      console.error("Erro ao salvar partida:", err);
      showNotification(`Erro ao salvar partida: ${err.message || 'Verifique sua conexão'}`);
    } finally {
      setLoading(false);
    }
  };

  const deletePlayer = async (id: string) => {
    if (window.confirm("Deseja remover este atleta permanentemente?")) {
      const { error } = await supabase.from('players').delete().eq('id', id);
      if (!error) {
        setPlayers(prev => prev.filter(p => p.id !== id));
        setPerformances(prev => prev.filter(perf => perf.playerId !== id));
        showNotification("Atleta removido.");
      } else {
        showNotification(`Erro ao excluir: ${error.message}`);
      }
    }
  };

  const deleteGame = async (id: string) => {
    if (window.confirm("Deseja remover esta partida permanentemente?")) {
      const { error } = await supabase.from('games').delete().eq('id', id);
      if (!error) {
        setGames(prev => prev.filter(g => g.id !== id));
        setPerformances(prev => prev.filter(perf => perf.gameId !== id));
        showNotification("Partida removida.");
      } else {
        showNotification(`Erro ao excluir: ${error.message}`);
      }
    }
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
        case 'duels': return type.includes('duel') || type.includes('challenge');
        case 'interceptions': return type.includes('interception') || type.includes('recovery');
        case 'tackles': return type.includes('tackle') || type.includes('desarme');
        default: return true;
      }
    });
  }, [selectedPerformance, metricFilter]);

  const renderHome = () => (
    <div className="h-[70vh] flex items-center justify-center">
      <div className="text-center p-12 bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-[3rem] max-w-xl backdrop-blur-md">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-500 border border-emerald-500/20">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeWidth="2.5" /></svg>
        </div>
        <h3 className="text-2xl font-black text-white mb-3">Bem-vindo ao Scout Pro</h3>
        <p className="text-slate-500 mb-8 font-medium italic">Gerencie seu elenco e analise o desempenho tático com inteligência artificial.</p>
        <div className="flex gap-4 justify-center">
          <button onClick={() => setCurrentPage('player')} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all">Novo Atleta</button>
          <button onClick={() => setCurrentPage('game')} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all border border-white/5">Nova Partida</button>
        </div>
      </div>
    </div>
  );

  const renderRoster = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-3xl font-black text-white tracking-tight italic uppercase">Elenco</h3>
          <p className="text-slate-500 font-medium italic">Gestão de atletas e importação de XML.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dataLoading ? (
           <div className="col-span-full py-20 text-center animate-pulse text-slate-500 font-black uppercase tracking-widest">Sincronizando Banco de Dados...</div>
        ) : players.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-500 italic">Nenhum atleta cadastrado.</div>
        ) : players.map(player => {
          const playerGameId = rosterGameSelection[player.id] || "";
          const hasPerformance = performances.some(p => p.playerId === player.id && p.gameId === playerGameId);

          return (
            <div key={player.id} className="bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 backdrop-blur-xl group hover:border-emerald-500/30 transition-all flex flex-col relative">
              <button onClick={() => deletePlayer(player.id)} className="absolute top-4 right-4 p-2 text-slate-700 hover:text-red-500 transition-colors z-10">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 overflow-hidden border border-white/5 flex-shrink-0">
                  {player.photoUrl ? <img src={player.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-700"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg></div>}
                </div>
                <div className="min-w-0">
                  <h4 className="text-lg font-black text-white uppercase truncate">{player.name}</h4>
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{player.position}</p>
                </div>
              </div>
              
              <div className="bg-slate-800/40 p-5 rounded-2xl border border-white/5 space-y-4">
                <select 
                  className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500/50"
                  value={playerGameId}
                  onChange={(e) => setRosterGameSelection(prev => ({ ...prev, [player.id]: e.target.value }))}
                >
                  <option value="">Selecione o jogo...</option>
                  {games.map(game => <option key={game.id} value={game.id}>{game.homeTeam} x {game.awayTeam}</option>)}
                </select>

                <div className="space-y-2">
                  <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer font-black text-[10px] uppercase ${playerGameId ? (hasPerformance ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500 shadow-lg shadow-emerald-500/5' : 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/5') : 'border-slate-800 text-slate-600 opacity-50'}`}>
                    {loading ? 'Processando...' : (hasPerformance ? '✓ Substituir XML' : 'Importar Scout XML')}
                    <input type="file" accept=".xml" className="hidden" disabled={!playerGameId || loading} onChange={(e) => handlePerformanceUpload(e, player.id, playerGameId)} />
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderAnalytics = () => {
    const playersInSelectedGame = players.filter(pl => performances.some(p => p.gameId === selectedGameId && p.playerId === pl.id));
    const selectedGame = games.find(g => g.id === selectedGameId);

    return (
      <div className="space-y-6">
        <div className="bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shadow-2xl items-end">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Partida</label>
            <div className="flex gap-2">
              <select className="w-full bg-slate-800/40 border border-white/5 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500/50" value={selectedGameId || ''} onChange={(e) => { setSelectedGameId(e.target.value); setSelectedPlayerId(null); }}>
                <option value="">Escolha o jogo...</option>
                {games.map(g => <option key={g.id} value={g.id}>{g.homeTeam} x {g.awayTeam} ({g.date})</option>)}
              </select>
              {selectedGameId && (
                <button onClick={() => deleteGame(selectedGameId)} className="p-3 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/20 hover:bg-red-500/20 transition-all">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Atleta</label>
            <select className="w-full bg-slate-800/40 border border-white/5 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500/50" disabled={!selectedGameId} value={selectedPlayerId || ''} onChange={(e) => setSelectedPlayerId(e.target.value)}>
              <option value="">Escolha o atleta...</option>
              {playersInSelectedGame.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
             <button onClick={() => window.print()} disabled={!selectedPerformance} className="flex-grow bg-white text-slate-900 font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest disabled:opacity-20 hover:bg-slate-100 transition-all shadow-xl">Exportar PDF</button>
             {selectedPerformance && (
               <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAIModal(true);
                }} 
                className="bg-emerald-600 text-white font-black py-3 px-6 rounded-2xl text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                 Análise IA
               </button>
             )}
          </div>
        </div>

        {selectedPerformance ? (
          <div className="space-y-6 animate-in fade-in duration-700">
            {/* Perfil Destacado na Análise */}
            <div className="bg-slate-900/60 p-8 rounded-[3rem] border border-white/5 backdrop-blur-xl flex flex-col md:flex-row items-center gap-8 shadow-2xl">
               <div className="w-32 h-32 rounded-[2rem] bg-slate-800 overflow-hidden border-4 border-emerald-500/10 shadow-2xl flex-shrink-0 relative group">
                  <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  {selectedPerformance.analysis.player.photoUrl ? (
                    <img src={selectedPerformance.analysis.player.photoUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-900">
                      <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
                    </div>
                  )}
               </div>
               <div className="text-center md:text-left flex-grow">
                  <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2 leading-none">
                    {selectedPerformance.analysis.player.name}
                  </h2>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                    <span className="px-4 py-1.5 bg-emerald-500 text-white text-[11px] font-black uppercase rounded-xl tracking-widest shadow-xl shadow-emerald-500/20">
                      {selectedPerformance.analysis.player.position}
                    </span>
                    <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="2"/></svg>
                      {selectedGame?.date}
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                      {selectedGame?.homeTeam} vs {selectedGame?.awayTeam}
                    </div>
                  </div>
               </div>
               <div className="flex flex-col items-center justify-center bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] px-8 py-4 shadow-xl">
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Nota Partida</span>
                  <span className="text-5xl font-black text-white italic tracking-tighter">{selectedPerformance.analysis.stats.rating.toFixed(1)}</span>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7">
                  <div className="bg-slate-900/40 p-1 rounded-[2.5rem] border border-white/5 overflow-hidden sticky top-24 shadow-2xl">
                    <PitchHeatmap events={filteredEvents} intensity={15} />
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-slate-900/60 p-6 rounded-[2.5rem] border border-white/5 shadow-xl">
                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                      Scout Detalhado
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="Gols" value={selectedPerformance.analysis.stats.goals} icon="⚽" color="bg-emerald-500/20 text-emerald-500" isActive={metricFilter === 'goals'} onClick={() => setMetricFilter(metricFilter === 'goals' ? null : 'goals')} />
                      <StatCard label="Assistências" value={selectedPerformance.analysis.stats.assists} icon="🎯" color="bg-blue-500/20 text-blue-500" isActive={metricFilter === 'assists'} onClick={() => setMetricFilter(metricFilter === 'assists' ? null : 'assists')} />
                      <StatCard label="Passes Decisivos" value={selectedPerformance.analysis.stats.keyPasses} icon="🔑" color="bg-yellow-500/20 text-yellow-500" isActive={metricFilter === 'keyPasses'} onClick={() => setMetricFilter(metricFilter === 'keyPasses' ? null : 'keyPasses')} />
                      <StatCard label="Total de Passes" value={selectedPerformance.analysis.stats.passes} suffix={`(${selectedPerformance.analysis.stats.passAccuracy.toFixed(0)}%)`} icon="P" color="bg-slate-700/50 text-white" isActive={metricFilter === 'passes'} onClick={() => setMetricFilter(metricFilter === 'passes' ? null : 'passes')} />
                      <StatCard label="Duelos Vencidos" value={selectedPerformance.analysis.stats.duelsWon} icon="⚔️" color="bg-red-500/20 text-red-500" isActive={metricFilter === 'duels'} onClick={() => setMetricFilter(metricFilter === 'duels' ? null : 'duels')} />
                      <StatCard label="Chutes (Alvo)" value={`${selectedPerformance.analysis.stats.shotsOnTarget}/${selectedPerformance.analysis.stats.shots}`} icon="⚡" color="bg-orange-500/20 text-orange-500" isActive={metricFilter === 'shots'} onClick={() => setMetricFilter(metricFilter === 'shots' ? null : 'shots')} />
                      <StatCard label="Interceptações" value={selectedPerformance.analysis.stats.interceptions} icon="🛡️" color="bg-purple-500/20 text-purple-500" isActive={metricFilter === 'interceptions'} onClick={() => setMetricFilter(metricFilter === 'interceptions' ? null : 'interceptions')} />
                      <StatCard label="Desarmes" value={selectedPerformance.analysis.stats.tackles} icon="🧤" color="bg-cyan-500/20 text-cyan-500" isActive={metricFilter === 'tackles'} onClick={() => setMetricFilter(metricFilter === 'tackles' ? null : 'tackles')} />
                    </div>
                    <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/5">
                        <p className="text-[10px] text-slate-500 font-medium italic">Clique em um card para filtrar as ações no mapa de calor acima.</p>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        ) : <p className="text-center py-20 text-slate-500 italic font-medium">Selecione uma partida e um atleta para carregar o relatório.</p>}
      </div>
    );
  };

  const renderAIModal = () => {
    if (!selectedPerformance || !showAIModal) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in zoom-in duration-300">
        <div className="bg-slate-900 border border-white/10 w-full max-w-3xl rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div className="p-8 border-b border-white/5 flex items-center justify-between bg-slate-800/20">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex flex-col items-center justify-center text-white font-black shadow-lg shadow-emerald-500/20">
                <span className="text-[8px] leading-none uppercase">Nota</span>
                <span className="text-xl italic leading-none">{selectedPerformance.analysis.stats.rating.toFixed(1)}</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase italic leading-none">{selectedPerformance.analysis.player.name}</h3>
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">Inteligência Artificial Gemini 3</p>
              </div>
            </div>
            <button onClick={() => setShowAIModal(false)} className="p-3 bg-white/5 rounded-full text-slate-400 hover:text-white transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div className="p-10 overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950">
            <div className="prose prose-invert max-w-none text-slate-300 font-medium leading-relaxed whitespace-pre-line text-base italic">
              {selectedPerformance.analysis.aiInsights}
            </div>
          </div>
          <div className="p-8 bg-slate-800/10 border-t border-white/5 text-center">
             <button onClick={() => setShowAIModal(false)} className="px-14 py-4 bg-white text-slate-900 font-black rounded-2xl uppercase text-xs tracking-widest hover:bg-slate-100 transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98]">Fechar Relatório</button>
          </div>
        </div>
      </div>
    );
  };

  const renderRegisterPlayer = () => (
    <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl backdrop-blur-md">
        <h3 className="text-2xl font-black text-white mb-6 uppercase italic flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center"><svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="3" strokeLinecap="round"/></svg></div>
          Novo Atleta
        </h3>
        <div className="space-y-5">
          <div className="space-y-1">
             <label className="text-[10px] font-black text-emerald-500 uppercase px-4 tracking-widest">Nome Completo</label>
             <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" placeholder="Ex: Cristiano Ronaldo" value={newPlayer.name} onChange={(e) => setNewPlayer(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-black text-emerald-500 uppercase px-4 tracking-widest">Posição Principal</label>
             <select className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" value={newPlayer.position} onChange={(e) => setNewPlayer(p => ({ ...p, position: e.target.value }))}>
               <option>Goleiro</option><option>Zagueiro</option><option>Lateral</option><option>Meio-Campista</option><option>Extremo</option><option>Atacante</option>
             </select>
          </div>
          <div className="flex items-center gap-6 p-5 bg-slate-800/20 rounded-3xl border border-white/5">
            <div className="w-24 h-24 rounded-2xl bg-slate-900 overflow-hidden border border-white/10 flex-shrink-0 flex items-center justify-center shadow-inner">
              {photoPreview ? <img src={photoPreview} className="w-full h-full object-cover" /> : <div className="text-slate-700 font-black text-[10px] uppercase text-center p-3 opacity-50">Sem<br/>Foto</div>}
            </div>
            <div className="flex-grow">
              <label className="block w-full bg-emerald-500/10 border border-emerald-500/30 px-4 py-4 text-center rounded-2xl text-[11px] font-black uppercase cursor-pointer text-emerald-400 hover:bg-emerald-500/20 transition-all shadow-sm">
                Selecionar Imagem
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
              <p className="text-[9px] text-slate-600 mt-2 italic">* A imagem será armazenada no seu bucket do Supabase.</p>
            </div>
          </div>
          <button onClick={savePlayer} disabled={loading || !newPlayer.name} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl uppercase text-xs tracking-[0.2em] mt-4 shadow-xl shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]">
            {loading ? 'Sincronizando...' : 'Finalizar Cadastro'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderRegisterGame = () => (
    <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl backdrop-blur-md">
        <h3 className="text-2xl font-black text-white mb-6 uppercase italic flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center"><svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5h8M11 12h8M11 19h8M5 5h1v1H5V5zm0 7h1v1H5v-1zm0 7h1v1H5v-1z" strokeWidth="3" strokeLinecap="round"/></svg></div>
          Registrar Partida
        </h3>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
               <label className="text-[10px] font-black text-emerald-500 uppercase px-4 tracking-widest">Mandante</label>
               <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" placeholder="Ex: Porto" value={newGame.homeTeam} onChange={(e) => setNewGame(g => ({ ...g, homeTeam: e.target.value }))} />
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-black text-emerald-500 uppercase px-4 tracking-widest">Visitante</label>
               <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" placeholder="Ex: Benfica" value={newGame.awayTeam} onChange={(e) => setNewGame(g => ({ ...g, awayTeam: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-black text-emerald-500 uppercase px-4 tracking-widest">Data do Confronto</label>
             <input type="date" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" value={newGame.date} onChange={(e) => setNewGame(g => ({ ...g, date: e.target.value }))} />
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-black text-emerald-500 uppercase px-4 tracking-widest">Nome da Competição</label>
             <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" placeholder="Ex: Copa Libertadores" value={newGame.competition} onChange={(e) => setNewGame(g => ({ ...g, competition: e.target.value }))} />
          </div>
          <button onClick={saveGame} disabled={loading || !newGame.homeTeam} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl uppercase text-xs tracking-[0.2em] mt-4 shadow-xl shadow-emerald-600/20 transition-all disabled:opacity-50 transform active:scale-[0.98]">
            {loading ? 'Sincronizando...' : 'Salvar Partida'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex overflow-hidden font-inter">
      {renderAIModal()}
      <aside className={`border-r border-white/5 bg-slate-900/40 w-64 flex flex-col h-screen sticky top-0 transition-all duration-300 z-50 ${isSidebarOpen ? 'ml-0' : '-ml-64'}`}>
        <div className="p-7">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30"><svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeWidth="2.5" /></svg></div>
            <h1 className="text-lg font-black text-white italic tracking-tighter uppercase leading-none">Scout<br/>Pro</h1>
          </div>
          <nav className="space-y-1">
            <button onClick={() => setCurrentPage('home')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'home' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}>Início</button>
            <button onClick={() => setCurrentPage('roster')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'roster' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}>Elenco</button>
            <button onClick={() => setCurrentPage('analytics')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'analytics' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}>Análises</button>
            <div className="pt-6 pb-2 px-4 text-[8px] font-black text-slate-600 uppercase tracking-widest">Registros</div>
            <button onClick={() => setCurrentPage('player')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'player' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}>Novo Atleta</button>
            <button onClick={() => setCurrentPage('game')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'game' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}>Novo Jogo</button>
          </nav>
        </div>
      </aside>

      <div className="flex-grow flex flex-col h-screen overflow-y-auto bg-slate-950/20">
        {successMessage && <div className="fixed top-8 right-8 z-[110] bg-emerald-500 text-white px-8 py-5 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest animate-in slide-in-from-right-12 duration-500 border border-emerald-400/20">✓ {successMessage}</div>}
        <header className="h-20 border-b border-white/5 flex items-center px-10 bg-slate-900/20 backdrop-blur-md sticky top-0 z-40">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl hover:text-white hover:bg-slate-700 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h8m-8 6h16" strokeWidth="2.5"/></svg>
          </button>
          <div className="ml-auto flex items-center gap-4 bg-white/5 px-5 py-2 rounded-full border border-white/5">
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Análise Ativa</span>
             <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>
          </div>
        </header>
        <main className="p-10 pb-20">
          {currentPage === 'home' && renderHome()}
          {currentPage === 'player' && renderRegisterPlayer()}
          {currentPage === 'game' && renderRegisterGame()}
          {currentPage === 'roster' && renderRoster()}
          {currentPage === 'analytics' && renderAnalytics()}
        </main>
      </div>
    </div>
  );
};

export default App;
