
import React, { useState, useMemo, useEffect } from 'react';
import { PlayerInfo, RegisteredGame, MatchPerformance } from './types';
import { parseFootballXML } from './services/xmlParser';
import { generateScoutingReport } from './services/geminiService';
import { supabase } from './lib/supabase';
import PitchHeatmap from './components/PitchHeatmap';
import StatCard from './components/StatCard';

type Page = 'home' | 'player' | 'game' | 'roster' | 'analytics';
type MetricFilter = 'goals' | 'assists' | 'keyPasses' | 'shots' | 'passes' | 'duels' | 'interceptions' | 'tackles' | null;

// Extend Window interface for AI Studio helpers
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
    process: {
      env: {
        API_KEY?: string;
      };
    };
  }
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showAIModal, setShowAIModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [games, setGames] = useState<RegisteredGame[]>([]);
  const [performances, setPerformances] = useState<MatchPerformance[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Check for API Key at startup
  useEffect(() => {
    const checkKey = async () => {
      // In some environments process.env.API_KEY is pre-configured
      const preConfigured = !!(typeof process !== 'undefined' && process.env.API_KEY);
      if (preConfigured) {
        setHasApiKey(true);
        return;
      }

      // Otherwise check if aistudio selector was used
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        // Fallback for non-aistudio environments
        setHasApiKey(false);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Assume success after triggering the dialog to avoid race conditions
      setHasApiKey(true);
    }
  };

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const { data: pData } = await supabase.from('players').select('*').order('name');
      const { data: gData } = await supabase.from('games').select('*').order('date', { ascending: false });
      const { data: perfData } = await supabase.from('performances').select('*');
      
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
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
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
    setTimeout(() => setSuccessMessage(null), 4000);
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
          throw new Error("Arquivo XML vazio ou inválido.");
        }

        const { events, stats: parsedStats } = parseFootballXML(xmlString);
        
        if (events.length === 0) {
          throw new Error("Nenhum evento detectado no XML. Verifique o formato.");
        }

        const player = players.find(p => p.id === playerId);
        if (!player) throw new Error("Atleta não encontrado no sistema.");

        let aiResult;
        try {
          aiResult = await generateScoutingReport(player, parsedStats);
        } catch (aiErr: any) {
          if (aiErr.message?.includes("Requested entity was not found")) {
            showNotification("API Key expirada ou inválida. Selecione novamente.");
            setHasApiKey(false);
            return;
          }
          if (aiErr.message === "MISSING_API_KEY") {
            showNotification("Configuração de API necessária.");
            setHasApiKey(false);
            return;
          }
          throw aiErr;
        }

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

        if (error) {
          console.error("Supabase error:", error);
          throw new Error(`Erro no Banco: ${error.message}`);
        }

        setPerformances(prev => [
          ...prev.filter(p => !(p.playerId === playerId && p.gameId === gameId)), 
          {
            id: data[0].id,
            playerId: data[0].player_id,
            gameId: data[0].game_id,
            analysis: data[0].analysis
          }
        ]);
        
        showNotification(`Sucesso! Scout de ${player.name} atualizado.`);
        
      } catch (err: any) {
        console.error("Upload process error:", err);
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
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('player-photos')
          .upload(filePath, selectedPhotoFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('player-photos')
          .getPublicUrl(filePath);
        
        photoUrl = urlData.publicUrl;
      }

      const { data, error } = await supabase.from('players').insert([{
        name: newPlayer.name,
        photo_url: photoUrl,
        position: newPlayer.position
      }]).select();

      if (error) throw error;

      setPlayers(prev => [...prev, { ...data[0], photoUrl: data[0].photo_url }]);
      setNewPlayer({ name: '', photoUrl: null, position: 'Meio-Campista' });
      setPhotoPreview(null);
      setSelectedPhotoFile(null);
      showNotification("Jogador cadastrado com sucesso!");
      setCurrentPage('roster');
    } catch (err: any) {
      console.error(err);
      showNotification(`Erro: ${err.message || 'Falha ao salvar'}`);
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

      setGames(prev => [{ 
        id: data[0].id, 
        homeTeam: data[0].home_team, 
        awayTeam: data[0].away_team, 
        date: data[0].date, 
        competition: data[0].competition 
      }, ...prev]);
      setNewGame({ homeTeam: '', awayTeam: '', date: '', competition: '' });
      showNotification("Partida cadastrada!");
      setCurrentPage('analytics');
    } catch (err) {
      showNotification("Erro ao salvar partida.");
    } finally {
      setLoading(false);
    }
  };

  const deletePlayer = async (id: string) => {
    if (window.confirm("Deseja remover este atleta permanentemente? Todos os scouts vinculados serão perdidos.")) {
      const { error } = await supabase.from('players').delete().eq('id', id);
      if (!error) {
        setPlayers(prev => prev.filter(p => p.id !== id));
        setPerformances(prev => prev.filter(perf => perf.playerId !== id));
        showNotification("Atleta removido.");
      } else {
        showNotification("Erro ao excluir atleta.");
      }
    }
  };

  const deleteGame = async (id: string) => {
    if (window.confirm("Deseja remover esta partida?")) {
      const { error } = await supabase.from('games').delete().eq('id', id);
      if (!error) {
        setGames(prev => prev.filter(g => g.id !== id));
        setPerformances(prev => prev.filter(perf => perf.gameId !== id));
        showNotification("Partida removida.");
      } else {
        showNotification("Erro ao excluir partida.");
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

  const renderApiKeySelector = () => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0b1120] p-6">
      <div className="bg-slate-900 border border-white/5 p-12 rounded-[3rem] max-w-md w-full text-center shadow-2xl">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-emerald-500 border border-emerald-500/20">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h2 className="text-2xl font-black text-white mb-4 uppercase italic">Configuração de IA</h2>
        <p className="text-slate-400 mb-8 text-sm font-medium leading-relaxed">
          Para utilizar as análises inteligentes de desempenho, é necessário configurar uma chave de API válida.
        </p>
        <div className="space-y-4">
          <button 
            onClick={handleSelectKey}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs transition-all shadow-lg shadow-emerald-600/20"
          >
            Selecionar API Key
          </button>
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
          >
            Saiba mais sobre faturamento e cotas
          </a>
        </div>
      </div>
    </div>
  );

  const renderHome = () => (
    <div className="h-[70vh] flex items-center justify-center">
      <div className="text-center p-12 bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-[3rem] max-w-xl backdrop-blur-md">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-500 border border-emerald-500/20">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeWidth="1.5"/></svg>
        </div>
        <h3 className="text-2xl font-black text-white mb-3">Scout Pro Cloud</h3>
        <p className="text-slate-500 mb-8 font-medium italic">Seus dados agora estão seguros na nuvem Supabase.</p>
        <div className="flex gap-4 justify-center">
          <button onClick={() => setCurrentPage('player')} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all">Novo Jogador</button>
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
           <div className="col-span-full py-20 text-center animate-pulse text-slate-500 font-black uppercase tracking-widest">Carregando Banco de Dados...</div>
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
                  {hasPerformance ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-black text-[10px] uppercase">
                        ✓ Dados Importados
                      </div>
                      <label className="flex items-center justify-center gap-2 p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer font-black text-[9px] uppercase text-slate-400 hover:text-white">
                        {loading ? 'Lendo...' : 'Substituir XML'}
                        <input type="file" accept=".xml" className="hidden" disabled={loading} onChange={(e) => handlePerformanceUpload(e, player.id, playerGameId)} />
                      </label>
                    </div>
                  ) : (
                    <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer font-black text-[10px] uppercase ${playerGameId ? 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/5' : 'border-slate-800 text-slate-600 opacity-50'}`}>
                      {loading ? 'Lendo XML...' : 'Importar Scout XML'}
                      <input type="file" accept=".xml" className="hidden" disabled={!playerGameId || loading} onChange={(e) => handlePerformanceUpload(e, player.id, playerGameId)} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderAnalytics = () => {
    const sortedGames = [...games];
    const playersInSelectedGame = players.filter(pl => performances.some(p => p.gameId === selectedGameId && p.playerId === pl.id));

    return (
      <div className="space-y-6">
        <div className="bg-slate-900/60 p-6 rounded-[2rem] border border-white/5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shadow-2xl items-end">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Partida</label>
            <div className="flex gap-2">
              <select className="w-full bg-slate-800/40 border border-white/5 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500/50" value={selectedGameId || ''} onChange={(e) => { setSelectedGameId(e.target.value); setSelectedPlayerId(null); }}>
                <option value="">Escolha o jogo...</option>
                {sortedGames.map(g => <option key={g.id} value={g.id}>{g.homeTeam} x {g.awayTeam} ({g.date})</option>)}
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
             <button onClick={() => window.print()} disabled={!selectedPerformance} className="flex-grow bg-white text-slate-900 font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest disabled:opacity-20 hover:bg-slate-100 transition-all">Exportar PDF</button>
             {selectedPerformance && (
               <button onClick={() => setShowAIModal(true)} className="bg-emerald-600 text-white font-black py-3 px-6 rounded-2xl text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                 IA
               </button>
             )}
          </div>
        </div>

        {selectedPerformance ? (
          <div className="space-y-6 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7">
                  <div className="bg-slate-900/40 p-1 rounded-[2.5rem] border border-white/5 overflow-hidden sticky top-24">
                    <PitchHeatmap events={filteredEvents} intensity={15} />
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-slate-900/60 p-6 rounded-[2.5rem] border border-white/5">
                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                      Scout Detalhado
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="Gols" value={selectedPerformance.analysis.stats.goals} icon={<span className="text-[10px] font-black">⚽</span>} color="bg-emerald-500/20 text-emerald-500" isActive={metricFilter === 'goals'} onClick={() => setMetricFilter(metricFilter === 'goals' ? null : 'goals')} />
                      <StatCard label="Assistências" value={selectedPerformance.analysis.stats.assists} icon={<span className="text-[10px] font-black">🎯</span>} color="bg-blue-500/20 text-blue-500" isActive={metricFilter === 'assists'} onClick={() => setMetricFilter(metricFilter === 'assists' ? null : 'assists')} />
                      <StatCard label="Passes Decisivos" value={selectedPerformance.analysis.stats.keyPasses} icon={<span className="text-[10px] font-black">🔑</span>} color="bg-yellow-500/20 text-yellow-500" isActive={metricFilter === 'keyPasses'} onClick={() => setMetricFilter(metricFilter === 'keyPasses' ? null : 'keyPasses')} />
                      <StatCard label="Total de Passes" value={selectedPerformance.analysis.stats.passes} suffix={`(${selectedPerformance.analysis.stats.passAccuracy.toFixed(0)}%)`} icon={<span className="text-[10px] font-black">P</span>} color="bg-slate-700/50 text-white" isActive={metricFilter === 'passes'} onClick={() => setMetricFilter(metricFilter === 'passes' ? null : 'passes')} />
                      <StatCard label="Total de Duelos" value={selectedPerformance.analysis.stats.duels} icon={<span className="text-[10px] font-black">Σ</span>} color="bg-slate-800/80 text-slate-400" />
                      <StatCard label="Duelos Vencidos" value={selectedPerformance.analysis.stats.duelsWon} icon={<span className="text-[10px] font-black">⚔️</span>} color="bg-red-500/20 text-red-500" isActive={metricFilter === 'duels'} onClick={() => setMetricFilter(metricFilter === 'duels' ? null : 'duels')} />
                      <StatCard label="Chutes (Alvo/Total)" value={`${selectedPerformance.analysis.stats.shotsOnTarget}/${selectedPerformance.analysis.stats.shots}`} icon={<span className="text-[10px] font-black">⚡</span>} color="bg-orange-500/20 text-orange-500" isActive={metricFilter === 'shots'} onClick={() => setMetricFilter(metricFilter === 'shots' ? null : 'shots')} />
                      <StatCard label="Interceptações" value={selectedPerformance.analysis.stats.interceptions} icon={<span className="text-[10px] font-black">🛡️</span>} color="bg-purple-500/20 text-purple-500" isActive={metricFilter === 'interceptions'} onClick={() => setMetricFilter(metricFilter === 'interceptions' ? null : 'interceptions')} />
                      <StatCard label="Desarmes" value={selectedPerformance.analysis.stats.tackles} icon={<span className="text-[10px] font-black">🧤</span>} color="bg-cyan-500/20 text-cyan-500" isActive={metricFilter === 'tackles'} onClick={() => setMetricFilter(metricFilter === 'tackles' ? null : 'tackles')} />
                      <div className="bg-emerald-500/10 p-5 rounded-[1.5rem] border border-emerald-500/20 flex flex-col justify-center">
                         <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">RATING FINAL</span>
                         <span className="text-3xl font-black text-white italic">{selectedPerformance.analysis.stats.rating.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        ) : <p className="text-center py-20 text-slate-500 italic font-medium">Selecione uma partida e um atleta para ver a análise completa.</p>}
      </div>
    );
  };

  const renderAIModal = () => {
    if (!selectedPerformance || !showAIModal) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
        <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="p-8 border-b border-white/5 flex items-center justify-between bg-slate-800/20">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500 flex flex-col items-center justify-center text-white font-black">
                <span className="text-[6px] uppercase leading-none">NOTA</span>
                <span className="text-lg italic leading-none">{selectedPerformance.analysis.stats.rating.toFixed(1)}</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase italic leading-none">{selectedPerformance.analysis.player.name}</h3>
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">Scout Profissional IA</p>
              </div>
            </div>
            <button onClick={() => setShowAIModal(false)} className="p-3 rounded-full hover:bg-white/5 text-slate-400 transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div className="p-10 max-h-[60vh] overflow-y-auto">
            <div className="prose prose-invert max-w-none text-slate-300 font-medium leading-relaxed whitespace-pre-line text-sm italic">
              {selectedPerformance.analysis.aiInsights}
            </div>
          </div>
          <div className="p-6 bg-slate-800/10 border-t border-white/5 text-center">
             <button onClick={() => setShowAIModal(false)} className="px-10 py-3 bg-white text-slate-900 font-black rounded-2xl uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all">Fechar Relatório</button>
          </div>
        </div>
      </div>
    );
  };

  const renderRegisterPlayer = () => (
    <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-white/5 backdrop-blur-xl">
        <h3 className="text-2xl font-black text-white mb-6 uppercase italic">Novo Atleta</h3>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-emerald-500 uppercase px-4">Nome</label>
            <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" placeholder="Ex: Lucas Silva" value={newPlayer.name} onChange={(e) => setNewPlayer(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-emerald-500 uppercase px-4">Posição</label>
            <select className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" value={newPlayer.position} onChange={(e) => setNewPlayer(p => ({ ...p, position: e.target.value }))}>
              <option>Goleiro</option><option>Zagueiro</option><option>Lateral</option><option>Meio-Campista</option><option>Extremo</option><option>Atacante</option>
            </select>
          </div>
          
          <div className="flex items-center gap-6 bg-slate-800/30 p-4 rounded-2xl border border-white/5">
            <div className="w-20 h-20 rounded-xl bg-slate-800 overflow-hidden flex-shrink-0 border border-white/5">
              {photoPreview ? <img src={photoPreview} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg></div>}
            </div>
            <div className="flex-grow">
              <label className="block w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-4 py-3 text-center rounded-xl text-[10px] font-black uppercase cursor-pointer transition-all text-emerald-400">
                {selectedPhotoFile ? 'Trocar Foto' : 'Anexar Foto (Bucket)'}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
              <p className="text-[8px] text-slate-500 mt-2 italic">* O bucket 'player-photos' deve ser público no Supabase.</p>
            </div>
          </div>

          <button 
            onClick={savePlayer} 
            disabled={loading || !newPlayer.name}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm mt-4 shadow-lg shadow-emerald-600/20 transition-all"
          >
            {loading ? 'Salvando...' : 'Salvar Cadastro'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderRegisterGame = () => (
    <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-white/5 backdrop-blur-xl">
        <h3 className="text-2xl font-black text-white mb-6 uppercase italic">Registrar Partida</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-emerald-500 uppercase px-4">Time Casa</label>
              <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" placeholder="Ex: Porto" value={newGame.homeTeam} onChange={(e) => setNewGame(g => ({ ...g, homeTeam: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-emerald-500 uppercase px-4">Time Fora</label>
              <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" placeholder="Ex: Benfica" value={newGame.awayTeam} onChange={(e) => setNewGame(g => ({ ...g, awayTeam: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-emerald-500 uppercase px-4">Data</label>
            <input type="date" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" value={newGame.date} onChange={(e) => setNewGame(g => ({ ...g, date: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-emerald-500 uppercase px-4">Competição</label>
            <input type="text" className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50" placeholder="Ex: Campeonato Estadual" value={newGame.competition} onChange={(e) => setNewGame(g => ({ ...g, competition: e.target.value }))} />
          </div>
          <button 
            onClick={saveGame} 
            disabled={loading || !newGame.homeTeam || !newGame.awayTeam}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm mt-4 shadow-lg shadow-emerald-600/20 transition-all"
          >
            {loading ? 'Salvando...' : 'Criar Registro'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex overflow-hidden font-inter">
      {hasApiKey === false && renderApiKeySelector()}
      {renderAIModal()}
      <aside className={`border-r border-white/5 bg-slate-900/40 backdrop-blur-md flex flex-col sticky top-0 h-screen transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="p-7 w-64">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeWidth="2.5" /></svg></div>
            <h1 className="text-lg font-black text-white italic tracking-tighter uppercase leading-none">Scout<br/>Pro</h1>
          </div>
          <nav className="space-y-1">
            <button onClick={() => setCurrentPage('home')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'home' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-white/5'}`}>Início</button>
            <button onClick={() => setCurrentPage('roster')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'roster' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-white/5'}`}>Elenco</button>
            <button onClick={() => setCurrentPage('analytics')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'analytics' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-white/5'}`}>Análises</button>
            <div className="pt-6 pb-2 px-4 text-[8px] font-black text-slate-600 uppercase tracking-widest">Registros</div>
            <button onClick={() => setCurrentPage('player')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'player' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-white/5'}`}>Novo Atleta</button>
            <button onClick={() => setCurrentPage('game')} className={`w-full flex px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentPage === 'game' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-white/5'}`}>Novo Jogo</button>
          </nav>
        </div>
      </aside>

      <div className="flex-grow flex flex-col h-screen overflow-y-auto">
        {successMessage && <div className="fixed top-6 right-6 z-[110] animate-in slide-in-from-right-8 fade-in"><div className="bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl font-bold flex items-center gap-2">✓ {successMessage}</div></div>}
        <header className="h-16 border-b border-white/5 flex items-center px-10 bg-slate-900/20 backdrop-blur-sm sticky top-0 z-40">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h8m-8 6h16" strokeWidth="2.5"/></svg>
          </button>
          <div className="ml-auto text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            Sistema Ativo
            {hasApiKey === false && (
              <button onClick={handleSelectKey} className="ml-4 px-3 py-1 bg-red-500/10 text-red-500 rounded-full border border-red-500/20 text-[8px] hover:bg-red-500/20 transition-all">
                Configurar API
              </button>
            )}
          </div>
        </header>
        <main className="p-8 pb-20">
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
