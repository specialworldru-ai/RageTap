import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'game.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Ошибка подключения к базе данных:', err.message);
  else console.log('📦 Успешное подключение к SQLite (game.db)');
});

// Инициализация таблицы с поддержкой total_clicks и claimed_rewards (храним выполненные в формате JSON)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      balance INTEGER DEFAULT 0,
      energy INTEGER DEFAULT 1000,
      max_energy INTEGER DEFAULT 1000,
      click_power INTEGER DEFAULT 1,
      click_upgrade_level INTEGER DEFAULT 1,
      click_upgrade_cost INTEGER DEFAULT 100,
      energy_upgrade_level INTEGER DEFAULT 1,
      energy_upgrade_cost INTEGER DEFAULT 150,
      total_clicks INTEGER DEFAULT 0,
      claimed_rewards TEXT DEFAULT '[]',
      last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) return;
    // На всякий случай добавляем колонки, если база уже существовала старая
    db.run("ALTER TABLE users ADD COLUMN total_clicks INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE users ADD COLUMN claimed_rewards TEXT DEFAULT '[]'", () => {});
  });
});

// Middleware для Telegram ID
app.use((req, res, next) => {
  const tgIdHeader = req.headers['x-telegram-user-id'];
  if (!tgIdHeader) {
    return res.status(401).json({ error: 'X-Telegram-User-Id заголовок отсутствует' });
  }
  req.userId = parseInt(tgIdHeader, 10);
  next();
});

// Пассивный реген энергии
setInterval(() => {
  db.run(`UPDATE users SET energy = MIN(max_energy, energy + 3) WHERE energy < max_energy`);
}, 1000);

const getUser = (tgId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [tgId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Список доступных наград (цели по кликам и призы в монетах)
const REWARDS_LIST = [
  { id: 'req_1k', target: 1000, prize: 500, title: 'Первые шаги', desc: 'Нажми 1,000 раз' },
  { id: 'req_3k', target: 3000, prize: 2000, title: 'Опытный тапер', desc: 'Нажми 3,000 раз' },
  { id: 'req_5k', target: 5000, prize: 5000, title: 'Быстрые пальцы', desc: 'Нажми 5,000 раз' },
  { id: 'req_10k', target: 10000, prize: 15000, title: 'Клик-машина', desc: 'Нажми 10,000 раз' },
  { id: 'req_100k', target: 100000, prize: 200000, title: 'Магнат', desc: 'Нажми 100,000 раз' },
  { id: 'req_1m', target: 1000000, prize: 2500000, title: 'Миллионер', desc: 'Нажми 1,000,000 раз' },
  { id: 'req_1b', target: 1000000000, prize: 5000000000, title: 'Повелитель Кликса', desc: 'Нажми 1 млрд раз' },
  { id: 'req_1t', target: 1000000000000, prize: 999999999999, title: 'Легенда Вселенной', desc: 'Нажми 1 трлн раз' },
];

// Получение или создание юзера
app.get('/api/user', async (req, res) => {
  const userId = req.userId;
  try {
    let user = await getUser(userId);
    if (!user) {
      db.run(
        `INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)`,
        [userId, 'player_' + userId, 'User'],
        async (err) => {
          if (err) return res.status(500).json({ error: err.message });
          user = await getUser(userId);
          res.json(user);
        }
      );
    } else {
      res.json(user);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Синхронизация кликов (теперь считает и общие клики total_clicks!)
app.post('/api/sync', async (req, res) => {
  const userId = req.userId;
  const { clicks } = req.body;
  if (!clicks || clicks < 0) return res.status(400).json({ error: 'Неверные данные' });
  if (clicks > 100) return res.status(400).json({ error: 'Читерство!' });

  try {
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (user.energy - clicks < 0) return res.status(400).json({ error: 'Недостаточно энергии' });

    const newBalance = user.balance + (clicks * user.click_power);
    const newEnergy = user.energy - clicks;
    const newTotalClicks = (user.total_clicks || 0) + clicks;

    db.run(
      `UPDATE users SET balance = ?, energy = ?, total_clicks = ?, last_sync = CURRENT_TIMESTAMP WHERE telegram_id = ?`,
      [newBalance, newEnergy, newTotalClicks, userId],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ balance: newBalance, energy: newEnergy, total_clicks: newTotalClicks });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// АПГРЕЙДЫ
app.post('/api/upgrade/click', async (req, res) => {
  const userId = req.userId;
  try {
    const user = await getUser(userId);
    if (user.balance < user.click_upgrade_cost) return res.status(400).json({ error: 'Нет монет' });
    const newBalance = user.balance - user.click_upgrade_cost;
    const newLevel = user.click_upgrade_level + 1;
    const newPower = user.click_power + 1;
    const newCost = user.click_upgrade_cost * 2;
    db.run(`UPDATE users SET balance = ?, click_upgrade_level = ?, click_power = ?, click_upgrade_cost = ? WHERE telegram_id = ?`,
      [newBalance, newLevel, newPower, newCost, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ balance: newBalance, energy: user.energy, clickPower: newPower, clickUpgradeLevel: newLevel, clickUpgradeCost: newCost });
      });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/upgrade/energy', async (req, res) => {
  const userId = req.userId;
  try {
    const user = await getUser(userId);
    if (user.balance < user.energy_upgrade_cost) return res.status(400).json({ error: 'Нет монет' });
    const newBalance = user.balance - user.energy_upgrade_cost;
    const newLevel = user.energy_upgrade_level + 1;
    const newMax = user.max_energy + 500;
    const newCost = user.energy_upgrade_cost * 2;
    db.run(`UPDATE users SET balance = ?, energy_upgrade_level = ?, max_energy = ?, energy = ?, energy_upgrade_cost = ? WHERE telegram_id = ?`,
      [newBalance, newLevel, newMax, newMax, newCost, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ balance: newBalance, energy: newMax, maxEnergy: newMax, energyUpgradeLevel: newLevel, energyUpgradeCost: newCost });
      });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. ТОП ЛИДЕРОВ (Сортируем по балансу или кликам - давай по общему количеству кликов!)
app.get('/api/leaderboard', (req, res) => {
  db.all(`SELECT telegram_id, username, first_name, balance, total_clicks FROM users ORDER BY total_clicks DESC LIMIT 10`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 6. ЗАБРАТЬ НАГРАДУ
app.post('/api/rewards/claim', async (req, res) => {
  const userId = req.userId;
  const { rewardId } = req.body;
  const reward = REWARDS_LIST.find(r => r.id === rewardId);
  if (!reward) return res.status(400).json({ error: 'Награда не найдена' });

  try {
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'Юзер не найден' });

    let claimed = JSON.parse(user.claimed_rewards || '[]');
    if (claimed.includes(rewardId)) return res.status(400).json({ error: 'Награда уже получена' });
    if ((user.total_clicks || 0) < reward.target) return res.status(400).json({ error: 'Условие не выполнено' });

    claimed.push(rewardId);
    const newBalance = user.balance + reward.prize;

    db.run(
      `UPDATE users SET balance = ?, claimed_rewards = ? WHERE telegram_id = ?`,
      [newBalance, JSON.stringify(claimed), userId],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, balance: newBalance, claimedRewards: claimed });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на http://localhost:${PORT}`));