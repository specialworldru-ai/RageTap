import express from 'express';
import cors from 'cors';
import pg from 'pg'; // Подключаем pg
const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 5000; // Railway сам назначит порт

app.use(cors());
app.use(express.json());

// Подключение к Postgres из Railway (через переменную окружения)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Инициализация таблицы
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

// Реген энергии (используем $1 для параметров в Postgres)
setInterval(async () => {
  await pool.query(`UPDATE users SET energy = LEAST(max_energy, energy + 3) WHERE energy < max_energy`);
}, 1000);

const getUser = async (tgId) => {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgId]);
  return res.rows[0];
};

app.get('/api/user', async (req, res) => {
  try {
    let user = await getUser(req.userId);
    if (!user) {
      await pool.query('INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3)', [req.userId, 'user', 'user']);
      user = await getUser(req.userId);
    }
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sync', async (req, res) => {
  const { clicks } = req.body;
  const user = await getUser(req.userId);
  if (!user || user.energy < clicks) return res.status(400).json({ error: 'Ошибка' });

  const newBalance = user.balance + (clicks * user.click_power);
  const newEnergy = user.energy - clicks;
  const newTotal = (user.total_clicks || 0) + clicks;

  await pool.query(
    'UPDATE users SET balance = $1, energy = $2, total_clicks = $3 WHERE telegram_id = $4',
    [newBalance, newEnergy, newTotal, req.userId]
  );
  res.json({ balance: newBalance, energy: newEnergy, total_clicks: newTotal });
});

// (Остальные роуты переписываются аналогично заменой db.run на await pool.query...)

app.listen(PORT, () => console.log(`🚀 Сервер запущен на ${PORT}`));