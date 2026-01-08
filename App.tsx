import React, { useState, useMemo, useEffect } from 'react';
import { PlayerInfo, RegisteredGame, MatchPerformance } from './types';
import { parseFootballXML } from './services/xmlParser';
import { generateScoutingReport } from './services/geminiService';
import { supabase } from './lib/supabase';

// Tipos locais para navegação
type Page = 'home' | 'player' | 'game' | 'roster' | 'analytics';
type MetricFilter = 'goals' | 'assists' | 'keyPasses' | 'shots' | 'passes' | 'duels' | 'interceptions' | 'tackles' | null;

const App: React.FC = () => {
  // --- ESTADOS ---
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [games, setGames] = useState<RegisteredGame[]>([]);
  const [performances, setPerformances] = useState<MatchPerformance[]>([]);

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
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // --- EFEITOS ---
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const { data: pData } = await supabase.from('players').select('*');
      const { data: gData } = await supabase.from('games').select('*');
      const { data: perfData } = await supabase.from('performances').select('*');
      
      if (pData) {
        // Mapear photo_url do banco para photoUrl do frontend, se necessário
        const mappedPlayers = pData.map((p: any) => ({
          ...p,
          photoUrl: p.photo_url || p.photoUrl // Garante compatibilidade
        }));
        setPlayers(mappedPlayers);
      }
      if (gData) setGames(gData);
      if (perfData) setPerformances(perfData);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // --- FUNÇÕES DE UPLOAD E SALVAMENTO ---

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      if (!supabase.storage) throw new Error("Supabase Storage não inicializado");

      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('player-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage.from('player-photos').getPublicUrl(filePath);
      setNewPlayer(prev => ({ ...prev, photoUrl: publicUrl }));
      showNotification("Foto carregada com sucesso!");
    } catch (err: any) {
      console.error("Photo Upload Error:", err);
      showNotification(`Erro no upload: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const savePlayer = async () => {
    if (!newPlayer.name) return;
    setLoading(true);
    try {
      // CORREÇÃO: Usando 'photo_url' para corresponder à coluna do Supabase
      const { data, error } = await supabase.from('players').insert({
        name: newPlayer.name,
        photo_url: newPlayer.photoUrl, 
        position: newPlayer.position
      }).select().single();
      
      if (error) throw error;
      
      if (data) {
        // Mapeia o retorno do banco para o formato local
        const savedPlayer = {
            ...data,
            photoUrl: data.photo_url
        };
        setPlayers(prev => [...prev, savedPlayer]);
        setNewPlayer({ name: '', photoUrl: null, position: 'Meio-Campista' });
        showNotification("Jogador salvo no banco de dados!");
      }
    } catch (err: any) {
      console.error("Save Player Error:", err);
      showNotification(`Erro ao salvar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveGame = async () => {
    if (!newGame.homeTeam || !newGame.awayTeam) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('games').insert(newGame).select().single();
      if (error) throw error;
      if (data) {
        setGames(prev => [...prev, data]);
        setNewGame({ homeTeam: '', awayTeam: '', date: '', competition: '' });
        showNotification("Partida cadastrada!");
      }
    } catch (err: any) {
      showNotification(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- RENDERIZAÇÃO DAS TELAS ---

  const renderHome = () => (
    <div className="h-[70vh] flex items-center justify-center">
      <div className="text-center p-12 bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-[3rem] max-w-xl backdrop-blur-md">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-500 border border-emerald-500/20">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeWidth="1.5"/></svg>
        </div>
        <h3 className="text-2xl font-black text-white mb-3">Scout Cloud Pro</h3>
        <p className="text-slate-500 mb-8 font-medium">Seus dados agora estão centralizados. Comece cadastrando os atletas do seu clube.</p>
        <div className="flex gap-4 justify-center">
          <button onClick={() => setCurrentPage('player')} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-emerald-500/20">Novo Jogador</button>
          <button onClick={() => setCurrentPage('game')} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all border border-white/5">Nova Partida</button>
        </div>
      </div>
    </div>
  );

  const renderRegisterPlayer = () => (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-slate-900/60 p-10 rounded-[3rem] border border-white/5 backdrop-blur-xl">
        <h3 className="text-3xl font-black text-white mb-8">Cadastrar Jogador</h3>
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-slate-500">Nome Completo</label>
            <input type="text" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder="Ex: Caio Matheus" value={newPlayer.name} onChange={(e) => setNewPlayer(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-slate-500">Posição</label>
            <select className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white appearance-none" value={newPlayer.position} onChange={(e) => setNewPlayer(p => ({ ...p, position: e.target.value }))}>
              <option>Goleiro</option><option>Zagueiro</option><option>Lateral</option><option>Meio-Campista</option><option>Extremo</option><option>Atacante</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-slate-500">Foto do Atleta</label>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-2xl bg-slate-800 overflow-hidden border border-white/5 shadow-inner">
                {newPlayer.photoUrl ? <img src={newPlayer.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="2" /></svg></div>}
              </div>
              <label className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl text-sm font-bold cursor-pointer border border-white/5 transition-all">
                {loading ? 'Subindo...' : 'Escolher Foto'}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={loading} />
              </label>
            </div>
          </div>
          <button onClick={savePlayer} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : 'Finalizar Cadastro'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderRegisterGame = () => (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-slate-900/60 p-10 rounded-[3rem] border border-white/5 backdrop-blur-xl">
        <h3 className="text-3xl font-black text-white mb-8">Cadastrar Partida</h3>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase text-slate-500">Time da Casa</label>
              <input type="text" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder="Ex: Porto Vitória" value={newGame.homeTeam} onChange={(e) => setNewGame(p => ({ ...p, homeTeam: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase text-slate-500">Visitante</label>
              <input type="text" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder="Ex: Flamengo" value={newGame.awayTeam} onChange={(e) => setNewGame(p => ({ ...p, awayTeam: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-slate-500">Data da Partida</label>
            <input type="date" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50" value={newGame.date} onChange={(e) => setNewGame(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase text-slate-500">Competição</label>
            <input type="text" className="bg-slate-800/50 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder="Ex: Copa São Paulo" value={newGame.competition} onChange={(e) => setNewGame(p => ({ ...p, competition: e.target.value }))} />
          </div>
          <button onClick={saveGame} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20">
            {loading ? 'Salvando...' : 'Agendar Partida'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex overflow-hidden font-inter">
      {/* SIDEBAR */}
      <aside className={`border-r border-white/5 bg-slate-900/40 backdrop-blur-md flex flex-col sticky top-0 h-screen transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="p-7 w-64">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center"><svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeWidth="2.5" /></svg></div>
            <h1 className="text-lg font-black text-white italic uppercase">Scout Cloud</h1>
          </div>
          <nav className="space-y-1.5">
            <button onClick={() => setCurrentPage('home')} className={`w-full flex px-4 py-3 rounded-xl text-[11px] font-black uppercase ${currentPage === 'home' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>HOME</button>
            <button onClick={() => setCurrentPage('player')} className={`w-full flex px-4 py-3 rounded-xl text-[11px] font-black uppercase ${currentPage === 'player' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>Novo Atleta</button>
            <button onClick={() => setCurrentPage('game')} className={`w-full flex px-4 py-3 rounded-xl text-[11px] font-black uppercase ${currentPage === 'game' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>Nova Partida</button>
            <button onClick={() => setCurrentPage('roster')} className={`w-full flex px-4 py-3 rounded-xl text-[11px] font-black uppercase ${currentPage === 'roster' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>ELENCO</button>
            <button onClick={() => setCurrentPage('analytics')} className={`w-full flex px-4 py-3 rounded-xl text-[11px] font-black uppercase ${currentPage === 'analytics' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>DADOS</button>
          </nav>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-grow flex flex-col h-screen overflow-y-auto">
        {successMessage && <div className="fixed top-6 right-6 z-[60] animate-in slide-in-from-right-8 fade-in"><div className="bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl font-bold">{successMessage}</div></div>}
        
        <header className="h-20 border-b border-white/5 flex items-center px-10 bg-slate-900/20 backdrop-blur-sm sticky top-0 z-40">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h8m-8 6h16" strokeWidth="2.5"/></svg>
          </button>
        </header>
        
        <main className="p-8">
          {currentPage === 'home' && renderHome()}
          {currentPage === 'player' && renderRegisterPlayer()}
          {currentPage === 'game' && renderRegisterGame()}
          
          {currentPage === 'roster' && <div className="text-center text-slate-500 mt-20">Página de Elenco (Em construção)</div>}
          {currentPage === 'analytics' && <div className="text-center text-slate-500 mt-20">Dashboard de Analytics (Em construção)</div>}
        </main>
      </div>
    </div>
  );
};

export default App;