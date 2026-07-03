import express from 'express';
import cors from 'cors';
import pg from 'pg';
const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Telegram-User-Id']
}));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id BIGINT PRIMARY KEY,
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
  `);
  console.log('📦 Подключено к Postgres');
};
initDb();

app.use((req, res, next) => {
  const tgIdHeader = req.headers['x-telegram-user-id'];
  if (!tgIdHeader) return res.status(401).json({ error: 'Нет заголовка' });
  req.userId = parseInt(tgIdHeader, 10);
  next();
});

setInterval(async () => {
  await pool.query(`UPDATE users SET energy = LEAST(max_energy, energy + 3) WHERE energy < max_energy`);
}, 1000);

const getUser = async (tgId) => {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgId]);
  return res.rows[0];
};

app.get('/api/user', async (req, res) => {
  let user = await getUser(req.userId);
  if (!user) {
    await pool.query('INSERT INTO users (telegram_id, username) VALUES ($1, $2)', [req.userId, 'user']);
    user = await getUser(req.userId);
  }
  res.json(user);
});

app.get('/api/leaderboard', async (req, res) => {
  const resDb = await pool.query('SELECT first_name, username, balance, total_clicks FROM users ORDER BY total_clicks DESC LIMIT 10');
  res.json(resDb.rows);
});

app.post('/api/sync', async (req, res) => {
  const { clicks } = req.body;
  const user = await getUser(req.userId);
  if (!user) return res.status(400).json({ error: 'User not found' });
  
  const newBalance = user.balance + (clicks * user.click_power);
  const newEnergy = Math.max(0, user.energy - clicks);
  const newTotal = user.total_clicks + clicks;

  await pool.query('UPDATE users SET balance=$1, energy=$2, total_clicks=$3 WHERE telegram_id=$4', [newBalance, newEnergy, newTotal, req.userId]);
  res.json({ balance: newBalance, energy: newEnergy, total_clicks: newTotal });
});

app.post('/api/upgrade/click', async (req, res) => {
  const user = await getUser(req.userId);
  if (user.balance < user.click_upgrade_cost) return res.status(400).json({ error: 'Недостаточно монет' });
  
  await pool.query('UPDATE users SET balance=balance-$1, click_power=click_power+1, click_upgrade_level=click_upgrade_level+1, click_upgrade_cost=click_upgrade_cost*2 WHERE telegram_id=$2', 
    [user.click_upgrade_cost, req.userId]);
  const updated = await getUser(req.userId);
  res.json({ balance: updated.balance, clickPower: updated.click_power, clickUpgradeLevel: updated.click_upgrade_level, clickUpgradeCost: updated.click_upgrade_cost });
});

app.post('/api/upgrade/energy', async (req, res) => {
  const user = await getUser(req.userId);
  if (user.balance < user.energy_upgrade_cost) return res.status(400).json({ error: 'Недостаточно монет' });
  
  await pool.query('UPDATE users SET balance=balance-$1, max_energy=max_energy+500, energy_upgrade_level=energy_upgrade_level+1, energy_upgrade_cost=energy_upgrade_cost*2 WHERE telegram_id=$2', 
    [user.energy_upgrade_cost, req.userId]);
  const updated = await getUser(req.userId);
  res.json({ balance: updated.balance, energy: updated.energy, maxEnergy: updated.max_energy, energyUpgradeLevel: updated.energy_upgrade_level, energyUpgradeCost: updated.energy_upgrade_cost });
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на ${PORT}`));