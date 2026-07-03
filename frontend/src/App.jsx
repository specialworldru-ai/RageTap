import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  const [activeTab, setActiveTab] = useState('game'); // 'game' | 'top' | 'rewards'
  
  const [balance, setBalance] = useState(0);
  const [energy, setEnergy] = useState(1000);
  const [maxEnergy, setMaxEnergy] = useState(1000);
  const [clickPower, setClickPower] = useState(1);
  const [totalClicks, setTotalClicks] = useState(0);
  const [claimedRewards, setClaimedRewards] = useState([]);
  
  const [upgradeLevel, setUpgradeLevel] = useState(1);
  const [upgradeCost, setUpgradeCost] = useState(100);
  const [energyLevel, setEnergyLevel] = useState(1);
  const [energyCost, setEnergyCost] = useState(150);

  const [userName, setUserName] = useState('Загрузка...');
  const [userAvatar, setUserAvatar] = useState('👤');
  const [leaderboard, setLeaderboard] = useState([]);

  const [clicks, setClicks] = useState([]);
  const accumulatedClicks = useRef(0);

  const getTelegramId = () => window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 12345;

  const rewardsList = [
    { id: 'req_1k', target: 1000, prize: 500, title: 'Первые шаги', desc: 'Нажми 1,000 раз' },
    { id: 'req_3k', target: 3000, prize: 2000, title: 'Опытный тапер', desc: 'Нажми 3,000 раз' },
    { id: 'req_5k', target: 5000, prize: 5000, title: 'Быстрые пальцы', desc: 'Нажми 5,000 раз' },
    { id: 'req_10k', target: 10000, prize: 15000, title: 'Клик-машина', desc: 'Нажми 10,000 раз' },
    { id: 'req_100k', target: 100000, prize: 200000, title: 'Магнат', desc: 'Нажми 100,000 раз' },
    { id: 'req_1m', target: 1000000, prize: 2500000, title: 'Миллионер', desc: 'Нажми 1,000,000 раз' },
    { id: 'req_1b', target: 1000000000, prize: 5000000000, title: 'Повелитель Кликса', desc: 'Нажми 1 млрд раз' },
    { id: 'req_1t', target: 1000000000000, prize: 999999999999, title: 'Легенда Вселенной', desc: 'Нажми 1 трлн раз' },
  ];

  // Загрузка данных юзера при старте
  useEffect(() => {
    if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
      const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
      setUserName(tgUser.username || tgUser.first_name || 'User');
      if (tgUser.photo_url) setUserAvatar(tgUser.photo_url);
    } else {
      setUserName('Test Account');
    }

    fetch('http://localhost:5000/api/user', {
      headers: { 'X-Telegram-User-Id': getTelegramId().toString() }
    })
      .then(res => res.json())
      .then(data => {
        setBalance(data?.balance ?? 0);
        setEnergy(data?.energy ?? 1000);
        setMaxEnergy(data?.max_energy ?? 1000);
        setClickPower(data?.click_power ?? 1);
        setTotalClicks(data?.total_clicks ?? 0);
        setClaimedRewards(JSON.parse(data?.claimed_rewards || '[]'));
        setUpgradeLevel(data?.click_upgrade_level ?? 1);
        setUpgradeCost(data?.click_upgrade_cost ?? 100);
        setEnergyLevel(data?.energy_upgrade_level ?? 1);
        setEnergyCost(data?.energy_upgrade_cost ?? 150);
      })
      .catch(err => console.error(err));
  }, []);

  // Подгрузка топа лидеров при переключении вкладки
  useEffect(() => {
    if (activeTab === 'top') {
      fetch('http://localhost:5000/api/leaderboard', {
        headers: { 'X-Telegram-User-Id': getTelegramId().toString() }
      })
        .then(res => res.json())
        .then(data => setLeaderboard(data || []))
        .catch(err => console.error(err));
    }
  }, [activeTab]);

  // Синхронизация кликов
  useEffect(() => {
    const interval = setInterval(() => {
      if (accumulatedClicks.current > 0) {
        const clicksToSend = accumulatedClicks.current;
        accumulatedClicks.current = 0;

        fetch('http://localhost:5000/api/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-User-Id': getTelegramId().toString()
          },
          body: JSON.stringify({ clicks: clicksToSend })
        })
        .then(res => res.json())
        .then(data => {
          setBalance(data?.balance ?? 0);
          setEnergy(data?.energy ?? 0);
          setTotalClicks(data?.total_clicks ?? 0);
        })
        .catch(err => {
          accumulatedClicks.current += clicksToSend;
        });
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Реген энергии на фронте
  useEffect(() => {
    const refillInterval = setInterval(() => {
      setEnergy(prev => (prev < maxEnergy ? Math.min(maxEnergy, prev + 3) : prev));
    }, 1000);
    return () => clearInterval(refillInterval);
  }, [maxEnergy]);

  const handleTap = (e) => {
    if (energy - 1 < 0) return;
    setBalance(prev => prev + clickPower);
    setEnergy(prev => Math.max(0, prev - 1));
    setTotalClicks(prev => prev + 1);
    accumulatedClicks.current += 1;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setClicks(prev => [...prev, { id: Date.now() + Math.random(), x, y }]);

    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  };

  const claimReward = (rewardId) => {
    fetch('http://localhost:5000/api/rewards/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-User-Id': getTelegramId().toString()
      },
      body: JSON.stringify({ rewardId })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setBalance(data.balance);
        setClaimedRewards(data.claimedRewards);
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      }
    });
  };

  const handleUpgradeClick = () => {
    if (balance < upgradeCost) return;
    fetch('http://localhost:5000/api/upgrade/click', { method: 'POST', headers: { 'X-Telegram-User-Id': getTelegramId().toString() } })
    .then(res => res.json()).then(data => {
      setBalance(data.balance); setClickPower(data.clickPower); setUpgradeLevel(data.clickUpgradeLevel); setUpgradeCost(data.clickUpgradeCost);
    });
  };

  const handleUpgradeEnergy = () => {
    if (balance < energyCost) return;
    fetch('http://localhost:5000/api/upgrade/energy', { method: 'POST', headers: { 'X-Telegram-User-Id': getTelegramId().toString() } })
    .then(res => res.json()).then(data => {
      setBalance(data.balance); setEnergy(data.energy); setMaxEnergy(data.maxEnergy); setEnergyLevel(data.energyUpgradeLevel); setEnergyCost(data.energyUpgradeCost);
    });
  };

  return (
    <div className="flex flex-col items-center justify-between w-full h-screen bg-[#0f1115] text-white p-4 select-none box-border pb-24">
      
      {/* Инъекция стилей для красивого скроллбара */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>

      {/* Шапка профиля */}
      <div className="w-full max-w-sm flex items-center justify-between bg-[#1e222b] p-3 rounded-2xl border border-white/5 mt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#2c303b] flex items-center justify-center border border-[#3b4252] overflow-hidden text-xl">
            {userAvatar.startsWith('http') ? <img src={userAvatar} alt="avatar" className="w-full h-full object-cover" /> : userAvatar}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-200">{userName}</span>
            <span className="text-[10px] text-amber-400">Всего кликов: {totalClicks.toLocaleString()}</span>
          </div>
        </div>
        <div className="bg-[#242933] px-3 py-1 rounded-xl border border-white/5 text-xs font-bold text-amber-400">
          🪙 {balance.toLocaleString()}
        </div>
      </div>

      {/* ВКЛАДКА 1: САМА ИГРА */}
      {activeTab === 'game' && (
        <>
          <div className="text-center mt-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Баланс монеток</p>
            <h1 className="text-5xl font-black bg-gradient-to-r from-amber-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-md mb-2">
              {balance.toLocaleString()}
            </h1>
            <p className="text-xs text-amber-400/80">Мультитап: +{clickPower}</p>
          </div>

          <div className="relative flex items-center justify-center my-auto">
            <button
              onClick={handleTap}
              className="relative rounded-full bg-gradient-to-b from-[#2c303b] to-[#1a1d24] border-4 border-[#3b4252] shadow-2xl flex items-center justify-center active:scale-95 transition-transform duration-75 outline-none cursor-pointer"
              style={{ touchAction: 'none', width: '220px', height: '220px' }}
            >
              <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-[#1e222b] to-[#3a4050] flex items-center justify-center shadow-inner">
                <span className="text-6xl filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)]">🪙</span>
              </div>
              {clicks.map(c => (
                <span
                  key={c.id}
                  onAnimationEnd={() => setClicks(prev => prev.filter(x => x.id !== c.id))}
                  className="absolute text-3xl font-black text-amber-300 animate-float pointer-events-none z-50"
                  style={{ left: `${c.x}px`, top: `${c.y}px` }}
                >
                  +{clickPower}
                </span>
              ))}
            </button>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleUpgradeClick} disabled={balance < upgradeCost} className={`flex flex-col justify-between items-start p-3 rounded-xl border h-24 ${balance >= upgradeCost ? 'bg-[#1e222b] border-[#3b4252] cursor-pointer' : 'bg-[#14161d] border-white/5 opacity-50'}`}>
                <div className="flex flex-col"><span className="text-xs font-bold">⚡ Мультитап</span><span className="text-[10px] text-gray-400">Ур. {upgradeLevel}</span></div>
                <div className="bg-[#242933] text-xs font-black text-amber-300 py-1 w-full text-center rounded-lg border border-white/5 mt-1">🪙 {upgradeCost.toLocaleString()}</div>
              </button>
              <button onClick={handleUpgradeEnergy} disabled={balance < energyCost} className={`flex flex-col justify-between items-start p-3 rounded-xl border h-24 ${balance >= energyCost ? 'bg-[#1e222b] border-[#3b4252] cursor-pointer' : 'bg-[#14161d] border-white/5 opacity-50'}`}>
                <div className="flex flex-col"><span className="text-xs font-bold">🔋 Лимит</span><span className="text-[10px] text-gray-400">Ур. {energyLevel}</span></div>
                <div className="bg-[#242933] text-xs font-black text-amber-300 py-1 w-full text-center rounded-lg border border-white/5 mt-1">🪙 {energyCost.toLocaleString()}</div>
              </button>
            </div>
            <div className="bg-[#1a1d24] p-3 rounded-2xl border border-white/5">
              <div className="flex justify-between text-xs mb-1"><span>⚡ Энергия</span><span className="font-bold text-amber-400">{energy} / {maxEnergy}</span></div>
              <div className="w-full h-2 bg-[#242933] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${(energy / maxEnergy) * 100}%` }} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ВКЛАДКА 2: ТОП ЛИДЕРОВ */}
      {activeTab === 'top' && (
        <div className="w-full max-w-sm flex-1 flex flex-col mt-4 overflow-hidden">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-black text-amber-400">Зал Славы 🏆</h2>
            <p className="text-xs text-gray-400">Лучшие кликеры по общему количеству тапов</p>
          </div>
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 max-h-[60vh] custom-scrollbar">
            {leaderboard.map((player, index) => {
              const isTop3 = index < 3;
              const bgStyles = index === 0 ? 'bg-gradient-to-r from-amber-500/20 to-yellow-600/10 border-amber-500/40' :
                               index === 1 ? 'bg-gradient-to-r from-slate-400/20 to-slate-500/10 border-slate-400/40' :
                               index === 2 ? 'bg-gradient-to-r from-amber-700/20 to-orange-900/10 border-amber-700/40' :
                               'bg-[#14161d] border-white/5';
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;

              const safeClicks = player?.total_clicks ?? 0;
              const safeBalance = player?.balance ?? 0;

              return (
                <div key={player.telegram_id || index} className={`flex items-center justify-between p-3 rounded-xl border ${bgStyles} transition-all`}>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-black w-6 text-center ${isTop3 ? 'text-xl' : 'text-gray-500'}`}>{medal}</span>
                    <div className="flex flex-col">
                      <span className={`text-sm font-bold ${isTop3 ? 'text-white' : 'text-gray-300'}`}>
                        {player.first_name || player.username || 'Аноним'}
                      </span>
                      <span className="text-[10px] text-gray-500">Баланс: {safeBalance.toLocaleString()} 🪙</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-amber-400">{safeClicks.toLocaleString()}</span>
                    <p className="text-[9px] text-gray-500 uppercase">кликов</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ВКЛАДКА 3: НАГРАДЫ / ДОСТИЖЕНИЯ */}
      {activeTab === 'rewards' && (
        <div className="w-full max-w-sm flex-1 flex flex-col mt-4 overflow-hidden">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-black text-orange-500">Достижения 🎯</h2>
            <p className="text-xs text-gray-400">Выполняй цели по тапам и забирай куш</p>
          </div>
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 max-h-[60vh] custom-scrollbar">
            {rewardsList.map((reward) => {
              const isClaimed = claimedRewards.includes(reward.id);
              const canClaim = totalClicks >= reward.target && !isClaimed;
              const progress = Math.min(100, (totalClicks / reward.target) * 100);

              return (
                <div key={reward.id} className={`p-3 rounded-xl border flex flex-col gap-2 ${isClaimed ? 'bg-[#14161d]/40 border-white/5 opacity-60' : 'bg-[#1e222b] border-white/5'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-black text-gray-200">{reward.title}</h4>
                      <p className="text-[10px] text-gray-400">{reward.desc}</p>
                    </div>
                    <span className="text-xs font-bold text-amber-400 bg-[#242933] px-2 py-0.5 rounded border border-white/5">+{reward.prize} 🪙</span>
                  </div>

                  <div className="w-full flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-[#242933] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[9px] text-gray-400 min-w-[40px] text-right">{progress.toFixed(0)}%</span>
                  </div>

                  <button
                    onClick={() => claimReward(reward.id)}
                    disabled={!canClaim}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isClaimed ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-transparent' :
                      canClaim ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black cursor-pointer shadow-lg active:scale-[0.98]' :
                      'bg-[#242933] text-gray-400 border border-white/5 cursor-not-allowed'
                    }`}
                  >
                    {isClaimed ? 'Получено ✓' : canClaim ? 'Забрать награду! 🎁' : `Нужно еще ${(reward.target - totalClicks).toLocaleString()} кликов`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* НИЖНЕЕ МЕНЮ НАВИГАЦИИ */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-[#161920]/90 backdrop-blur-md border border-white/5 rounded-2xl p-2 flex justify-around items-center shadow-2xl z-50">
        <button onClick={() => setActiveTab('game')} className={`flex flex-col items-center gap-1 flex-1 py-2 rounded-xl transition-all ${activeTab === 'game' ? 'bg-[#242933] text-amber-400 font-bold border border-white/5' : 'text-gray-400'}`}>
          <span className="text-xl">🪙</span>
          <span className="text-[10px]">Игра</span>
        </button>
        <button onClick={() => setActiveTab('top')} className={`flex flex-col items-center gap-1 flex-1 py-2 rounded-xl transition-all ${activeTab === 'top' ? 'bg-[#242933] text-amber-400 font-bold border border-white/5' : 'text-gray-400'}`}>
          <span className="text-xl">🏆</span>
          <span className="text-[10px]">Топ</span>
        </button>
        <button onClick={() => setActiveTab('rewards')} className={`flex flex-col items-center gap-1 flex-1 py-2 rounded-xl transition-all ${activeTab === 'rewards' ? 'bg-[#242933] text-amber-400 font-bold border border-white/5' : 'text-gray-400'}`}>
          <span className="text-xl">🎯</span>
          <span className="text-[10px]">Награды</span>
        </button>
      </div>

    </div>
  );
}